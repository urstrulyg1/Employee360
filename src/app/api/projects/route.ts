import { db } from "@/db";
import { issues, projects, tasks } from "@/db/schema";
import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { audit, handle, ok, ApiError, readJson, requireUser } from "@/lib/api";

export const GET = handle(async () => {
  const user = await requireUser();
  const rows = await db.select({
    project: projects,
    issueTotal: sql<number>`count(distinct ${issues.id}) filter (where ${issues.deletedAt} is null)::int`,
    issueOpen: sql<number>`count(distinct ${issues.id}) filter (where ${issues.deletedAt} is null and ${issues.status} not in ('resolved','closed'))::int`,
    taskTotal: sql<number>`count(distinct ${tasks.id}) filter (where ${tasks.deletedAt} is null)::int`,
    taskDone: sql<number>`count(distinct ${tasks.id}) filter (where ${tasks.deletedAt} is null and ${tasks.status} = 'done')::int`,
  })
    .from(projects)
    .leftJoin(issues, eq(issues.projectId, projects.id))
    .leftJoin(tasks, eq(tasks.projectId, projects.id))
    .where(and(eq(projects.userId, user.id), isNull(projects.deletedAt)))
    .groupBy(projects.id)
    .orderBy(desc(projects.createdAt));

  return ok(rows.map((r) => ({ ...r.project, issueTotal: r.issueTotal, issueOpen: r.issueOpen, taskTotal: r.taskTotal, taskDone: r.taskDone })));
});

export const POST = handle(async (req) => {
  const user = await requireUser();
  const body = await readJson<Record<string, unknown>>(req);
  const name = String(body.name ?? "").trim();
  if (!name) throw new ApiError(400, "Project name is required");
  const key = String(body.key ?? name.slice(0, 3)).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) || "PRJ";

  const [row] = await db.insert(projects).values({
    name, key, userId: user.id,
    description: (body.description as string) || null,
    repoUrl: (body.repoUrl as string) || null,
    owner: (body.owner as string) || user.name,
    status: (body.status as string) || "active",
    startDate: (body.startDate as string) || null,
    targetDate: (body.targetDate as string) || null,
    technologies: Array.isArray(body.technologies) ? (body.technologies as string[]) : [],
    notes: (body.notes as string) || null,
  }).returning();
  await audit(user.id, "project", row.id, "created", { name: row.name });
  return ok(row, 201);
});
