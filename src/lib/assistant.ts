/**
 * Grounded AI assistant engine.
 *
 * Design contract:
 *  - Every answer is derived from rows the user actually owns in PostgreSQL.
 *  - Each answer returns `sources`: the concrete records used to produce it.
 *  - If there is no data, the assistant says so. It never invents work,
 *    achievements, commits or numbers.
 *  - An external LLM is OPTIONAL. When a provider key is configured, the LLM
 *    is only allowed to re-phrase the retrieved facts (it receives the facts,
 *    never raw DB credentials, and cannot add new records).
 */

import { db } from "@/db";
import * as s from "@/db/schema";
import { and, desc, eq, gte, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import { todayYMD, humanize } from "@/lib/dates";
import { label } from "@/lib/domain";
import { addDays, format, startOfWeek, subDays } from "date-fns";

export type Source = { kind: string; ref: string; label: string; href?: string };
export type AnswerBlock = { heading?: string; lines: string[] };
export type Answer = {
  intent: string;
  title: string;
  blocks: AnswerBlock[];
  sources: Source[];
  markdown: string;
  provider: "grounded" | "llm";
  note?: string;
};

export const INTENTS = [
  "last_week_work", "overdue", "month_accomplishments", "projects_attention",
  "weekly_status_report", "technical_contributions", "upcoming_holidays",
  "leave_summary", "workload", "meetings_followups", "help",
] as const;
export type Intent = (typeof INTENTS)[number];

/** Lightweight deterministic intent routing (keyword scoring, no guessing). */
export function detectIntent(qRaw: string): Intent {
  const q = qRaw.toLowerCase();
  const has = (...w: string[]) => w.some((x) => q.includes(x));

  if (has("overdue", "late", "past due", "missed deadline")) return "overdue";
  if (has("last week", "previous week", "past week")) return "last_week_work";
  if (has("status report", "weekly report", "weekly status", "generate my report", "status update")) return "weekly_status_report";
  if (has("accomplish", "achieved", "this month", "monthly summary")) return "month_accomplishments";
  if (has("attention", "at risk", "which project", "projects need")) return "projects_attention";
  if (has("technical contribution", "contributions", "tech contribution", "summarize my technical")) return "technical_contributions";
  if (has("holiday", "holidays")) return "upcoming_holidays";
  if (has("leave", "time off", "vacation", "pto")) return "leave_summary";
  if (has("workload", "capacity", "how busy", "bandwidth", "hours")) return "workload";
  if (has("meeting", "1:1", "one-on-one", "follow up", "action item")) return "meetings_followups";
  if (has("help", "what can you")) return "help";
  return "weekly_status_report";
}

const OPEN_STATES = ["backlog", "open", "in_progress", "blocked", "under_review"];
const DONE_STATES = ["resolved", "closed"];

function md(blocks: AnswerBlock[], title: string) {
  const parts = [`## ${title}`];
  for (const b of blocks) {
    if (b.heading) parts.push(`\n**${b.heading}**`);
    parts.push(b.lines.length ? b.lines.map((l) => `- ${l}`).join("\n") : "_No records found._");
  }
  return parts.join("\n");
}

/** Core retrieval + composition. All numbers come from SQL aggregates. */
export async function answerQuestion(userId: string, question: string): Promise<Answer> {
  const intent = detectIntent(question);
  const today = todayYMD();
  const sources: Source[] = [];
  const blocks: AnswerBlock[] = [];
  let title = "";

  const ownIssues = and(eq(s.issues.userId, userId), isNull(s.issues.deletedAt));
  const ownTasks = and(eq(s.tasks.userId, userId), isNull(s.tasks.deletedAt));

  switch (intent) {
    case "last_week_work": {
      const from = format(subDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 7), "yyyy-MM-dd");
      const to = format(subDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 1), "yyyy-MM-dd");
      title = `Work between ${humanize(from)} and ${humanize(to)}`;
      const [journals, doneTasks, movedIssues] = await Promise.all([
        db.select().from(s.dailyJournals).where(and(eq(s.dailyJournals.userId, userId), gte(s.dailyJournals.journalDate, from), lte(s.dailyJournals.journalDate, to))).orderBy(s.dailyJournals.journalDate),
        db.select().from(s.tasks).where(and(ownTasks, gte(s.tasks.completedAt, new Date(from)), lte(s.tasks.completedAt, new Date(to + "T23:59:59")))),
        db.select().from(s.issues).where(and(ownIssues, gte(s.issues.updatedAt, new Date(from)), lte(s.issues.updatedAt, new Date(to + "T23:59:59")))).limit(12),
      ]);
      const hours = journals.reduce((a, j) => a + Number(j.timeSpentHours || 0), 0);
      blocks.push({ heading: "Journal summaries", lines: journals.map((j) => `${humanize(j.journalDate)} — ${j.summary ?? "(no summary)"} (${j.timeSpentHours}h)`) });
      blocks.push({ heading: "Tasks completed", lines: doneTasks.map((t) => t.title) });
      blocks.push({ heading: "Issues touched", lines: movedIssues.map((i) => `${i.key} · ${i.title} [${label(i.status)}]`) });
      blocks.push({ heading: "Totals", lines: [`${hours}h logged across ${journals.length} journal day(s)`, `${doneTasks.length} task(s) completed`, `${journals.reduce((a, j) => a + j.meetings, 0)} meeting(s) attended`] });
      journals.forEach((j) => sources.push({ kind: "journal", ref: j.id, label: `Journal ${j.journalDate}`, href: `/journal?date=${j.journalDate}` }));
      movedIssues.forEach((i) => sources.push({ kind: "issue", ref: i.id, label: i.key, href: `/issues/${i.id}` }));
      break;
    }

    case "overdue": {
      title = "Overdue items";
      const [issuesOver, tasksOver] = await Promise.all([
        db.select().from(s.issues).where(and(ownIssues, sql`due_date < ${today}`, inArray(s.issues.status, OPEN_STATES))).orderBy(s.issues.dueDate),
        db.select().from(s.tasks).where(and(ownTasks, sql`due_date < ${today}`, ne(s.tasks.status, "done"))).orderBy(s.tasks.dueDate),
      ]);
      blocks.push({ heading: `Overdue issues (${issuesOver.length})`, lines: issuesOver.map((i) => `${i.key} · ${i.title} — due ${humanize(i.dueDate)} [${label(i.priority)}, ${label(i.status)}]`) });
      blocks.push({ heading: `Overdue tasks (${tasksOver.length})`, lines: tasksOver.map((t) => `${t.title} — due ${humanize(t.dueDate)}`) });
      issuesOver.forEach((i) => sources.push({ kind: "issue", ref: i.id, label: i.key, href: `/issues/${i.id}` }));
      tasksOver.forEach((t) => sources.push({ kind: "task", ref: t.id, label: t.title, href: "/tasks" }));
      break;
    }

    case "month_accomplishments": {
      const from = today.slice(0, 8) + "01";
      title = `Accomplishments since ${humanize(from)}`;
      const [resolved, doneTasks, journals, achievements] = await Promise.all([
        db.select().from(s.issues).where(and(ownIssues, gte(s.issues.resolvedAt, new Date(from)))),
        db.select().from(s.tasks).where(and(ownTasks, gte(s.tasks.completedAt, new Date(from)))),
        db.select().from(s.dailyJournals).where(and(eq(s.dailyJournals.userId, userId), gte(s.dailyJournals.journalDate, from))),
        db.select().from(s.careerAchievements).where(and(eq(s.careerAchievements.userId, userId), isNull(s.careerAchievements.deletedAt), gte(s.careerAchievements.achievedDate, from))),
      ]);
      blocks.push({ heading: "Issues resolved", lines: resolved.map((i) => `${i.key} · ${i.title}`) });
      blocks.push({ heading: "Tasks completed", lines: doneTasks.map((t) => t.title) });
      blocks.push({ heading: "Achievements logged", lines: achievements.map((a) => `${a.title}${a.impact ? ` — impact: ${a.impact}` : ""}`) });
      blocks.push({ heading: "Effort", lines: [`${journals.reduce((a, j) => a + Number(j.timeSpentHours || 0), 0)}h logged over ${journals.length} day(s)`] });
      resolved.forEach((i) => sources.push({ kind: "issue", ref: i.id, label: i.key, href: `/issues/${i.id}` }));
      achievements.forEach((a) => sources.push({ kind: "achievement", ref: a.id, label: a.title, href: "/career" }));
      break;
    }

    case "projects_attention": {
      title = "Projects needing attention";
      const rows = await db.select({
        p: s.projects,
        open: sql<number>`count(${s.issues.id}) filter (where ${s.issues.deletedAt} is null and ${inArray(s.issues.status, OPEN_STATES)})::int`,
        overdue: sql<number>`count(${s.issues.id}) filter (where ${s.issues.deletedAt} is null and ${s.issues.dueDate} < ${today} and ${inArray(s.issues.status, OPEN_STATES)})::int`,
        blocked: sql<number>`count(${s.issues.id}) filter (where ${s.issues.deletedAt} is null and ${s.issues.status} = 'blocked')::int`,
      }).from(s.projects).leftJoin(s.issues, eq(s.issues.projectId, s.projects.id))
        .where(and(eq(s.projects.userId, userId), isNull(s.projects.deletedAt))).groupBy(s.projects.id);

      const ranked = rows
        .map((r) => ({ ...r, score: r.overdue * 3 + r.blocked * 2 + r.open }))
        .sort((a, b) => b.score - a.score);
      blocks.push({
        heading: "Ranked by overdue × 3 + blocked × 2 + open issues",
        lines: ranked.map((r) => `${r.p.name} [${label(r.p.status)}] — ${r.overdue} overdue, ${r.blocked} blocked, ${r.open} open${r.p.targetDate ? `, target ${humanize(r.p.targetDate)}` : ""}`),
      });
      const attention = ranked.filter((r) => r.overdue > 0 || r.blocked > 0);
      blocks.push({ heading: "Needs action now", lines: attention.length ? attention.map((r) => `${r.p.name}: ${r.overdue ? `clear ${r.overdue} overdue issue(s)` : ""}${r.overdue && r.blocked ? "; " : ""}${r.blocked ? `unblock ${r.blocked}` : ""}`) : ["No project currently has overdue or blocked issues."] });
      ranked.forEach((r) => sources.push({ kind: "project", ref: r.p.id, label: r.p.name, href: "/projects" }));
      break;
    }

    case "technical_contributions": {
      title = "Technical contributions";
      const [byType, achievements, gh, docs] = await Promise.all([
        db.select({ type: s.issues.type, n: sql<number>`count(*)::int` }).from(s.issues).where(and(ownIssues, inArray(s.issues.status, DONE_STATES))).groupBy(s.issues.type),
        db.select().from(s.careerAchievements).where(and(eq(s.careerAchievements.userId, userId), isNull(s.careerAchievements.deletedAt))).orderBy(desc(s.careerAchievements.achievedDate)).limit(8),
        db.select({ type: s.githubActivity.type, n: sql<number>`coalesce(sum(count),0)::int` }).from(s.githubActivity).where(eq(s.githubActivity.userId, userId)).groupBy(s.githubActivity.type),
        db.select().from(s.knowledgeDocs).where(and(eq(s.knowledgeDocs.userId, userId), isNull(s.knowledgeDocs.deletedAt))).limit(8),
      ]);
      blocks.push({ heading: "Delivered work by issue type", lines: byType.map((t) => `${label(t.type)}: ${t.n} completed`) });
      blocks.push({ heading: "Recorded achievements", lines: achievements.map((a) => `${a.title} (${label(a.category)})${a.achievedDate ? ` — ${humanize(a.achievedDate)}` : ""}`) });
      blocks.push({ heading: "GitHub activity (raw signal, not a performance measure)", lines: gh.length ? gh.map((g) => `${label(g.type)}: ${g.n}`) : ["No GitHub activity imported."] });
      blocks.push({ heading: "Knowledge shared", lines: docs.map((d) => `${d.title} (${label(d.docType)})`) });
      achievements.forEach((a) => sources.push({ kind: "achievement", ref: a.id, label: a.title, href: "/career" }));
      break;
    }

    case "upcoming_holidays": {
      title = "Upcoming holidays";
      const rows = await db.select().from(s.holidays)
        .where(and(gte(s.holidays.holidayDate, today), lte(s.holidays.holidayDate, format(addDays(new Date(), 120), "yyyy-MM-dd"))))
        .orderBy(s.holidays.holidayDate).limit(12);
      blocks.push({ heading: "Next 120 days", lines: rows.map((h) => `${humanize(h.holidayDate)} — ${h.name} [${label(h.category)}${h.region ? `, ${h.region}` : ""}]`) });
      rows.forEach((h) => sources.push({ kind: "holiday", ref: h.id, label: h.name, href: "/holidays" }));
      break;
    }

    case "leave_summary": {
      const year = Number(today.slice(0, 4));
      title = `Leave summary ${year}`;
      const [entries, balances, types] = await Promise.all([
        db.select({ e: s.leaveEntries, t: s.leaveTypes }).from(s.leaveEntries).innerJoin(s.leaveTypes, eq(s.leaveEntries.leaveTypeId, s.leaveTypes.id)).where(eq(s.leaveEntries.userId, userId)),
        db.select().from(s.leaveBalances).where(and(eq(s.leaveBalances.userId, userId), eq(s.leaveBalances.year, year))),
        db.select().from(s.leaveTypes).where(eq(s.leaveTypes.isActive, true)).orderBy(s.leaveTypes.sortOrder),
      ]);
      const inYear = entries.filter((x) => x.e.startDate.startsWith(String(year)));
      const taken = inYear.filter((x) => x.e.status === "approved").reduce((a, x) => a + Number(x.e.days), 0);
      const pending = inYear.filter((x) => x.e.status === "pending").reduce((a, x) => a + Number(x.e.days), 0);
      const planned = inYear.filter((x) => x.e.status === "planned").reduce((a, x) => a + Number(x.e.days), 0);
      blocks.push({ heading: "Totals", lines: [`${taken} day(s) approved & taken`, `${pending} day(s) pending approval`, `${planned} day(s) planned (not deducted)`] });
      blocks.push({
        heading: "Remaining by category",
        lines: types.map((t) => {
          const b = balances.find((x) => x.leaveTypeId === t.id);
          const used = inYear.filter((x) => x.e.leaveTypeId === t.id && x.e.status === "approved").reduce((a, x) => a + Number(x.e.days), 0);
          const total = Number(b?.opening ?? 0) + Number(b?.accrued ?? 0) + Number(b?.carryForward ?? 0) + Number(b?.adjustments ?? 0);
          return `${t.name}: ${Math.round((total - used) * 100) / 100} of ${total} remaining`;
        }),
      });
      const upcoming = entries.filter((x) => x.e.startDate >= today && !["cancelled", "rejected"].includes(x.e.status));
      blocks.push({ heading: "Upcoming", lines: upcoming.map((x) => `${x.t.name} ${humanize(x.e.startDate)} → ${humanize(x.e.endDate)} (${x.e.days}d, ${label(x.e.status)})`) });
      upcoming.forEach((x) => sources.push({ kind: "leave", ref: x.e.id, label: `${x.t.name} ${x.e.startDate}`, href: "/leaves" }));
      break;
    }

    case "workload": {
      title = "Current workload";
      const wl = await computeWorkload(userId);
      blocks.push({ heading: "This week", lines: [
        `Capacity ${wl.week.capacityHours}h across ${wl.week.workingDays} working day(s)`,
        `Committed ${wl.week.committedHours}h (${wl.week.utilization}% utilisation)`,
        `${wl.week.openTasks} open task(s), ${wl.week.openIssues} open issue(s)`,
      ] });
      blocks.push({ heading: "Risks", lines: [
        `${wl.risks.overdue} overdue item(s)`,
        `${wl.risks.dueThisWeek} item(s) due this week`,
        `${wl.risks.conflicts.length} deadline conflict day(s)${wl.risks.conflicts.length ? `: ${wl.risks.conflicts.map((c) => `${humanize(c.date)} (${c.count} items, ${c.hours}h)`).join(", ")}` : ""}`,
      ] });
      blocks.push({ heading: "By project", lines: wl.byProject.map((p) => `${p.project}: ${p.hours}h estimated across ${p.items} item(s)`) });
      break;
    }

    case "meetings_followups": {
      title = "Meetings & follow-ups";
      const [recent, openItems] = await Promise.all([
        db.select().from(s.meetings).where(and(eq(s.meetings.userId, userId), isNull(s.meetings.deletedAt))).orderBy(desc(s.meetings.meetingDate)).limit(6),
        db.select({ a: s.meetingActionItems, m: s.meetings }).from(s.meetingActionItems)
          .innerJoin(s.meetings, eq(s.meetingActionItems.meetingId, s.meetings.id))
          .where(and(eq(s.meetings.userId, userId), ne(s.meetingActionItems.status, "done"), ne(s.meetingActionItems.status, "dropped"))).limit(15),
      ]);
      blocks.push({ heading: "Recent meetings", lines: recent.map((m) => `${humanize(m.meetingDate)} — ${m.title} (${label(m.type)})${m.followUpDate ? `, follow-up ${humanize(m.followUpDate)}` : ""}`) });
      blocks.push({ heading: "Open action items", lines: openItems.map((x) => `${x.a.description} — owner ${x.a.owner ?? "me"}${x.a.dueDate ? `, due ${humanize(x.a.dueDate)}` : ""} (from “${x.m.title}”)`) });
      recent.forEach((m) => sources.push({ kind: "meeting", ref: m.id, label: m.title, href: "/meetings" }));
      break;
    }

    case "weekly_status_report": {
      const from = format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
      title = `Weekly status report — week of ${humanize(from)}`;
      const [journals, doneTasks, resolved, openHigh, upcomingLeave, actionItems] = await Promise.all([
        db.select().from(s.dailyJournals).where(and(eq(s.dailyJournals.userId, userId), gte(s.dailyJournals.journalDate, from))).orderBy(s.dailyJournals.journalDate),
        db.select().from(s.tasks).where(and(ownTasks, gte(s.tasks.completedAt, new Date(from)))),
        db.select().from(s.issues).where(and(ownIssues, gte(s.issues.resolvedAt, new Date(from)))),
        db.select().from(s.issues).where(and(ownIssues, inArray(s.issues.status, ["in_progress", "blocked", "under_review"]))).orderBy(s.issues.dueDate).limit(10),
        db.select({ e: s.leaveEntries, t: s.leaveTypes }).from(s.leaveEntries).innerJoin(s.leaveTypes, eq(s.leaveEntries.leaveTypeId, s.leaveTypes.id))
          .where(and(eq(s.leaveEntries.userId, userId), gte(s.leaveEntries.startDate, today), inArray(s.leaveEntries.status, ["approved", "pending"]))).limit(5),
        db.select({ a: s.meetingActionItems }).from(s.meetingActionItems).innerJoin(s.meetings, eq(s.meetingActionItems.meetingId, s.meetings.id))
          .where(and(eq(s.meetings.userId, userId), eq(s.meetingActionItems.status, "open"))).limit(8),
      ]);
      blocks.push({ heading: "Completed this week", lines: [...resolved.map((i) => `${i.key} · ${i.title}`), ...doneTasks.map((t) => t.title)] });
      blocks.push({ heading: "In flight", lines: openHigh.map((i) => `${i.key} · ${i.title} [${label(i.status)}${i.dueDate ? `, due ${humanize(i.dueDate)}` : ""}]`) });
      blocks.push({ heading: "Blockers", lines: openHigh.filter((i) => i.status === "blocked").map((i) => `${i.key} · ${i.title}`) });
      blocks.push({ heading: "Open action items", lines: actionItems.map((x) => x.a.description) });
      blocks.push({ heading: "Time & availability", lines: [
        `${journals.reduce((a, j) => a + Number(j.timeSpentHours || 0), 0)}h logged this week`,
        ...upcomingLeave.map((x) => `Upcoming leave: ${x.t.name} ${humanize(x.e.startDate)} → ${humanize(x.e.endDate)} (${label(x.e.status)})`),
      ] });
      resolved.forEach((i) => sources.push({ kind: "issue", ref: i.id, label: i.key, href: `/issues/${i.id}` }));
      journals.forEach((j) => sources.push({ kind: "journal", ref: j.id, label: `Journal ${j.journalDate}`, href: `/journal?date=${j.journalDate}` }));
      break;
    }

    default: {
      title = "What I can answer";
      blocks.push({ heading: "Try asking", lines: [
        "What did I work on last week?",
        "Which issues are overdue?",
        "What did I accomplish this month?",
        "Which projects need attention?",
        "Generate my weekly status report.",
        "Summarize my technical contributions.",
        "What are my upcoming holidays?",
        "How many leave days have I taken?",
        "What is my current workload?",
        "What meeting follow-ups are open?",
      ] });
    }
  }

  const empty = blocks.every((b) => b.lines.length === 0);
  if (empty) {
    blocks.push({ heading: undefined, lines: ["No matching records were found in your workspace for this question."] });
  }

  return {
    intent,
    title,
    blocks,
    sources,
    markdown: md(blocks, title),
    provider: "grounded",
    note: `Generated from ${sources.length} stored record(s) at ${new Date().toISOString()}. Figures come directly from your database.`,
  };
}

