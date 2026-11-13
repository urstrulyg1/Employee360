import { db } from "@/db";
import { careerGoals, employeePreferences, holidays, issues, leaveEntries, leaveTypes, notifications, projects, reminders } from "@/db/schema";
import { and, desc, eq, gte, inArray, isNull, lt, lte, ne, sql } from "drizzle-orm";
import { handle, ok, readJson, requireUser } from "@/lib/api";
import { daysUntil, todayYMD } from "@/lib/dates";

type Rule = { dedupeKey: string; title: string; message: string; category: string };

/**
 * GET /api/notifications
 * Rule-based generation: scans live data every call, inserts new notifications
 * (dedupeKey unique — existing ones are never duplicated), returns them.
 */
export const GET = handle(async () => {
  const user = await requireUser();
  const today = todayYMD();
  const horizon = sql`${today}::date + 14`;
  const holidayHorizon = sql`${today}::date + 10`;

  const [prefs] = await db.select().from(employeePreferences).where(eq(employeePreferences.userId, user.id)).limit(1);

  const [overdue, blocked, dueSoon, reviews, hols, leaves, goals, milestones, rems] = await Promise.all([
    db.select().from(issues).where(and(eq(issues.userId, user.id), isNull(issues.deletedAt),
      sql`due_date < ${today}`, sql`status not in ('resolved','closed')`)).limit(10),
    db.select().from(issues).where(and(eq(issues.userId, user.id), isNull(issues.deletedAt), eq(issues.status, "blocked"))).limit(6),
    db.select().from(issues).where(and(eq(issues.userId, user.id), isNull(issues.deletedAt),
      sql`status not in ('resolved','closed')`, gte(issues.dueDate, today), lt(issues.dueDate, horizon))).limit(10),
    db.select().from(issues).where(and(eq(issues.userId, user.id), isNull(issues.deletedAt), eq(issues.status, "under_review"))).limit(6),
    db.select().from(holidays).where(and(gte(holidays.holidayDate, today), lt(holidays.holidayDate, holidayHorizon))).limit(5),
    db.select({ entry: leaveEntries, type: leaveTypes }).from(leaveEntries).innerJoin(leaveTypes, eq(leaveEntries.leaveTypeId, leaveTypes.id))
      .where(and(eq(leaveEntries.userId, user.id), gte(leaveEntries.startDate, today),
        lte(leaveEntries.startDate, sql`${today}::date + 14`), inArray(leaveEntries.status, ["approved", "planned", "pending"]))).limit(8),
    db.select().from(careerGoals).where(and(eq(careerGoals.userId, user.id), isNull(careerGoals.deletedAt),
      ne(careerGoals.status, "completed"), gte(careerGoals.targetDate, today), lte(careerGoals.targetDate, sql`${today}::date + 21`))).limit(6),
    db.select().from(projects).where(and(eq(projects.userId, user.id), isNull(projects.deletedAt),
      gte(projects.targetDate, today), lte(projects.targetDate, sql`${today}::date + 14`))).limit(4),
    db.select().from(reminders).where(and(eq(reminders.userId, user.id), eq(reminders.enabled, true),
      lte(reminders.remindAt, sql`now() + interval '7 days'`))).limit(6),
  ]);

  const rules: Rule[] = [];
  if (prefs?.notifyIssueDeadlines !== false) {
    for (const i of overdue) rules.push({ dedupeKey: `overdue:${i.id}:${today}`, title: "Overdue issue", message: `${i.key} · ${i.title} was due ${i.dueDate}.`, category: "issue" });
    for (const i of dueSoon) rules.push({ dedupeKey: `due:${i.id}:${i.dueDate}`, title: "Approaching deadline", message: `${i.key} · ${i.title} is due in ${daysUntil(i.dueDate!)} day(s).`, category: "issue" });
    for (const i of reviews) rules.push({ dedupeKey: `review:${i.id}:${today}`, title: "Pending review", message: `${i.key} · ${i.title} is waiting for review.`, category: "issue" });
  }
  for (const i of blocked) rules.push({ dedupeKey: `blocked:${i.id}:${today}`, title: "Blocked issue", message: `${i.key} · ${i.title} is currently blocked.`, category: "issue" });
  if (prefs?.notifyHolidays !== false) {
    for (const h of hols) rules.push({ dedupeKey: `holiday:${h.id}:${h.holidayDate}`, title: "Upcoming holiday", message: `${h.name} in ${daysUntil(h.holidayDate)} day(s) — ${h.holidayDate}.`, category: "holiday" });
  }
  if (prefs?.notifyLeaves !== false) {
    for (const { entry, type } of leaves) rules.push({ dedupeKey: `leave:${entry.id}:${entry.startDate}`, title: entry.status === "approved" ? "Approved leave coming up" : entry.status === "pending" ? "Leave awaiting approval" : "Planned leave", message: `${type.name} · ${entry.startDate} → ${entry.endDate} (${entry.days}d).`, category: "leave" });
  }
  if (prefs?.notifyGoals !== false) {
    for (const g of goals) rules.push({ dedupeKey: `goal:${g.id}:${g.targetDate}`, title: "Goal deadline approaching", message: `“${g.title}” targets ${g.targetDate} — ${g.progress}% done.`, category: "goal" });
  }
  for (const p of milestones) rules.push({ dedupeKey: `milestone:${p.id}:${p.targetDate}`, title: "Milestone ahead", message: `${p.name} targets ${p.targetDate}.`, category: "milestone" });
  for (const r of rems) rules.push({ dedupeKey: `reminder:${r.id}:${today}`, title: "Reminder", message: r.title, category: "reminder" });

  if (rules.length) {
    await db.insert(notifications)
      .values(rules.map((r) => ({ userId: user.id, ...r })))
      .onConflictDoNothing();
  }

  const [rows, unread] = await Promise.all([
    db.select().from(notifications).where(eq(notifications.userId, user.id)).orderBy(desc(notifications.createdAt)).limit(80),
    db.select({ value: sql<number>`count(*)::int` }).from(notifications)
      .where(and(eq(notifications.userId, user.id), eq(notifications.isRead, false))),
  ]);

  return ok({ data: rows, unread: unread[0]?.value ?? 0 });
});

/** PATCH — { ids?: string[], all?: boolean, action: 'read'|'clear' } */
export const PATCH = handle(async (req) => {
  const user = await requireUser();
  const body = await readJson<{ ids?: string[]; all?: boolean; action: string }>(req);
  const action = body.action ?? "read";

  if (action === "clear") {
    if (body.all) await db.delete(notifications).where(eq(notifications.userId, user.id));
    else if (body.ids?.length) await db.delete(notifications).where(and(inArray(notifications.id, body.ids), eq(notifications.userId, user.id)));
    return ok({ cleared: true });
  }

  const now = new Date();
  if (body.all) {
    await db.update(notifications).set({ isRead: true, readAt: now }).where(eq(notifications.userId, user.id));
  } else if (body.ids?.length) {
    await db.update(notifications).set({ isRead: true, readAt: now })
      .where(and(inArray(notifications.id, body.ids), eq(notifications.userId, user.id)));
  }
  return ok({ updated: true });
});
