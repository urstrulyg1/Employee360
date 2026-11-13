import { db } from "@/db";
import * as s from "@/db/schema";
import { and, desc, eq, gte, inArray, isNull, lt, ne, sql } from "drizzle-orm";
import { handle, ok, requireUser } from "@/lib/api";
import { todayYMD } from "@/lib/dates";

const OPEN_SET = ["backlog", "open", "in_progress", "blocked", "under_review"];
const DONE_SET = ["resolved", "closed"];

export const GET = handle(async () => {
  const user = await requireUser();
  const today = todayYMD();
  const [prefs] = await db.select().from(s.employeePreferences).where(eq(s.employeePreferences.userId, user.id)).limit(1);
  const [profile] = await db.select().from(s.employeeProfiles).where(eq(s.employeeProfiles.userId, user.id)).limit(1);

  const [
    issueKpis, taskKpis, projectKpis, leaveRows, balanceData,
    byStatus, byPriority, byProject, weeklyTasks, monthlyTrend,
    upcomingHolidays, upcomingLeaves, upcomingDeadlines,
    recentIssues, recentJournals, recentCompletedTasks, recentActivity, ghRecent,
  ] = await Promise.all([
    // issue KPIs
    db.select({
      total: sql<number>`count(*)::int`,
      open: sql<number>`count(*) filter (where ${inArray(s.issues.status, OPEN_SET)})::int`,
      inProgress: sql<number>`count(*) filter (where status = 'in_progress')::int`,
      blocked: sql<number>`count(*) filter (where status = 'blocked')::int`,
      resolved: sql<number>`count(*) filter (where ${inArray(s.issues.status, DONE_SET)})::int`,
      overdue: sql<number>`count(*) filter (where due_date < ${today} and not ${inArray(s.issues.status, DONE_SET)})::int`,
    }).from(s.issues).where(and(eq(s.issues.userId, user.id), isNull(s.issues.deletedAt))),
    // task KPIs
    db.select({
      total: sql<number>`count(*)::int`,
      open: sql<number>`count(*) filter (where status <> 'done')::int`,
      doneThisMonth: sql<number>`count(*) filter (where completed_at >= date_trunc('month', now()))::int`,
    }).from(s.tasks).where(and(eq(s.tasks.userId, user.id), isNull(s.tasks.deletedAt))),
    // projects
    db.select({ active: sql<number>`count(*) filter (where status = 'active')::int`, total: sql<number>`count(*)::int` })
      .from(s.projects).where(and(eq(s.projects.userId, user.id), isNull(s.projects.deletedAt))),
    // leaves taken (approved, this year)
    db.select({ days: sql<string>`coalesce(sum(days) filter (where status = 'approved'), '0')::text` })
      .from(s.leaveEntries)
      .where(and(eq(s.leaveEntries.userId, user.id), gte(s.leaveEntries.startDate, `${today.slice(0, 4)}-01-01`))),
    // leave balance remaining (computed)
    db.select({
      quotaLike: sql<string>`coalesce(sum(${s.leaveBalances.opening} + ${s.leaveBalances.accrued} + ${s.leaveBalances.carryForward} + ${s.leaveBalances.adjustments}),'0')::text`,
    }).from(s.leaveBalances).innerJoin(s.leaveTypes, eq(s.leaveBalances.leaveTypeId, s.leaveTypes.id))
      .where(and(eq(s.leaveBalances.userId, user.id), eq(s.leaveTypes.countsAsPaid, true), eq(s.leaveBalances.year, Number(today.slice(0, 4))))),
    db.select({ status: s.issues.status, count: sql<number>`count(*)::int` }).from(s.issues)
      .where(and(eq(s.issues.userId, user.id), isNull(s.issues.deletedAt))).groupBy(s.issues.status),
    db.select({ priority: s.issues.priority, count: sql<number>`count(*)::int` }).from(s.issues)
      .where(and(eq(s.issues.userId, user.id), isNull(s.issues.deletedAt))).groupBy(s.issues.priority),
    db.select({ name: s.projects.name, key: s.projects.key, count: sql<number>`count(${s.issues.id})::int` })
      .from(s.projects).leftJoin(s.issues, and(eq(s.issues.projectId, s.projects.id), isNull(s.issues.deletedAt)))
      .where(and(eq(s.projects.userId, user.id), isNull(s.projects.deletedAt)))
      .groupBy(s.projects.name, s.projects.key).orderBy(desc(sql`count(${s.issues.id})`)),
    db.select({ week: sql<string>`to_char(date_trunc('week', completed_at), 'YYYY-MM-DD')`, count: sql<number>`count(*)::int` })
      .from(s.tasks).where(and(eq(s.tasks.userId, user.id), isNull(s.tasks.deletedAt), sql`completed_at is not null`, gte(s.tasks.completedAt, new Date(Date.now() - 56 * 86400000))))
      .groupBy(sql`date_trunc('week', completed_at)`).orderBy(sql`date_trunc('week', completed_at)`),
    Promise.all([
      db.select({ month: sql<string>`to_char(date_trunc('month', completed_at), 'YYYY-MM')`, v: sql<number>`count(*)::int` })
        .from(s.tasks).where(and(eq(s.tasks.userId, user.id), isNull(s.tasks.deletedAt), sql`completed_at is not null`, gte(s.tasks.completedAt, new Date(Date.now() - 183 * 86400000))))
        .groupBy(sql`1`).orderBy(sql`1`),
      db.select({ month: sql<string>`to_char(date_trunc('month', resolved_at), 'YYYY-MM')`, v: sql<number>`count(*)::int` })
        .from(s.issues).where(and(eq(s.issues.userId, user.id), isNull(s.issues.deletedAt), sql`resolved_at is not null`, gte(s.issues.resolvedAt, new Date(Date.now() - 183 * 86400000))))
        .groupBy(sql`1`).orderBy(sql`1`),
      db.select({ month: sql<string>`to_char(date_trunc('month', journal_date::date), 'YYYY-MM')`, v: sql<string>`coalesce(sum(time_spent_hours),0)::text` })
        .from(s.dailyJournals).where(and(eq(s.dailyJournals.userId, user.id), gte(s.dailyJournals.journalDate, today.slice(0, 4) + "-01-01")))
        .groupBy(sql`1`).orderBy(sql`1`),
    ]),
    db.select().from(s.holidays).where(and(gte(s.holidays.holidayDate, today), lt(s.holidays.holidayDate, sql`${today}::date + 45`))).orderBy(s.holidays.holidayDate).limit(5),
    db.select({ entry: s.leaveEntries, type: s.leaveTypes }).from(s.leaveEntries).innerJoin(s.leaveTypes, eq(s.leaveEntries.leaveTypeId, s.leaveTypes.id))
      .where(and(eq(s.leaveEntries.userId, user.id), gte(s.leaveEntries.endDate, today), ne(s.leaveEntries.status, "cancelled"), ne(s.leaveEntries.status, "rejected")))
      .orderBy(s.leaveEntries.startDate).limit(6),
    db.select({ id: s.issues.id, key: s.issues.key, title: s.issues.title, dueDate: s.issues.dueDate, priority: s.issues.priority })
      .from(s.issues).where(and(eq(s.issues.userId, user.id), isNull(s.issues.deletedAt), ne(s.issues.status, "resolved"), ne(s.issues.status, "closed"), gte(s.issues.dueDate, today), lt(s.issues.dueDate, sql`${today}::date + 21`)))
      .orderBy(s.issues.dueDate).limit(6),
    db.select({ id: s.issues.id, key: s.issues.key, title: s.issues.title, status: s.issues.status, priority: s.issues.priority, updatedAt: s.issues.updatedAt })
      .from(s.issues).where(and(eq(s.issues.userId, user.id), isNull(s.issues.deletedAt))).orderBy(desc(s.issues.updatedAt)).limit(6),
    db.select().from(s.dailyJournals).where(eq(s.dailyJournals.userId, user.id)).orderBy(desc(s.dailyJournals.journalDate)).limit(3),
    db.select({ id: s.tasks.id, title: s.tasks.title, completedAt: s.tasks.completedAt, priority: s.tasks.priority })
      .from(s.tasks).where(and(eq(s.tasks.userId, user.id), isNull(s.tasks.deletedAt), eq(s.tasks.status, "done")))
      .orderBy(desc(s.tasks.completedAt)).limit(5),
    db.select({ entity: s.auditLogs.entity, action: s.auditLogs.action, createdAt: s.auditLogs.createdAt, metadata: s.auditLogs.metadata })
      .from(s.auditLogs).where(eq(s.auditLogs.userId, user.id)).orderBy(desc(s.auditLogs.createdAt)).limit(8),
    db.select().from(s.githubActivity).where(eq(s.githubActivity.userId, user.id)).orderBy(desc(s.githubActivity.activityDate)).limit(5),
  ]);

  const ik = issueKpis[0] ?? { total: 0, open: 0, inProgress: 0, blocked: 0, resolved: 0, overdue: 0 };
  const tk = taskKpis[0] ?? { total: 0, open: 0, doneThisMonth: 0 };
  const pk = projectKpis[0] ?? { active: 0, total: 0 };
  const plannedUpcoming = upcomingLeaves.filter((l) => l.entry.status === "planned");

  const trendMonths = new Map<string, { tasks: number; issues: number; hours: number }>();
  for (const r of monthlyTrend[0]) trendMonths.set(r.month, { tasks: r.v, issues: 0, hours: 0 });
  for (const r of monthlyTrend[1]) trendMonths.set(r.month, { ...(trendMonths.get(r.month) ?? { tasks: 0, issues: 0, hours: 0 }), issues: r.v });
  for (const r of monthlyTrend[2]) trendMonths.set(r.month, { ...(trendMonths.get(r.month) ?? { tasks: 0, issues: 0, hours: 0 }), hours: Number(r.v) });

  return ok({
    profile: profile ?? null,
    preferences: prefs ?? null,
    kpis: {
      totalIssues: Number(ik.total),
      openIssues: Number(ik.open),
      inProgressIssues: Number(ik.inProgress),
      blockedIssues: Number(ik.blocked),
      resolvedIssues: Number(ik.resolved),
      overdueIssues: Number(ik.overdue),
      tasksCompletedThisMonth: Number(tk.doneThisMonth),
      openTasks: Number(tk.open),
      activeProjects: Number(pk.active),
      totalProjects: Number(pk.total),
      leavesTaken: Number(leaveRows[0]?.days ?? 0),
      leaveEntitlement: Number(balanceData[0]?.quotaLike ?? 0),
      upcomingHolidays: upcomingHolidays.length,
      upcomingPlannedLeaves: plannedUpcoming.length,
    },
    distributions: {
      issuesByStatus: byStatus.map((r) => ({ name: r.status, value: Number(r.count) })),
      issuesByPriority: byPriority.map((r) => ({ name: r.priority, value: Number(r.count) })),
      projectBreakdown: byProject.map((r) => ({ name: r.name, key: r.key, value: Number(r.count) })),
      weeklyTasks: weeklyTasks.map((r) => ({ week: r.week, value: Number(r.count) })),
      monthlyTrend: [...trendMonths.entries()].sort().map(([month, v]) => ({ month, ...v })),
    },
    upcoming: {
      holidays: upcomingHolidays,
      leaves: upcomingLeaves,
      deadlines: upcomingDeadlines,
    },
    recent: {
      issues: recentIssues,
      journals: recentJournals,
      completedTasks: recentCompletedTasks,
      activity: recentActivity,
      github: ghRecent,
    },
  });
});
