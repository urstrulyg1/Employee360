import { db } from "@/db";
import { knowledgeDocs, projects } from "@/db/schema";
import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { audit, handle, ok, ApiError, readJson, requireUser } from "@/lib/api";

export const DOC_TYPES = ["note", "snippet", "command", "runbook", "architecture", "troubleshooting"];

export const GET = handle(async (req) => {
  const user = await requireUser();
  const u = new URL(req.url);
  const id = u.searchParams.get("id");
  const q = u.searchParams.get("q");
  const docType = u.searchParams.get("docType");
  const category = u.searchParams.get("category");
  const tag = u.searchParams.get("tag");
  const favorites = u.searchParams.get("favorites") === "1";

  // single doc (increments view counter)
  if (id) {
    const [doc] = await db.select().from(knowledgeDocs)
      .where(and(eq(knowledgeDocs.id, id), eq(knowledgeDocs.userId, user.id), isNull(knowledgeDocs.deletedAt))).limit(1);
    if (!doc) throw new ApiError(404, "Document not found");
    await db.update(knowledgeDocs).set({ viewCount: doc.viewCount + 1 }).where(eq(knowledgeDocs.id, id));
    const related = doc.relatedDocIds?.length
      ? await db.select({ id: knowledgeDocs.id, title: knowledgeDocs.title, docType: knowledgeDocs.docType })
          .from(knowledgeDocs)
          .where(and(eq(knowledgeDocs.userId, user.id), isNull(knowledgeDocs.deletedAt),
            sql`${knowledgeDocs.id} in (${sql.join(doc.relatedDocIds.map((x) => sql`${x}::uuid`), sql`, `)})`))
      : [];
    return ok({ doc, related });
  }

  const conds = [eq(knowledgeDocs.userId, user.id), isNull(knowledgeDocs.deletedAt)];
  if (q) conds.push(or(ilike(knowledgeDocs.title, `%${q}%`), ilike(knowledgeDocs.body, `%${q}%`), ilike(knowledgeDocs.category, `%${q}%`))!);
  if (docType) conds.push(eq(knowledgeDocs.docType, docType));
  if (category) conds.push(eq(knowledgeDocs.category, category));
  if (favorites) conds.push(eq(knowledgeDocs.isFavorite, true));
  if (tag) conds.push(sql`${tag} = any(${knowledgeDocs.tags})`);

  const rows = await db.select({
    id: knowledgeDocs.id, title: knowledgeDocs.title, docType: knowledgeDocs.docType,
    category: knowledgeDocs.category, tags: knowledgeDocs.tags, isFavorite: knowledgeDocs.isFavorite,
    language: knowledgeDocs.language, projectId: knowledgeDocs.projectId, projectName: projects.name,
    viewCount: knowledgeDocs.viewCount, version: knowledgeDocs.version,
    updatedAt: knowledgeDocs.updatedAt, createdAt: knowledgeDocs.createdAt,
    excerpt: sql<string>`left(${knowledgeDocs.body}, 220)`,
  }).from(knowledgeDocs).leftJoin(projects, eq(knowledgeDocs.projectId, projects.id))
    .where(and(...conds)).orderBy(desc(knowledgeDocs.isFavorite), desc(knowledgeDocs.updatedAt)).limit(300);

  const [facets] = await db.select({
    total: sql<number>`count(*)::int`,
    favorites: sql<number>`count(*) filter (where is_favorite)::int`,
  }).from(knowledgeDocs).where(and(eq(knowledgeDocs.userId, user.id), isNull(knowledgeDocs.deletedAt)));

  const categories = await db.select({ category: knowledgeDocs.category, n: sql<number>`count(*)::int` })
    .from(knowledgeDocs).where(and(eq(knowledgeDocs.userId, user.id), isNull(knowledgeDocs.deletedAt), sql`category is not null`))
    .groupBy(knowledgeDocs.category);

  const tagRows = await db.execute<{ tag: string; n: number }>(
    sql`select unnest(tags) as tag, count(*)::int as n from knowledge_docs
        where user_id = ${user.id} and deleted_at is null and tags is not null
        group by 1 order by n desc limit 30`,
  );

  return ok({ data: rows, facets, categories, tags: tagRows.rows });
});

