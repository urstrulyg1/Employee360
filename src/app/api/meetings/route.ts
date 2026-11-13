import { db } from "@/db";
import { careerGoals, issues, meetingActionItems, meetings, projects, tasks } from "@/db/schema";
import { and, asc, desc, eq, gte, ilike, isNull, ne, or, sql } from "drizzle-orm";
import { audit, handle, ok, ApiError, readJson, requireUser } from "@/lib/api";
import { todayYMD } from "@/lib/dates";

export const MEETING_TYPES = ["one_on_one", "team", "review", "retro", "standup", "skip_level", "external"];
const ITEM_STATUSES = ["open", "in_progress", "done", "dropped"];

export const GET = handle(async (req) => {
  const user = await requireUser();
  const u = new URL(req.url);
  const type = u.searchParams.get("type");
  const q = u.searchParams.get("q");
  const today = todayYMD();

  const conds = [eq(meetings.userId, user.id), isNull(meetings.deletedAt)];
  if (type) conds.push(eq(meetings.type, type));
  if (q) conds.push(or(ilike(meetings.title, `%${q}%`), ilike(meetings.notes, `%${q}%`), ilike(meetings.feedback, `%${q}%`))!);

  const rows = await db.select({ m: meetings, projectName: projects.name, issueKey: issues.key, goalTitle: careerGoals.title })
    .from(meetings)
    .leftJoin(projects, eq(meetings.projectId, projects.id))
    .leftJoin(issues, eq(meetings.issueId, issues.id))
    .leftJoin(careerGoals, eq(meetings.careerGoalId, careerGoals.id))
    .where(and(...conds)).orderBy(desc(meetings.meetingDate)).limit(200);

  const ids = rows.map((r) => r.m.id);
  const items = ids.length
    ? await db.select().from(meetingActionItems)
        .where(sql`${meetingActionItems.meetingId} in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`)
        .orderBy(asc(meetingActionItems.createdAt))
    : [];

  const [stats] = await db.select({
    total: sql<number>`count(*)::int`,
    upcoming: sql<number>`count(*) filter (where meeting_date >= ${today})::int`,
    followUps: sql<number>`count(*) filter (where follow_up_date >= ${today})::int`,
  }).from(meetings).where(and(eq(meetings.userId, user.id), isNull(meetings.deletedAt)));

  const openItems = items.filter((i) => i.status === "open" || i.status === "in_progress").length;

  return ok({
    data: rows.map((r) => ({
      ...r.m, projectName: r.projectName, issueKey: r.issueKey, goalTitle: r.goalTitle,
      actionItems: items.filter((i) => i.meetingId === r.m.id),
    })),
    stats: { ...stats, openActionItems: openItems },
  });
});

export const POST = handle(async (req) => {
  const user = await requireUser();
  const body = await readJson<Record<string, unknown>>(req);
  const title = String(body.title ?? "").trim();
  const meetingDate = String(body.meetingDate ?? "").slice(0, 10);
  if (!title) throw new ApiError(400, "Title is required");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meetingDate)) throw new ApiError(400, "Valid meetingDate (YYYY-MM-DD) required");
  const type = MEETING_TYPES.includes(String(body.type)) ? String(body.type) : "one_on_one";

  const created = await db.transaction(async (tx) => {
    const [m] = await tx.insert(meetings).values({
      userId: user.id, title, meetingDate, type,
      startTime: body.startTime ? String(body.startTime).slice(0, 5) : null,
      durationMinutes: Number(body.durationMinutes ?? 30),
      attendees: Array.isArray(body.attendees) ? (body.attendees as string[]) : null,
      manager: (body.manager as string) || null,
      agenda: (body.agenda as string) || null,
      notes: (body.notes as string) || null,
      discussionTopics: Array.isArray(body.discussionTopics) ? (body.discussionTopics as string[]) : null,
      feedback: (body.feedback as string) || null,
      decisions: (body.decisions as string) || null,
      managerCommitments: (body.managerCommitments as string) || null,
      followUpDate: (body.followUpDate as string) || null,
      projectId: (body.projectId as string) || null,
      issueId: (body.issueId as string) || null,
      careerGoalId: (body.careerGoalId as string) || null,
    }).returning();

    const actions = Array.isArray(body.actionItems) ? (body.actionItems as Record<string, unknown>[]) : [];
    for (const a of actions) {
      const desc = String(a.description ?? "").trim();
      if (!desc) continue;
      await tx.insert(meetingActionItems).values({
        meetingId: m.id, description: desc,
        owner: (a.owner as string) || user.name,
        dueDate: (a.dueDate as string) || null,
        status: ITEM_STATUSES.includes(String(a.status)) ? String(a.status) : "open",
      });
    }
    return m;
  });

  await audit(user.id, "meeting", created.id, "created", { title, type });
  return ok(created, 201);
});

/** PATCH — update meeting (optimistic concurrency via `version`). */
export const PATCH = handle(async (req) => {
  const user = await requireUser();
  const body = await readJson<Record<string, unknown>>(req);
  const id = String(body.id ?? "");
  if (!id) throw new ApiError(400, "id required");

  const [existing] = await db.select().from(meetings)
    .where(and(eq(meetings.id, id), eq(meetings.userId, user.id), isNull(meetings.deletedAt))).limit(1);
  if (!existing) throw new ApiError(404, "Meeting not found");

  if (body.version !== undefined && Number(body.version) !== existing.version) {
    throw new ApiError(409, `This meeting was updated elsewhere (server version ${existing.version}). Reload before saving.`);
  }

  const patch: Record<string, unknown> = { updatedAt: new Date(), version: existing.version + 1 };
  for (const k of ["title", "agenda", "notes", "feedback", "decisions", "managerCommitments", "manager", "startTime"]) {
    if (body[k] !== undefined) patch[k] = body[k] || null;
  }
  for (const k of ["followUpDate", "projectId", "issueId", "careerGoalId"]) {
    if (body[k] !== undefined) patch[k] = body[k] || null;
  }
  if (body.meetingDate) patch.meetingDate = String(body.meetingDate).slice(0, 10);
  if (body.type && MEETING_TYPES.includes(String(body.type))) patch.type = String(body.type);
  if (body.durationMinutes !== undefined) patch.durationMinutes = Number(body.durationMinutes);
  if (Array.isArray(body.attendees)) patch.attendees = body.attendees;
  if (Array.isArray(body.discussionTopics)) patch.discussionTopics = body.discussionTopics;

  const [row] = await db.update(meetings).set(patch).where(eq(meetings.id, id)).returning();
  await audit(user.id, "meeting", id, "updated");
  return ok(row);
});

export const DELETE = handle(async (req) => {
  const user = await requireUser();
  const body = await readJson<{ id?: string }>(req);
  if (!body.id) throw new ApiError(400, "id required");
  const [existing] = await db.select({ id: meetings.id }).from(meetings)
    .where(and(eq(meetings.id, body.id), eq(meetings.userId, user.id))).limit(1);
  if (!existing) throw new ApiError(404, "Meeting not found");
  await db.update(meetings).set({ deletedAt: new Date() }).where(eq(meetings.id, body.id));
  await audit(user.id, "meeting", body.id, "deleted");
  return ok({ deleted: true });
});
