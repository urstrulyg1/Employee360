import { db } from "@/db";
import { careerGoals, dailyJournals, holidays, issues, leaveEntries, leaveTypes, projects, tasks } from "@/db/schema";
import { and, desc, eq, ilike, isNull, or } from "drizzle-orm";
import { handle, ok, requireUser } from "@/lib/api";

/** GET /api/search?q= — global search across modules. */
export const GET = handle(async (req) => {
  const user = await requireUser();
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return ok({ issues: [], tasks: [], projects: [], journals: [], holidays: [], goals: [] });
  const like = `%${q}%`;

  const [issueRows, taskRows, projectRows, journalRows, holidayRows, goalRows, leaveRows] = await Promise.all([
    db.select({ id: issues.id, key: issues.key, title: issues.title, status: issues.status, priority: issues.priority })
      .from(issues).where(and(eq(issues.userId, user.id), isNull(issues.deletedAt), or(ilike(issues.title, like), ilike(issues.key, like))!)).limit(6),
    db.select({ id: tasks.id, title: tasks.title, status: tasks.status })
      .from(tasks).where(and(eq(tasks.userId, user.id), isNull(tasks.deletedAt), ilike(tasks.title, like))).limit(6),
    db.select({ id: projects.id, name: projects.name, status: projects.status })
      .from(projects).where(and(eq(projects.userId, user.id), isNull(projects.deletedAt), ilike(projects.name, like))).limit(5),
    db.select({ id: dailyJournals.id, journalDate: dailyJournals.journalDate, summary: dailyJournals.summary })
      .from(dailyJournals).where(and(eq(dailyJournals.userId, user.id), ilike(dailyJournals.summary, like))).orderBy(desc(dailyJournals.journalDate)).limit(5),
    db.select({ id: holidays.id, name: holidays.name, holidayDate: holidays.holidayDate, category: holidays.category })
      .from(holidays).where(ilike(holidays.name, like)).limit(5),
    db.select({ id: careerGoals.id, title: careerGoals.title, status: careerGoals.status })
      .from(careerGoals).where(and(eq(careerGoals.userId, user.id), isNull(careerGoals.deletedAt), ilike(careerGoals.title, like))).limit(5),
    db.select({ id: leaveEntries.id, name: leaveTypes.name, startDate: leaveEntries.startDate, status: leaveEntries.status })
      .from(leaveEntries).innerJoin(leaveTypes, eq(leaveEntries.leaveTypeId, leaveTypes.id))
      .where(and(eq(leaveEntries.userId, user.id), ilike(leaveTypes.name, like))).limit(5),
  ]);

  return ok({ issues: issueRows, tasks: taskRows, projects: projectRows, journals: journalRows, holidays: holidayRows, goals: goalRows, leaves: leaveRows });
});
