import { db } from "@/db";
import { dailyJournals, githubActivity, issues, leaveEntries, leaveTypes, projects, tasks } from "@/db/schema";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { handle, ok, requireUser } from "@/lib/api";
import { todayYMD } from "@/lib/dates";

export const GET = handle(async () => {
  const user = await requireUser();
  const today = todayYMD();
  const base = [eq(issues.userId, user.id), isNull(issues.deletedAt)];

  const [
    createdByMonth, resolvedByMonth, statusDist, priorityDist, typeDist,
    avgResolution, overdueList, projectTrend,
    leaveMonthly, leaveByCategory, leaveStatusCounts,
    tasksWeekly, hoursWeekly, ghWeekly, workLogTotal,
    projectContributions,
  ] = await Promise.all([
    db.select({ month: sql<string>`to_char(date_trunc('month', created_at), 'YYYY-MM')`, v: sql<number>`count(*)::int` })
      .from(issues).where(and(...base)).groupBy(sql`1`).orderBy(sql`1`),
    db.select({ month: sql<string>`to_char(date_trunc('month', resolved_at), 'YYYY-MM')`, v: sql<number>`count(*)::int` })
      .from(issues).where(and(...base, sql`resolved_at is not null`)).groupBy(sql`1`).orderBy(sql`1`),
    db.select({ name: issues.status, value: sql<number>`count(*)::int` }).from(issues).where(and(...base)).groupBy(issues.status),
    db.select({ name: issues.priority, value: sql<number>`count(*)::int` }).from(issues).where(and(...base)).groupBy(issues.priority),
    db.select({ name: issues.type, value: sql<number>`count(*)::int` }).from(issues).where(and(...base)).groupBy(issues.type),
    db.select({ avgHours: sql<string>`coalesce(avg(extract(epoch from (resolved_at - created_at)) / 3600)::numeric(10,1), 0)::text` })
      .from(issues).where(and(...base, sql`resolved_at is not null`)),
    db.select({ key: issues.key, title: issues.title, dueDate: issues.dueDate, status: issues.status, priority: issues.priority })
      .from(issues).where(and(...base, sql`due_date < ${today}`, sql`status not in ('resolved','closed')`)).orderBy(issues.dueDate),
    db.select({ month: sql<string>`to_char(date_trunc('month', ${issues.createdAt}), 'YYYY-MM')`, project: projects.name, v: sql<number>`count(*)::int` })
      .from(issues).innerJoin(projects, eq(issues.projectId, projects.id)).where(and(...base)).groupBy(sql`1`, projects.name).orderBy(sql`1`),
    db.select({ month: sql<string>`to_char(date_trunc('month', ${leaveEntries.startDate}::date), 'YYYY-MM')`, v: sql<string>`coalesce(sum(days),0)::text` })
      .from(leaveEntries).where(and(eq(leaveEntries.userId, user.id), eq(leaveEntries.status, "approved"))).groupBy(sql`1`).orderBy(sql`1`),
    db.select({ name: leaveTypes.name, value: sql<string>`coalesce(sum(${leaveEntries.days}),0)::text`, color: leaveTypes.color })
      .from(leaveEntries).innerJoin(leaveTypes, eq(leaveEntries.leaveTypeId, leaveTypes.id))
      .where(and(eq(leaveEntries.userId, user.id), eq(leaveEntries.status, "approved"))).groupBy(leaveTypes.name, leaveTypes.color),
    db.select({ name: leaveEntries.status, value: sql<number>`count(*)::int` })
      .from(leaveEntries).where(eq(leaveEntries.userId, user.id)).groupBy(leaveEntries.status),
    db.select({ week: sql<string>`to_char(date_trunc('week', completed_at), 'YYYY-MM-DD')`, v: sql<number>`count(*)::int` })
      .from(tasks).where(and(eq(tasks.userId, user.id), isNull(tasks.deletedAt), sql`completed_at is not null`, sql`completed_at > now() - interval '12 weeks'`))
      .groupBy(sql`1`).orderBy(sql`1`),
    db.select({ week: sql<string>`to_char(date_trunc('week', journal_date::date), 'YYYY-MM-DD')`, v: sql<string>`coalesce(sum(time_spent_hours),0)::text` })
      .from(dailyJournals).where(eq(dailyJournals.userId, user.id)).groupBy(sql`1`).orderBy(sql`1`),
    db.select({ week: sql<string>`to_char(date_trunc('week', activity_date::date), 'YYYY-MM-DD')`, v: sql<number>`coalesce(sum(count),0)::int` })
      .from(githubActivity).where(and(eq(githubActivity.userId, user.id), eq(githubActivity.type, "commit"))).groupBy(sql`1`).orderBy(sql`1`),
    db.select({ total: sql<string>`coalesce(sum(time_spent_hours),0)::text` }).from(dailyJournals).where(eq(dailyJournals.userId, user.id)),
    db.select({ project: projects.name, v: sql<number>`count(*)::int` })
      .from(issues).innerJoin(projects, eq(issues.projectId, projects.id))
      .where(and(...base, sql`resolved_at is not null`)).groupBy(projects.name).orderBy(desc(sql`2`)),
  ]);

  const monthMerge = new Map<string, { created: number; resolved: number }>();
  for (const r of createdByMonth) monthMerge.set(r.month, { created: r.v, resolved: 0 });
  for (const r of resolvedByMonth) monthMerge.set(r.month, { created: monthMerge.get(r.month)?.created ?? 0, resolved: r.v });

  return ok({
    issues: {
      createdVsResolved: [...monthMerge.entries()].sort().map(([month, v]) => ({ month, ...v })),
      byStatus: statusDist, byPriority: priorityDist, byType: typeDist,
      avgResolutionHours: Number(avgResolution[0]?.avgHours ?? 0),
      overdue: overdueList,
      projectTrend,
    },
    leaves: {
      monthlyUsage: leaveMonthly.map((r) => ({ month: r.month, value: Number(r.v) })),
      byCategory: leaveByCategory.map((r) => ({ name: r.name, value: Number(r.value), color: r.color })),
      statusCounts: leaveStatusCounts,
    },
    productivity: {
      tasksWeekly: tasksWeekly.map((r) => ({ week: r.week, value: r.v })),
      hoursWeekly: hoursWeekly.map((r) => ({ week: r.week, value: Number(r.v) })),
      commitsWeekly: ghWeekly.map((r) => ({ week: r.week, value: r.v })),
      totalHoursLogged: Number(workLogTotal[0]?.total ?? 0),
      projectContributions,
    },
  });
});
