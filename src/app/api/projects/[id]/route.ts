import { db } from "@/db";
import { issues, projects, repositories, tasks } from "@/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { audit, handle, ok, ApiError, readJson, requireUser } from "@/lib/api";

export const GET = handle(async (_req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const [project] = await db.select().from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, user.id), isNull(projects.deletedAt))).limit(1);
  if (!project) throw new ApiError(404, "Project not found");
  const [projectIssues, projectTasks, repos] = await Promise.all([
    db.select().from(issues).where(and(eq(issues.projectId, id), isNull(issues.deletedAt))).orderBy(desc(issues.updatedAt)).limit(50),
    db.select().from(tasks).where(and(eq(tasks.projectId, id), isNull(tasks.deletedAt))).orderBy(tasks.sortOrder).limit(50),
    db.select().from(repositories).where(eq(repositories.projectId, id)),
  ]);
  return ok({ project, issues: projectIssues, tasks: projectTasks, repositories: repos });
});

export const PATCH = handle(async (req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const body = await readJson<Record<string, unknown>>(req);
  const [existing] = await db.select().from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, user.id), isNull(projects.deletedAt))).limit(1);
  if (!existing) throw new ApiError(404, "Project not found");
  const [updated] = await db.update(projects).set({ ...body, technologies: body.technologies as string[] | undefined, updatedAt: new Date() })
    .where(eq(projects.id, id)).returning();
  await audit(user.id, "project", id, "updated");
  return ok(updated);
});

export const DELETE = handle(async (_req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const [existing] = await db.select({ id: projects.id }).from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, user.id), isNull(projects.deletedAt))).limit(1);
  if (!existing) throw new ApiError(404, "Project not found");
  await db.update(projects).set({ deletedAt: new Date() }).where(eq(projects.id, id));
  await audit(user.id, "project", id, "deleted");
  return ok({ deleted: true });
});
