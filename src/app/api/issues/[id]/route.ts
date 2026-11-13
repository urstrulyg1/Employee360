import { db } from "@/db";
import { issueAttachments, issueComments, issues, issueStatusHistory, projects, workLogs } from "@/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { audit, handle, ok, ApiError, readJson, requireUser } from "@/lib/api";
import { ISSUE_STATUSES } from "@/lib/domain";

export const GET = handle(async (_req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const [issue] = await db.select().from(issues)
    .where(and(eq(issues.id, id), eq(issues.userId, user.id), isNull(issues.deletedAt))).limit(1);
  if (!issue) throw new ApiError(404, "Issue not found");

  const [comments, history, attachments, logs, project] = await Promise.all([
    db.select().from(issueComments).where(eq(issueComments.issueId, id)).orderBy(issueComments.createdAt),
    db.select().from(issueStatusHistory).where(eq(issueStatusHistory.issueId, id)).orderBy(desc(issueStatusHistory.changedAt)),
    db.select().from(issueAttachments).where(eq(issueAttachments.issueId, id)),
    db.select().from(workLogs).where(eq(workLogs.issueId, id)).orderBy(desc(workLogs.workDate)),
    issue.projectId ? db.select().from(projects).where(eq(projects.id, issue.projectId)).limit(1) : Promise.resolve([]),
  ]);

  const related = issue.projectId
    ? await db.select({ id: issues.id, key: issues.key, title: issues.title, status: issues.status }).from(issues)
        .where(and(eq(issues.projectId, issue.projectId), eq(issues.userId, user.id), isNull(issues.deletedAt))).limit(8)
    : [];

  return ok({ issue, comments, history, attachments, workLogs: logs, project: project[0] ?? null, related: related.filter((r) => r.id !== issue.id) });
});

export const PATCH = handle(async (req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const body = await readJson<Record<string, unknown>>(req);

  const [existing] = await db.select().from(issues)
    .where(and(eq(issues.id, id), eq(issues.userId, user.id), isNull(issues.deletedAt))).limit(1);
  if (!existing) throw new ApiError(404, "Issue not found");

  const patch: Partial<typeof issues.$inferInsert> = { updatedAt: new Date() };
  const editable: (keyof typeof issues.$inferSelect)[] = [
    "title", "description", "type", "priority", "status", "assignee", "reporter",
    "startDate", "dueDate", "estimatedHours", "actualHours", "repository", "externalUrl", "projectId",
  ];
  for (const key of editable) {
    if (body[key] !== undefined) (patch as Record<string, unknown>)[key] = body[key] === "" ? null : body[key];
  }
  if (body.tags !== undefined) patch.tags = Array.isArray(body.tags) ? (body.tags as string[]) : null;
  if (body.estimatedHours !== undefined && body.estimatedHours !== "") patch.estimatedHours = String(body.estimatedHours);
  if (body.actualHours !== undefined && body.actualHours !== "") patch.actualHours = String(body.actualHours);
  if (patch.status && !ISSUE_STATUSES.includes(patch.status as never)) throw new ApiError(400, "Invalid status");

  const statusChanged = patch.status && patch.status !== existing.status;
  if (statusChanged && (patch.status === "resolved" || patch.status === "closed")) patch.resolvedAt = new Date();
  if (statusChanged && existing.resolvedAt && patch.status !== "resolved" && patch.status !== "closed") patch.resolvedAt = null;

  const [updated] = await db.transaction(async (tx) => {
    const [row] = await tx.update(issues).set(patch).where(eq(issues.id, id)).returning();
    if (statusChanged) {
      await tx.insert(issueStatusHistory).values({
        issueId: id, fromStatus: existing.status, toStatus: String(patch.status), changedBy: user.name,
      });
    }
    return [row];
  });

  await audit(user.id, "issue", id, "updated", statusChanged ? { status: `${existing.status} -> ${patch.status}` } : { fields: Object.keys(patch) });
  return ok(updated);
});

export const DELETE = handle(async (_req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const [existing] = await db.select({ id: issues.id }).from(issues)
    .where(and(eq(issues.id, id), eq(issues.userId, user.id), isNull(issues.deletedAt))).limit(1);
  if (!existing) throw new ApiError(404, "Issue not found");
  await db.update(issues).set({ deletedAt: new Date() }).where(eq(issues.id, id));
  await audit(user.id, "issue", id, "deleted");
  return ok({ deleted: true });
});
