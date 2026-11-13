import { db } from "@/db";
import {
  automationRules, automationRuns, careerGoals, issues, leaveEntries, leaveTypes,
  notifications, tasks,
} from "@/db/schema";
import { and, desc, eq, gte, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import { audit, handle, ok, ApiError, readJson, requireUser } from "@/lib/api";
import { daysUntil, humanize, todayYMD } from "@/lib/dates";

export type RuleKey = "deadline_reminder" | "overdue_issue" | "weekly_report" | "leave_reminder" | "goal_deadline" | "pending_task";

export const DEFAULT_RULES: { ruleKey: RuleKey; name: string; description: string; leadDays: number }[] = [
  { ruleKey: "deadline_reminder", name: "Upcoming deadline reminders", description: "Notify before issues and tasks fall due.", leadDays: 3 },
  { ruleKey: "overdue_issue", name: "Overdue issue notifications", description: "Alert for any issue past its due date that is not resolved.", leadDays: 0 },
  { ruleKey: "weekly_report", name: "Weekly report generation", description: "Remind you to generate the weekly status report.", leadDays: 0 },
  { ruleKey: "leave_reminder", name: "Upcoming leave reminders", description: "Remind you before approved or planned leave begins.", leadDays: 7 },
  { ruleKey: "goal_deadline", name: "Goal deadline reminders", description: "Notify as career goal target dates approach.", leadDays: 14 },
  { ruleKey: "pending_task", name: "Pending task notifications", description: "Surface tasks that are still open and unscheduled.", leadDays: 0 },
];

async function ensureRules(userId: string) {
  const existing = await db.select().from(automationRules).where(eq(automationRules.userId, userId));
  const missing = DEFAULT_RULES.filter((d) => !existing.some((e) => e.ruleKey === d.ruleKey));
  if (missing.length) {
    await db.insert(automationRules)
      .values(missing.map((m) => ({ userId, ...m })))
      .onConflictDoNothing();
  }
  return db.select().from(automationRules).where(eq(automationRules.userId, userId)).orderBy(automationRules.createdAt);
}

export const GET = handle(async () => {
  const user = await requireUser();
  const rules = await ensureRules(user.id);
  const runs = await db.select().from(automationRuns)
    .where(eq(automationRuns.userId, user.id)).orderBy(desc(automationRuns.ranAt)).limit(25);
  return ok({ rules, runs });
});

/** PATCH — enable/disable or reconfigure a rule. */
export const PATCH = handle(async (req) => {
  const user = await requireUser();
  const body = await readJson<{ id?: string; enabled?: boolean; leadDays?: number; channel?: string }>(req);
  if (!body.id) throw new ApiError(400, "id required");
  const [rule] = await db.select().from(automationRules)
    .where(and(eq(automationRules.id, body.id), eq(automationRules.userId, user.id))).limit(1);
  if (!rule) throw new ApiError(404, "Automation rule not found");

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (body.enabled !== undefined) patch.enabled = !!body.enabled;
  if (body.leadDays !== undefined) {
    const v = Number(body.leadDays);
    if (!Number.isInteger(v) || v < 0 || v > 90) throw new ApiError(400, "leadDays must be 0–90");
    patch.leadDays = v;
  }
  if (body.channel !== undefined) {
    if (!["in_app", "desktop"].includes(String(body.channel))) throw new ApiError(400, "Invalid channel");
    patch.channel = String(body.channel);
  }
  const [row] = await db.update(automationRules).set(patch).where(eq(automationRules.id, body.id)).returning();
  await audit(user.id, "automation", body.id, "updated", patch);
  return ok(row);
});

/**
 * POST { op: "run" | "runOne", ruleId? } — execute enabled automations.
 * Notifications are deduped by `dedupe_key`, so repeated runs never spam.
 */
export const POST = handle(async (req) => {
  const user = await requireUser();
  const body = await readJson<{ op?: string; ruleId?: string }>(req);
  const rules = await ensureRules(user.id);
  const selected = body.ruleId ? rules.filter((r) => r.id === body.ruleId) : rules.filter((r) => r.enabled);
  if (!selected.length) return ok({ ran: 0, generated: 0, details: [] });

  const today = todayYMD();
  const details: { rule: string; generated: number; note: string }[] = [];
  let totalGenerated = 0;

  for (const rule of selected) {
    const pending: { dedupeKey: string; title: string; message: string; category: string }[] = [];
    const horizon = (n: number) => sql`(${today}::date + make_interval(days => ${n}))::date`;

    if (rule.ruleKey === "deadline_reminder") {
      const [iss, tsk] = await Promise.all([
        db.select().from(issues).where(and(eq(issues.userId, user.id), isNull(issues.deletedAt),
          inArray(issues.status, ["backlog", "open", "in_progress", "blocked", "under_review"]),
          gte(issues.dueDate, today), lte(issues.dueDate, horizon(rule.leadDays)))),
        db.select().from(tasks).where(and(eq(tasks.userId, user.id), isNull(tasks.deletedAt), ne(tasks.status, "done"),
          gte(tasks.dueDate, today), lte(tasks.dueDate, horizon(rule.leadDays)))),
      ]);
      for (const i of iss) pending.push({ dedupeKey: `auto:deadline:issue:${i.id}:${i.dueDate}`, title: "Deadline approaching", message: `${i.key} · ${i.title} is due ${humanize(i.dueDate)} (${daysUntil(i.dueDate!)}d).`, category: "issue" });
      for (const t of tsk) pending.push({ dedupeKey: `auto:deadline:task:${t.id}:${t.dueDate}`, title: "Task due soon", message: `${t.title} is due ${humanize(t.dueDate)} (${daysUntil(t.dueDate!)}d).`, category: "task" });
    }

    if (rule.ruleKey === "overdue_issue") {
      const iss = await db.select().from(issues).where(and(eq(issues.userId, user.id), isNull(issues.deletedAt),
        sql`due_date < ${today}`, inArray(issues.status, ["backlog", "open", "in_progress", "blocked", "under_review"])));
      for (const i of iss) pending.push({ dedupeKey: `auto:overdue:${i.id}:${today}`, title: "Overdue issue", message: `${i.key} · ${i.title} was due ${humanize(i.dueDate)}.`, category: "issue" });
    }

    if (rule.ruleKey === "weekly_report") {
      const dow = new Date().getDay();
      const targetDow = Number((rule.config as { dayOfWeek?: number } | null)?.dayOfWeek ?? 5); // Friday
      if (dow === targetDow) {
        pending.push({ dedupeKey: `auto:weekly_report:${today}`, title: "Weekly status report ready to generate", message: "Your week's data is available — open the AI assistant to generate and edit your status report.", category: "report" });
      }
    }

    if (rule.ruleKey === "leave_reminder") {
      const rows = await db.select({ e: leaveEntries, t: leaveTypes }).from(leaveEntries)
        .innerJoin(leaveTypes, eq(leaveEntries.leaveTypeId, leaveTypes.id))
        .where(and(eq(leaveEntries.userId, user.id), inArray(leaveEntries.status, ["approved", "planned", "pending"]),
          gte(leaveEntries.startDate, today), lte(leaveEntries.startDate, horizon(rule.leadDays))));
      for (const { e, t } of rows) pending.push({ dedupeKey: `auto:leave:${e.id}:${e.startDate}`, title: "Leave starting soon", message: `${t.name} begins ${humanize(e.startDate)} (${e.days}d, ${e.status}).`, category: "leave" });
    }

    if (rule.ruleKey === "goal_deadline") {
      const goals = await db.select().from(careerGoals).where(and(eq(careerGoals.userId, user.id), isNull(careerGoals.deletedAt),
        ne(careerGoals.status, "completed"), gte(careerGoals.targetDate, today), lte(careerGoals.targetDate, horizon(rule.leadDays))));
      for (const g of goals) pending.push({ dedupeKey: `auto:goal:${g.id}:${g.targetDate}`, title: "Goal deadline approaching", message: `“${g.title}” targets ${humanize(g.targetDate)} — currently ${g.progress}%.`, category: "goal" });
    }

    if (rule.ruleKey === "pending_task") {
      const tsk = await db.select().from(tasks).where(and(eq(tasks.userId, user.id), isNull(tasks.deletedAt),
        ne(tasks.status, "done"), isNull(tasks.dueDate)));
      for (const t of tsk) pending.push({ dedupeKey: `auto:pending_task:${t.id}:${today.slice(0, 7)}`, title: "Task has no due date", message: `“${t.title}” is still open with no scheduled date.`, category: "task" });
    }

    let generated = 0;
    if (pending.length) {
      const inserted = await db.insert(notifications)
        .values(pending.map((p) => ({ userId: user.id, ...p })))
        .onConflictDoNothing()
        .returning({ id: notifications.id });
      generated = inserted.length;
    }
    totalGenerated += generated;

    await db.insert(automationRuns).values({
      ruleId: rule.id, userId: user.id, generated,
      detail: `${pending.length} candidate(s), ${generated} new notification(s)`,
    });
    await db.update(automationRules).set({ lastRunAt: new Date(), lastRunCount: generated, updatedAt: new Date() })
      .where(eq(automationRules.id, rule.id));

    details.push({ rule: rule.name, generated, note: `${pending.length} candidate(s) evaluated` });
  }

  await audit(user.id, "automation", null, "executed", { rules: selected.length, generated: totalGenerated });
  return ok({ ran: selected.length, generated: totalGenerated, details });
});
