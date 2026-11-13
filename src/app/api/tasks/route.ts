import { db } from "@/db";
import { projects, subtasks, tasks } from "@/db/schema";
import { and, asc, desc, eq, ilike, inArray, isNull, sql } from "drizzle-orm";
import { audit, handle, ok, ApiError, readJson, requireUser } from "@/lib/api";
import { PRIORITIES, TASK_STATUSES } from "@/lib/domain";

export const GET = handle(async (req) => {
  const user = await requireUser();
  const u = new URL(req.url);
  const status = u.searchParams.get("status");
  const projectId = u.searchParams.get("projectId");
  const q = u.searchParams.get("q");

  const conds = [eq(tasks.userId, user.id), isNull(tasks.deletedAt)];
  if (status) conds.push(eq(tasks.status, status));
  if (projectId) conds.push(eq(tasks.projectId, projectId));
  if (q) conds.push(ilike(tasks.title, `%${q}%`));

  const rows = await db.select({ task: tasks, projectName: projects.name, projectKey: projects.key })
    .from(tasks).leftJoin(projects, eq(tasks.projectId, projects.id))
    .where(and(...conds))
    .orderBy(asc(tasks.sortOrder), sql`${tasks.dueDate} asc nulls last`, desc(tasks.createdAt));

  const subs = rows.length
    ? await db.select().from(subtasks)
        .where(inArray(subtasks.taskId, rows.map((r) => r.task.id)))
        .orderBy(subtasks.sortOrder)
    : [];

  return ok(rows.map((r) => ({
    ...r.task,
    projectName: r.projectName,
    projectKey: r.projectKey,
    subtasks: subs.filter((sub) => sub.taskId === r.task.id),
  })));
});

export const POST = handle(async (req) => {
  const user = await requireUser();
  const body = await readJson<Record<string, unknown>>(req);
  const title = String(body.title ?? "").trim();
  if (!title) throw new ApiError(400, "Title is required");
  const status = String(body.status ?? "todo");
  const priority = String(body.priority ?? "medium");
  if (!TASK_STATUSES.includes(status as never)) throw new ApiError(400, "Invalid status");
  if (!PRIORITIES.includes(priority as never)) throw new ApiError(400, "Invalid priority");

  const [row] = await db.insert(tasks).values({
    title, userId: user.id, status, priority,
    description: (body.description as string) || null,
    projectId: (body.projectId as string) || null,
    dueDate: (body.dueDate as string) || null,
    estimatedHours: body.estimatedHours ? String(body.estimatedHours) : null,
    progress: status === "done" ? 100 : Number(body.progress ?? 0),
    completedAt: status === "done" ? new Date() : null,
  }).returning();
  if (Array.isArray(body.subtasks)) {
    for (const [i, titleSub] of (body.subtasks as string[]).entries()) {
      if (String(titleSub).trim()) await db.insert(subtasks).values({ taskId: row.id, title: String(titleSub).trim(), sortOrder: i });
    }
  }
  await audit(user.id, "task", row.id, "created", { title: row.title });
  return ok(row, 201);
});
