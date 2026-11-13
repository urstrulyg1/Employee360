import { db } from "@/db";
import { dailyJournals } from "@/db/schema";
import { and, desc, eq, ilike, sql } from "drizzle-orm";
import { audit, handle, ok, ApiError, readJson, requireUser } from "@/lib/api";
import { todayYMD } from "@/lib/dates";

export const GET = handle(async (req) => {
  const user = await requireUser();
  const u = new URL(req.url);
  const mode = u.searchParams.get("mode");
  const q = u.searchParams.get("q");
  const month = u.searchParams.get("month"); // YYYY-MM

  if (mode === "summary") {
    const weekly = await db.select({
      week: sql<string>`to_char(date_trunc('week', journal_date::date), 'YYYY-MM-DD')`,
      entries: sql<number>`count(*)::int`,
      hours: sql<string>`coalesce(sum(time_spent_hours), 0)::text`,
      meetings: sql<number>`coalesce(sum(meetings), 0)::int`,
    }).from(dailyJournals).where(eq(dailyJournals.userId, user.id))
      .groupBy(sql`1`).orderBy(sql`1 desc`).limit(8);

    const monthly = await db.select({
      month: sql<string>`to_char(date_trunc('month', journal_date::date), 'YYYY-MM')`,
      entries: sql<number>`count(*)::int`,
      hours: sql<string>`coalesce(sum(time_spent_hours), 0)::text`,
      meetings: sql<number>`coalesce(sum(meetings), 0)::int`,
    }).from(dailyJournals).where(eq(dailyJournals.userId, user.id))
      .groupBy(sql`1`).orderBy(sql`1 desc`).limit(12);

    return ok({ weekly, monthly });
  }

  const conds = [eq(dailyJournals.userId, user.id)];
  if (q) conds.push(ilike(dailyJournals.summary, `%${q}%`));
  if (month) conds.push(sql`to_char(journal_date::date, 'YYYY-MM') = ${month}`);

  const rows = await db.select().from(dailyJournals).where(and(...conds)).orderBy(desc(dailyJournals.journalDate)).limit(200);
  return ok(rows);
});

export const POST = handle(async (req) => {
  const user = await requireUser();
  const body = await readJson<Record<string, unknown>>(req);
  const journalDate = String(body.journalDate ?? todayYMD()).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(journalDate)) throw new ApiError(400, "journalDate must be YYYY-MM-DD");

  const values = {
    userId: user.id,
    journalDate,
    summary: (body.summary as string) || null,
    tasksCompleted: Array.isArray(body.tasksCompleted) ? (body.tasksCompleted as string[]) : null,
    issuesWorkedOn: Array.isArray(body.issuesWorkedOn) ? (body.issuesWorkedOn as string[]) : null,
    challenges: (body.challenges as string) || null,
    solutions: (body.solutions as string) || null,
    learnings: (body.learnings as string) || null,
    pendingWork: (body.pendingWork as string) || null,
    nextDayPriorities: (body.nextDayPriorities as string) || null,
    meetings: Number(body.meetings ?? 0),
    timeSpentHours: body.timeSpentHours !== undefined && body.timeSpentHours !== "" ? String(body.timeSpentHours) : "0",
  };

  const [row] = await db.insert(dailyJournals).values(values)
    .onConflictDoUpdate({ target: [dailyJournals.userId, dailyJournals.journalDate], set: { ...values, updatedAt: new Date() } })
    .returning();

  await audit(user.id, "journal", row.id, "upserted", { date: journalDate });
  return ok(row, 201);
});

export const PATCH = handle(async (req) => {
  const user = await requireUser();
  const body = await readJson<Record<string, unknown>>(req);
  const id = String(body.id ?? "");
  if (!id) throw new ApiError(400, "id required");
  const [existing] = await db.select().from(dailyJournals)
    .where(and(eq(dailyJournals.id, id), eq(dailyJournals.userId, user.id))).limit(1);
  if (!existing) throw new ApiError(404, "Journal entry not found");

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  for (const key of ["summary", "challenges", "solutions", "learnings", "pendingWork", "nextDayPriorities"] as const) {
    if (body[key] !== undefined) patch[key] = body[key] || null;
  }
  if (body.meetings !== undefined) patch.meetings = Number(body.meetings);
  if (body.timeSpentHours !== undefined) patch.timeSpentHours = String(body.timeSpentHours);
  if (Array.isArray(body.tasksCompleted)) patch.tasksCompleted = body.tasksCompleted;
  if (Array.isArray(body.issuesWorkedOn)) patch.issuesWorkedOn = body.issuesWorkedOn;

  const [row] = await db.update(dailyJournals).set(patch).where(eq(dailyJournals.id, id)).returning();
  return ok(row);
});

export const DELETE = handle(async (req) => {
  const user = await requireUser();
  const body = await readJson<{ id?: string }>(req);
  if (!body.id) throw new ApiError(400, "id required");
  await db.delete(dailyJournals).where(and(eq(dailyJournals.id, body.id), eq(dailyJournals.userId, user.id)));
  await audit(user.id, "journal", body.id, "deleted");
  return ok({ deleted: true });
});
