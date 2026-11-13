import { db } from "@/db";
import { subtasks, tasks } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { audit, handle, ok, ApiError, readJson, requireUser } from "@/lib/api";
import { TASK_STATUSES } from "@/lib/domain";

export const PATCH = handle(async (req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const body = await readJson<Record<string, unknown>>(req);

  const [existing] = await db.select().from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, user.id), isNull(tasks.deletedAt))).limit(1);
  if (!existing) throw new ApiError(404, "Task not found");

  const patch: Partial<typeof tasks.$inferInsert> = { updatedAt: new Date() };
  for (const key of ["title", "description", "status", "priority", "dueDate", "projectId", "progress", "sortOrder"] as const) {
    if (body[key] !== undefined) (patch as Record<string, unknown>)[key] = body[key] === "" ? null : body[key];
  }
  if (body.estimatedHours !== undefined) patch.estimatedHours = body.estimatedHours === "" ? null : String(body.estimatedHours);
  if (body.actualHours !== undefined) patch.actualHours = body.actualHours === "" ? null : String(body.actualHours);
  if (patch.status && !TASK_STATUSES.includes(patch.status as never)) throw new ApiError(400, "Invalid status");

  const becameDone = patch.status === "done" && existing.status !== "done";
  const unDone = patch.status && patch.status !== "done" && existing.status === "done";
  if (becameDone) { patch.completedAt = new Date(); patch.progress = 100; }
  if (unDone) patch.completedAt = null;

  const subtaskOps = Array.isArray(body.subtasks) ? (body.subtasks as { id?: string; title: string; done?: boolean }[]) : null;

  const [updated] = await db.transaction(async (tx) => {
    const [row] = await tx.update(tasks).set(patch).where(eq(tasks.id, id)).returning();
    if (subtaskOps) {
      for (const sub of subtaskOps) {
        if (sub.id) {
          await tx.update(subtasks).set({ done: !!sub.done, title: sub.title ?? undefined }).where(eq(subtasks.id, sub.id));
        } else if (sub.title?.trim()) {
          await tx.insert(subtasks).values({ taskId: id, title: sub.title.trim() });
        }
      }
    }
    return [row];
  });

  await audit(user.id, "task", id, "updated", patch.status ? { status: patch.status } : undefined);
  return ok(updated);
});

export const DELETE = handle(async (_req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const [existing] = await db.select({ id: tasks.id }).from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, user.id), isNull(tasks.deletedAt))).limit(1);
  if (!existing) throw new ApiError(404, "Task not found");
  await db.update(tasks).set({ deletedAt: new Date() }).where(eq(tasks.id, id));
  await db.delete(subtasks).where(eq(subtasks.taskId, id));
  await audit(user.id, "task", id, "deleted");
  return ok({ deleted: true });
});