/* ------------------------------------------------------------------ */
/*  Workload / capacity computation (shared by assistant + /workload)   */
/* ------------------------------------------------------------------ */

export type WorkloadResult = Awaited<ReturnType<typeof computeWorkload>>;

export async function computeWorkload(userId: string) {
  const today = todayYMD();
  const [prefs] = await db.select().from(s.employeePreferences).where(eq(s.employeePreferences.userId, userId)).limit(1);
  const weekendDays = prefs?.weekendDays ?? [0, 6];
  const workStart = prefs?.workStartHour ?? 9;
  const workEnd = prefs?.workEndHour ?? 18;
  const focusHours = Number(prefs?.focusHoursPerDay ?? 6);
  const grossDayHours = Math.max(0, workEnd - workStart);

  const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
  const weekEnd = format(addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 6), "yyyy-MM-dd");

  const holidayRows = await db.select({ d: s.holidays.holidayDate }).from(s.holidays)
    .where(and(gte(s.holidays.holidayDate, weekStart), lte(s.holidays.holidayDate, weekEnd), inArray(s.holidays.category, ["national", "regional", "company"])));
  const holidaySet = new Set(holidayRows.map((h) => h.d));

  const leaveRows = await db.select().from(s.leaveEntries).where(and(
    eq(s.leaveEntries.userId, userId), eq(s.leaveEntries.status, "approved"),
    lte(s.leaveEntries.startDate, weekEnd), gte(s.leaveEntries.endDate, weekStart),
  ));
  const leaveDays = new Set<string>();
  for (const l of leaveRows) {
    let d = new Date(l.startDate + "T00:00:00");
    const end = new Date(l.endDate + "T00:00:00");
    while (d <= end) { leaveDays.add(format(d, "yyyy-MM-dd")); d = addDays(d, 1); }
  }

  const weekDates: string[] = [];
  for (let i = 0; i < 7; i++) weekDates.push(format(addDays(new Date(weekStart + "T00:00:00"), i), "yyyy-MM-dd"));
  const workingDates = weekDates.filter((d) => !weekendDays.includes(new Date(d + "T00:00:00").getDay()) && !holidaySet.has(d) && !leaveDays.has(d));
  const capacityHours = Math.round(workingDates.length * focusHours * 10) / 10;

  const [openTasks, openIssues, journalsWeek] = await Promise.all([
    db.select().from(s.tasks).where(and(eq(s.tasks.userId, userId), isNull(s.tasks.deletedAt), ne(s.tasks.status, "done"))),
    db.select().from(s.issues).where(and(eq(s.issues.userId, userId), isNull(s.issues.deletedAt), inArray(s.issues.status, OPEN_STATES))),
    db.select().from(s.dailyJournals).where(and(eq(s.dailyJournals.userId, userId), gte(s.dailyJournals.journalDate, weekStart), lte(s.dailyJournals.journalDate, weekEnd))),
  ]);

  const dueThisWeekTasks = openTasks.filter((t) => t.dueDate && t.dueDate >= weekStart && t.dueDate <= weekEnd);
  const dueThisWeekIssues = openIssues.filter((i) => i.dueDate && i.dueDate >= weekStart && i.dueDate <= weekEnd);
  const remainingHrs = (est: string | null, act: string | null) => Math.max(0, Number(est ?? 0) - Number(act ?? 0));
  const committedHours = Math.round((
    dueThisWeekTasks.reduce((a, t) => a + remainingHrs(t.estimatedHours, t.actualHours), 0) +
    dueThisWeekIssues.reduce((a, i) => a + remainingHrs(i.estimatedHours, i.actualHours), 0)
  ) * 10) / 10;

  const loggedHours = Math.round(journalsWeek.reduce((a, j) => a + Number(j.timeSpentHours || 0), 0) * 10) / 10;

  // deadline conflicts: >2 items or > focus hours landing on one day
  const perDay = new Map<string, { count: number; hours: number; items: string[] }>();
  for (const t of dueThisWeekTasks) {
    const cur = perDay.get(t.dueDate!) ?? { count: 0, hours: 0, items: [] };
    cur.count++; cur.hours += remainingHrs(t.estimatedHours, t.actualHours); cur.items.push(t.title);
    perDay.set(t.dueDate!, cur);
  }
  for (const i of dueThisWeekIssues) {
    const cur = perDay.get(i.dueDate!) ?? { count: 0, hours: 0, items: [] };
    cur.count++; cur.hours += remainingHrs(i.estimatedHours, i.actualHours); cur.items.push(`${i.key} ${i.title}`);
    perDay.set(i.dueDate!, cur);
  }
  const conflicts = [...perDay.entries()]
    .filter(([, v]) => v.hours > focusHours || v.count > 2)
    .map(([date, v]) => ({ date, count: v.count, hours: Math.round(v.hours * 10) / 10, items: v.items }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const overdue = [
    ...openTasks.filter((t) => t.dueDate && t.dueDate < today),
    ...openIssues.filter((i) => i.dueDate && i.dueDate < today),
  ].length;

  // project distribution over all open work
  const projects = await db.select().from(s.projects).where(and(eq(s.projects.userId, userId), isNull(s.projects.deletedAt)));
  const byProject = projects.map((p) => {
    const ts = openTasks.filter((t) => t.projectId === p.id);
    const is = openIssues.filter((i) => i.projectId === p.id);
    return {
      project: p.name,
      items: ts.length + is.length,
      hours: Math.round((ts.reduce((a, t) => a + remainingHrs(t.estimatedHours, t.actualHours), 0) + is.reduce((a, i) => a + remainingHrs(i.estimatedHours, i.actualHours), 0)) * 10) / 10,
    };
  }).filter((p) => p.items > 0).sort((a, b) => b.hours - a.hours);

  const unassigned = {
    project: "Unassigned",
    items: openTasks.filter((t) => !t.projectId).length + openIssues.filter((i) => !i.projectId).length,
    hours: Math.round((openTasks.filter((t) => !t.projectId).reduce((a, t) => a + remainingHrs(t.estimatedHours, t.actualHours), 0)
      + openIssues.filter((i) => !i.projectId).reduce((a, i) => a + remainingHrs(i.estimatedHours, i.actualHours), 0)) * 10) / 10,
  };
  if (unassigned.items > 0) byProject.push(unassigned);

  // daily breakdown for the current week
  const daily = weekDates.map((date) => {
    const isOff = weekendDays.includes(new Date(date + "T00:00:00").getDay()) || holidaySet.has(date) || leaveDays.has(date);
    const d = perDay.get(date);
    const journal = journalsWeek.find((j) => j.journalDate === date);
    return {
      date,
      weekday: format(new Date(date + "T00:00:00"), "EEE"),
      isOff,
      offReason: holidaySet.has(date) ? "holiday" : leaveDays.has(date) ? "leave" : weekendDays.includes(new Date(date + "T00:00:00").getDay()) ? "weekend" : null,
      capacity: isOff ? 0 : focusHours,
      dueItems: d?.count ?? 0,
      plannedHours: Math.round((d?.hours ?? 0) * 10) / 10,
      loggedHours: Number(journal?.timeSpentHours ?? 0),
    };
  });

  const estVsActual = {
    estimated: Math.round(([...openTasks, ...openIssues].reduce((a, x) => a + Number(x.estimatedHours ?? 0), 0)) * 10) / 10,
    actual: Math.round(([...openTasks, ...openIssues].reduce((a, x) => a + Number(x.actualHours ?? 0), 0)) * 10) / 10,
  };

  return {
    settings: { workStartHour: workStart, workEndHour: workEnd, focusHoursPerDay: focusHours, weekendDays, grossDayHours },
    week: {
      weekStart, weekEnd,
      workingDays: workingDates.length,
      capacityHours,
      committedHours,
      loggedHours,
      utilization: capacityHours > 0 ? Math.round((committedHours / capacityHours) * 100) : 0,
      openTasks: openTasks.length,
      openIssues: openIssues.length,
    },
    daily,
    byProject,
    estVsActual,
    risks: { overdue, dueThisWeek: dueThisWeekTasks.length + dueThisWeekIssues.length, conflicts },
  };
}

/* ------------------------------------------------------------------ */
/*  Optional LLM re-phrasing (facts in -> prose out). Never invents.    */
/* ------------------------------------------------------------------ */

export function llmConfigured() {
  return !!(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);
}

export async function maybePolishWithLlm(answer: Answer, question: string): Promise<Answer> {
  const openai = process.env.OPENAI_API_KEY;
  const anthropic = process.env.ANTHROPIC_API_KEY;
  if (!openai && !anthropic) return answer;

  const system =
    "You are an employee productivity assistant. You will be given FACTS extracted from the user's own database. " +
    "Rewrite them into a concise professional answer. You MUST NOT invent any task, number, date, achievement or project " +
    "that is not present in the FACTS. If the FACTS are empty, say no records were found.";
  const prompt = `QUESTION: ${question}\n\nFACTS:\n${answer.markdown}`;

  try {
    if (openai) {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${openai}` },
        body: JSON.stringify({
          model: process.env.AI_MODEL || "gpt-4o-mini",
          messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
          temperature: 0.2,
        }),
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) return answer;
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = json.choices?.[0]?.message?.content;
      if (text) return { ...answer, markdown: text, provider: "llm", note: answer.note + " Phrasing by LLM; facts unchanged." };
    } else if (anthropic) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": anthropic, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: process.env.AI_MODEL || "claude-3-5-haiku-20241022",
          max_tokens: 1200, system,
          messages: [{ role: "user", content: prompt }],
        }),
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) return answer;
      const json = (await res.json()) as { content?: { text?: string }[] };
      const text = json.content?.[0]?.text;
      if (text) return { ...answer, markdown: text, provider: "llm", note: answer.note + " Phrasing by LLM; facts unchanged." };
    }
  } catch {
    return answer; // network/provider failure → always fall back to grounded answer
  }
  return answer;
}