export const POST = handle(async (req) => {
  const user = await requireUser();
  const body = await readJson<Record<string, unknown>>(req);

  // bulk markdown import: { import: [{ title, body, tags?, category? }] }
  if (Array.isArray(body.import)) {
    const items = body.import as Record<string, unknown>[];
    const values = items
      .map((i) => ({
        userId: user.id,
        title: String(i.title ?? "").trim().slice(0, 240) || "Untitled",
        body: String(i.body ?? ""),
        docType: DOC_TYPES.includes(String(i.docType)) ? String(i.docType) : "note",
        category: (i.category as string) || "Imported",
        tags: Array.isArray(i.tags) ? (i.tags as string[]) : ["imported"],
      }))
      .filter((v) => v.body.trim() || v.title !== "Untitled");
    if (!values.length) throw new ApiError(400, "No valid documents to import");
    const inserted = await db.insert(knowledgeDocs).values(values).returning({ id: knowledgeDocs.id });
    await audit(user.id, "knowledge", null, "imported", { count: inserted.length });
    return ok({ imported: inserted.length }, 201);
  }

  const title = String(body.title ?? "").trim();
  if (!title) throw new ApiError(400, "Title is required");
  const docType = DOC_TYPES.includes(String(body.docType)) ? String(body.docType) : "note";

  const [row] = await db.insert(knowledgeDocs).values({
    userId: user.id, title, docType,
    body: String(body.body ?? ""),
    category: (body.category as string) || null,
    language: (body.language as string) || null,
    tags: Array.isArray(body.tags) ? (body.tags as string[]) : [],
    projectId: (body.projectId as string) || null,
    relatedDocIds: Array.isArray(body.relatedDocIds) ? (body.relatedDocIds as string[]) : [],
    isFavorite: !!body.isFavorite,
  }).returning();
  await audit(user.id, "knowledge", row.id, "created", { title });
  return ok(row, 201);
});

/** PATCH — optimistic concurrency: reject writes based on a stale version. */
export const PATCH = handle(async (req) => {
  const user = await requireUser();
  const body = await readJson<Record<string, unknown>>(req);
  const id = String(body.id ?? "");
  if (!id) throw new ApiError(400, "id required");

  const [existing] = await db.select().from(knowledgeDocs)
    .where(and(eq(knowledgeDocs.id, id), eq(knowledgeDocs.userId, user.id), isNull(knowledgeDocs.deletedAt))).limit(1);
  if (!existing) throw new ApiError(404, "Document not found");

  if (body.version !== undefined && Number(body.version) !== existing.version) {
    throw new ApiError(409, `Conflict: this document is at version ${existing.version} on the server. Reload to merge your changes.`);
  }

  const patch: Record<string, unknown> = { updatedAt: new Date(), version: existing.version + 1 };
  for (const k of ["title", "body", "category", "language"]) if (body[k] !== undefined) patch[k] = body[k] ?? null;
  if (body.docType !== undefined && DOC_TYPES.includes(String(body.docType))) patch.docType = String(body.docType);
  if (body.isFavorite !== undefined) patch.isFavorite = !!body.isFavorite;
  if (Array.isArray(body.tags)) patch.tags = body.tags;
  if (Array.isArray(body.relatedDocIds)) patch.relatedDocIds = body.relatedDocIds;
  if (body.projectId !== undefined) patch.projectId = (body.projectId as string) || null;

  const [row] = await db.update(knowledgeDocs).set(patch).where(eq(knowledgeDocs.id, id)).returning();
  await audit(user.id, "knowledge", id, "updated", { version: row.version });
  return ok(row);
});

export const DELETE = handle(async (req) => {
  const user = await requireUser();
  const body = await readJson<{ id?: string }>(req);
  if (!body.id) throw new ApiError(400, "id required");
  const [existing] = await db.select({ id: knowledgeDocs.id }).from(knowledgeDocs)
    .where(and(eq(knowledgeDocs.id, body.id), eq(knowledgeDocs.userId, user.id))).limit(1);
  if (!existing) throw new ApiError(404, "Document not found");
  await db.update(knowledgeDocs).set({ deletedAt: new Date() }).where(eq(knowledgeDocs.id, body.id));
  await audit(user.id, "knowledge", body.id, "deleted");
  return ok({ deleted: true });
});
