import { db } from "@/db";
import { meetingActionItems, meetings, tasks } from "@/db/schema";
import { and, eq, isNull, ne } from "drizzle-orm";
import { audit, handle, ok, ApiError, readJson, requireUser } from "@/lib/api";

const ITEM_STATUSES = ["open", "in_progress", "done", "dropped"];

async function assertOwnsMeeting(meetingId: string, userId: string) {
  const [m] = await db.select({ id: meetings.id }).from(meetings)
    .where(and(eq(meetings.id, meetingId), eq(meetings.userId, userId), isNull(meetings.deletedAt))).limit(1);
  if (!m) throw new ApiError(404, "Meeting not found");
}

/** GET — all open action items across meetings (follow-up inbox). */
export const GET = handle(async () => {
  const user = await requireUser();
  const rows = await db.select({ a: meetingActionItems, meetingTitle: meetings.title, meetingDate: meetings.meetingDate })
    .from(meetingActionItems)
    .innerJoin(meetings, eq(meetingActionItems.meetingId, meetings.id))
    .where(and(eq(meetings.userId, user.id), isNull(meetings.deletedAt)))
    .orderBy(meetingActionItems.dueDate);
  return ok(rows.map((r) => ({ ...r.a, meetingTitle: r.meetingTitle, meetingDate: r.meetingDate })));
});

export const POST = handle(async (req) => {
  const user = await requireUser();
  const body = await readJson<Record<string, unknown>>(req);
  const meetingId = String(body.meetingId ?? "");
  const description = String(body.description ?? "").trim();
  if (!meetingId || !description) throw new ApiError(400, "meetingId and description are required");
  await assertOwnsMeeting(meetingId, user.id);

  const [row] = await db.insert(meetingActionItems).values({
    meetingId, description,
    owner: (body.owner as string) || user.name,
    dueDate: (body.dueDate as string) || null,
    status: "open",
  }).returning();
  await audit(user.id, "meeting_action", row.id, "created");
  return ok(row, 201);
});

/** PATCH — update status; optionally promote the item into a real task. */
export const PATCH = handle(async (req) => {
  const user = await requireUser();
  const body = await readJson<Record<string, unknown>>(req);
  const id = String(body.id ?? "");
  if (!id) throw new ApiError(400, "id required");

  const [row] = await db.select({ a: meetingActionItems, userId: meetings.userId })
    .from(meetingActionItems).innerJoin(meetings, eq(meetingActionItems.meetingId, meetings.id))
    .where(eq(meetingActionItems.id, id)).limit(1);
  if (!row || row.userId !== user.id) throw new ApiError(404, "Action item not found");

  const patch: Record<string, unknown> = {};
  if (body.description !== undefined) patch.description = String(body.description);
  if (body.owner !== undefined) patch.owner = (body.owner as string) || null;
  if (body.dueDate !== undefined) patch.dueDate = (body.dueDate as string) || null;
  if (body.status !== undefined) {
    const st = String(body.status);
    if (!ITEM_STATUSES.includes(st)) throw new ApiError(400, "Invalid status");
    patch.status = st;
    patch.completedAt = st === "done" ? new Date() : null;
  }

  // promote to task
  if (body.promoteToTask === true && !row.a.taskId) {
    const [task] = await db.insert(tasks).values({
      userId: user.id,
      title: row.a.description.slice(0, 240),
      description: "Created from a meeting action item.",
      status: "todo", priority: "medium",
      dueDate: (patch.dueDate as string) ?? row.a.dueDate ?? null,
    }).returning();
    patch.taskId = task.id;
    await audit(user.id, "meeting_action", id, "promoted_to_task", { taskId: task.id });
  }

  const [updated] = await db.update(meetingActionItems).set(patch).where(eq(meetingActionItems.id, id)).returning();
  return ok(updated);
});

export const DELETE = handle(async (req) => {
  const user = await requireUser();
  const body = await readJson<{ id?: string }>(req);
  if (!body.id) throw new ApiError(400, "id required");
  const [row] = await db.select({ userId: meetings.userId })
    .from(meetingActionItems).innerJoin(meetings, eq(meetingActionItems.meetingId, meetings.id))
    .where(eq(meetingActionItems.id, body.id)).limit(1);
  if (!row || row.userId !== user.id) throw new ApiError(404, "Action item not found");
  await db.delete(meetingActionItems).where(eq(meetingActionItems.id, body.id));
  return ok({ deleted: true });
});
