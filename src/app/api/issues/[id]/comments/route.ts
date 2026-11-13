import { db } from "@/db";
import { issueComments, issues } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { audit, handle, ok, ApiError, readJson, requireUser } from "@/lib/api";

export const GET = handle(async (_req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const rows = await db.select().from(issueComments).where(eq(issueComments.issueId, id)).orderBy(issueComments.createdAt);
  return ok(rows.filter(() => !!user));
});

export const POST = handle(async (req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const body = await readJson<{ body?: string }>(req);
  const text = String(body.body ?? "").trim();
  if (!text) throw new ApiError(400, "Comment body is required");

  const [issue] = await db.select({ id: issues.id }).from(issues)
    .where(and(eq(issues.id, id), eq(issues.userId, user.id), isNull(issues.deletedAt))).limit(1);
  if (!issue) throw new ApiError(404, "Issue not found");

  const [comment] = await db.insert(issueComments).values({ issueId: id, author: user.name, body: text }).returning();
  await audit(user.id, "issue", id, "commented");
  return ok(comment, 201);
});

export const DELETE = handle(async (req) => {
  const user = await requireUser();
  const body = await readJson<{ commentId?: string }>(req);
  if (!body.commentId) throw new ApiError(400, "commentId required");
  await db.delete(issueComments).where(eq(issueComments.id, body.commentId));
  return ok({ deleted: true });
});
