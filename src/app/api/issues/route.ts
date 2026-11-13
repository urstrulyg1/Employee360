import { db } from "@/db";
import { issues, issueStatusHistory, projects } from "@/db/schema";
import { and, asc, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { audit, handle, ok, ApiError, pageParams, readJson, requireUser } from "@/lib/api";
import { ISSUE_STATUSES, ISSUE_TYPES, PRIORITIES } from "@/lib/domain";

export const GET = handle(async (req) => {
  const user = await requireUser();
  const { u, page, pageSize, offset } = pageParams(req.url);
  const status = u.searchParams.get("status");
  const priority = u.searchParams.get("priority");
  const projectId = u.searchParams.get("projectId");
  const type = u.searchParams.get("type");
  const q = u.searchParams.get("q");
  const sort = u.searchParams.get("sort") ?? "dueDate";

  const conds = [eq(issues.userId, user.id), isNull(issues.deletedAt)];
  if (status) conds.push(eq(issues.status, status));
  if (priority) conds.push(eq(issues.priority, priority));
  if (projectId) conds.push(eq(issues.projectId, projectId));
  if (type) conds.push(eq(issues.type, type));
  if (q) conds.push(or(ilike(issues.title, `%${q}%`), ilike(issues.key, `%${q}%`))!);

  const orderBy =
    sort === "createdAt" ? desc(issues.createdAt)
    : sort === "priority" ? sql`case priority when 'critical' then 0 when 'high' then 1 when 'medium' then 2 else 3 end`
    : sql`${issues.dueDate} asc nulls last`;

  const [rows, [{ value: total }]] = await Promise.all([
    db.select({ issue: issues, projectName: projects.name, projectKey: projects.key })
      .from(issues).leftJoin(projects, eq(issues.projectId, projects.id))
      .where(and(...conds)).orderBy(orderBy).limit(pageSize).offset(offset),
    db.select({ value: sql<number>`count(*)::int` }).from(issues).where(and(...conds)),
  ]);

  return ok({
    data: rows.map((r) => ({ ...r.issue, projectName: r.projectName, projectKey: r.projectKey })),
    page, pageSize, total,
  });
});

export const POST = handle(async (req) => {
  const user = await requireUser();
  const body = await readJson<Record<string, unknown>>(req);
  const title = String(body.title ?? "").trim();
  if (!title) throw new ApiError(400, "Title is required");
  const type = String(body.type ?? "bug");
  const priority = String(body.priority ?? "medium");
  const status = String(body.status ?? "open");
  if (!ISSUE_TYPES.includes(type as never)) throw new ApiError(400, "Invalid issue type");
  if (!PRIORITIES.includes(priority as never)) throw new ApiError(400, "Invalid priority");
  if (!ISSUE_STATUSES.includes(status as never)) throw new ApiError(400, "Invalid status");

  const created = await db.transaction(async (tx) => {
    const keyResult = await tx.execute<{ next: string }>(sql`select 'ISS-' || (coalesce(max(cast(substring(key from 5) as int)), 1000) + 1)::text as next from issues`);
    const next = keyResult.rows[0].next;
    const [row] = await tx.insert(issues).values({
      key: next,
      title,
      userId: user.id,
      type, priority, status,
      description: (body.description as string) || null,
      projectId: (body.projectId as string) || null,
      repository: (body.repository as string) || null,
      assignee: (body.assignee as string) || user.name,
      reporter: (body.reporter as string) || user.name,
      startDate: (body.startDate as string) || null,
      dueDate: (body.dueDate as string) || null,
      estimatedHours: body.estimatedHours ? String(body.estimatedHours) : null,
      actualHours: body.actualHours ? String(body.actualHours) : null,
      tags: Array.isArray(body.tags) ? (body.tags as string[]) : null,
      externalUrl: (body.externalUrl as string) || null,
    }).returning();
    await tx.insert(issueStatusHistory).values({
      issueId: row.id, fromStatus: "none", toStatus: row.status, changedBy: user.name,
    });
    return row;
  });

  await audit(user.id, "issue", created.id, "created", { key: created.key, title: created.title });
  return ok(created, 201);
});
