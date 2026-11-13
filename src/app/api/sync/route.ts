import { createHash } from "crypto";
import { db } from "@/db";
import * as s from "@/db/schema";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { audit, handle, ok, ApiError, readJson, requireUser } from "@/lib/api";

/**
 * Cloud synchronisation & backup.
 *
 * Model: the PostgreSQL database is the authoritative cloud replica. Desktop /
 * browser clients keep a local cache and push changes with the `version` they
 * last saw. Writes carrying a stale version are rejected (HTTP 409) instead of
 * silently overwriting newer data — optimistic concurrency control.
 */

const SYNCED_TABLES = ["issues", "tasks", "knowledge_docs", "meetings"] as const;

/**
 * Canonical JSON: recursively sorts object keys so the hash is stable across a
 * JSON -> jsonb -> JSON round-trip (Postgres does not preserve key order).
 */
function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object" && !(v instanceof Date)) {
    return Object.keys(v as Record<string, unknown>).sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = canonical((v as Record<string, unknown>)[k]);
        return acc;
      }, {});
  }
  return v;
}

function checksum(payload: unknown) {
  // normalise through JSON first so Date -> ISO string, matching the stored jsonb
  const normalised = JSON.parse(JSON.stringify(payload));
  return createHash("sha256").update(JSON.stringify(canonical(normalised))).digest("hex");
}

/** GET — sync status, pending changes since cursor, conflict count. */
export const GET = handle(async (req) => {
  const user = await requireUser();
  const u = new URL(req.url);
  const deviceId = u.searchParams.get("deviceId") ?? "web-default";
  const since = u.searchParams.get("since");

  let [state] = await db.select().from(s.syncState)
    .where(and(eq(s.syncState.userId, user.id), eq(s.syncState.deviceId, deviceId))).limit(1);
  if (!state) {
    [state] = await db.insert(s.syncState).values({
      userId: user.id, deviceId, deviceLabel: u.searchParams.get("label") ?? "This device", status: "idle",
    }).onConflictDoNothing().returning();
    if (!state) {
      [state] = await db.select().from(s.syncState)
        .where(and(eq(s.syncState.userId, user.id), eq(s.syncState.deviceId, deviceId))).limit(1);
    }
  }

  const cursor = since ? new Date(since) : state?.lastCursor ?? new Date(0);

  const [issueChanges, taskChanges, docChanges, meetingChanges] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(s.issues).where(and(eq(s.issues.userId, user.id), gt(s.issues.updatedAt, cursor))),
    db.select({ n: sql<number>`count(*)::int` }).from(s.tasks).where(and(eq(s.tasks.userId, user.id), gt(s.tasks.updatedAt, cursor))),
    db.select({ n: sql<number>`count(*)::int` }).from(s.knowledgeDocs).where(and(eq(s.knowledgeDocs.userId, user.id), gt(s.knowledgeDocs.updatedAt, cursor))),
    db.select({ n: sql<number>`count(*)::int` }).from(s.meetings).where(and(eq(s.meetings.userId, user.id), gt(s.meetings.updatedAt, cursor))),
  ]);

  const backups = await db.select({
    id: s.backupSnapshots.id, label: s.backupSnapshots.label, recordCount: s.backupSnapshots.recordCount,
    sizeBytes: s.backupSnapshots.sizeBytes, checksum: s.backupSnapshots.checksum,
    verifiedAt: s.backupSnapshots.verifiedAt, verifyResult: s.backupSnapshots.verifyResult,
    createdAt: s.backupSnapshots.createdAt,
  }).from(s.backupSnapshots).where(eq(s.backupSnapshots.userId, user.id)).orderBy(desc(s.backupSnapshots.createdAt)).limit(10);

  const devices = await db.select().from(s.syncState).where(eq(s.syncState.userId, user.id)).orderBy(desc(s.syncState.updatedAt));

  return ok({
    state,
    devices,
    changes: {
      issues: issueChanges[0]?.n ?? 0,
      tasks: taskChanges[0]?.n ?? 0,
      knowledge: docChanges[0]?.n ?? 0,
      meetings: meetingChanges[0]?.n ?? 0,
      total: (issueChanges[0]?.n ?? 0) + (taskChanges[0]?.n ?? 0) + (docChanges[0]?.n ?? 0) + (meetingChanges[0]?.n ?? 0),
    },
    syncedTables: SYNCED_TABLES,
    backups,
    serverTime: new Date().toISOString(),
  });
});

/**
 * POST — operations:
 *  { op:"pull", deviceId, since }         → changed records for offline cache
 *  { op:"push", deviceId, changes:[...] } → apply with version checks
 *  { op:"backup", label }                 → snapshot + checksum
 *  { op:"verify", backupId }              → recompute checksum
 *  { op:"restore", backupId }             → restore knowledge docs (non-destructive)
 */
export const POST = handle(async (req) => {
  const user = await requireUser();
  const body = await readJson<Record<string, unknown>>(req);
  const op = String(body.op ?? "");
  const deviceId = String(body.deviceId ?? "web-default");

  const touchState = async (patch: Record<string, unknown>) => {
    await db.insert(s.syncState)
      .values({ userId: user.id, deviceId, deviceLabel: "This device", ...patch })
      .onConflictDoUpdate({ target: [s.syncState.userId, s.syncState.deviceId], set: { ...patch, updatedAt: new Date() } });
  };

  /* ---------------------------------------------------------- PULL */
  if (op === "pull") {
    const since = body.since ? new Date(String(body.since)) : new Date(0);
    const [issues, tasks, docs, meetings] = await Promise.all([
      db.select().from(s.issues).where(and(eq(s.issues.userId, user.id), gt(s.issues.updatedAt, since))).limit(500),
      db.select().from(s.tasks).where(and(eq(s.tasks.userId, user.id), gt(s.tasks.updatedAt, since))).limit(500),
      db.select().from(s.knowledgeDocs).where(and(eq(s.knowledgeDocs.userId, user.id), gt(s.knowledgeDocs.updatedAt, since))).limit(500),
      db.select().from(s.meetings).where(and(eq(s.meetings.userId, user.id), gt(s.meetings.updatedAt, since))).limit(500),
    ]);
    const now = new Date();
    await touchState({ lastSyncAt: now, lastCursor: now, status: "idle", pendingOps: 0, lastError: null });
    const payload = { issues, tasks, knowledgeDocs: docs, meetings };
    return ok({
      pulledAt: now.toISOString(),
      counts: { issues: issues.length, tasks: tasks.length, knowledge: docs.length, meetings: meetings.length },
      checksum: checksum(payload),
      data: payload,
    });
  }

  /* ---------------------------------------------------------- PUSH */
  if (op === "push") {
    const changes = Array.isArray(body.changes) ? (body.changes as Record<string, unknown>[]) : [];
    if (!changes.length) throw new ApiError(400, "changes[] is required");

    const applied: string[] = [];
    const conflicts: { table: string; id: string; clientVersion: number; serverVersion: number; reason: string }[] = [];

    for (const ch of changes) {
      const table = String(ch.table ?? "");
      const id = String(ch.id ?? "");
      const clientVersion = Number(ch.version ?? 0);
      const fields = (ch.fields ?? {}) as Record<string, unknown>;
      if (!id || !SYNCED_TABLES.includes(table as typeof SYNCED_TABLES[number])) {
        conflicts.push({ table, id, clientVersion, serverVersion: -1, reason: "Unknown table or id" });
        continue;
      }

      if (table === "knowledge_docs") {
        const [cur] = await db.select().from(s.knowledgeDocs)
          .where(and(eq(s.knowledgeDocs.id, id), eq(s.knowledgeDocs.userId, user.id))).limit(1);
        if (!cur) { conflicts.push({ table, id, clientVersion, serverVersion: -1, reason: "Record not found" }); continue; }
        if (cur.version !== clientVersion) {
          conflicts.push({ table, id, clientVersion, serverVersion: cur.version, reason: "Server copy is newer" });
          continue;
        }
        const safe: Record<string, unknown> = { updatedAt: new Date(), version: cur.version + 1 };
        for (const k of ["title", "body", "category", "docType", "language"]) if (fields[k] !== undefined) safe[k] = fields[k];
        if (Array.isArray(fields.tags)) safe.tags = fields.tags;
        await db.update(s.knowledgeDocs).set(safe).where(eq(s.knowledgeDocs.id, id));
        applied.push(id);
      } else if (table === "issues") {
        const [cur] = await db.select().from(s.issues).where(and(eq(s.issues.id, id), eq(s.issues.userId, user.id))).limit(1);
        if (!cur) { conflicts.push({ table, id, clientVersion, serverVersion: -1, reason: "Record not found" }); continue; }
        if (cur.version !== clientVersion) { conflicts.push({ table, id, clientVersion, serverVersion: cur.version, reason: "Server copy is newer" }); continue; }
        const safe: Record<string, unknown> = { updatedAt: new Date(), version: cur.version + 1 };
        for (const k of ["title", "description", "status", "priority", "dueDate"]) if (fields[k] !== undefined) safe[k] = fields[k];
        await db.update(s.issues).set(safe).where(eq(s.issues.id, id));
        applied.push(id);
      } else if (table === "tasks") {
        const [cur] = await db.select().from(s.tasks).where(and(eq(s.tasks.id, id), eq(s.tasks.userId, user.id))).limit(1);
        if (!cur) { conflicts.push({ table, id, clientVersion, serverVersion: -1, reason: "Record not found" }); continue; }
        if (cur.version !== clientVersion) { conflicts.push({ table, id, clientVersion, serverVersion: cur.version, reason: "Server copy is newer" }); continue; }
        const safe: Record<string, unknown> = { updatedAt: new Date(), version: cur.version + 1 };
        for (const k of ["title", "description", "status", "priority", "dueDate", "progress"]) if (fields[k] !== undefined) safe[k] = fields[k];
        await db.update(s.tasks).set(safe).where(eq(s.tasks.id, id));
        applied.push(id);
      } else if (table === "meetings") {
        const [cur] = await db.select().from(s.meetings).where(and(eq(s.meetings.id, id), eq(s.meetings.userId, user.id))).limit(1);
        if (!cur) { conflicts.push({ table, id, clientVersion, serverVersion: -1, reason: "Record not found" }); continue; }
        if (cur.version !== clientVersion) { conflicts.push({ table, id, clientVersion, serverVersion: cur.version, reason: "Server copy is newer" }); continue; }
        const safe: Record<string, unknown> = { updatedAt: new Date(), version: cur.version + 1 };
        for (const k of ["title", "notes", "feedback", "decisions"]) if (fields[k] !== undefined) safe[k] = fields[k];
        await db.update(s.meetings).set(safe).where(eq(s.meetings.id, id));
        applied.push(id);
      }
    }

    const now = new Date();
    await touchState({
      lastSyncAt: now, lastCursor: now,
      status: conflicts.length ? "conflict" : "idle",
      pendingOps: conflicts.length,
      conflictCount: conflicts.length,
      lastError: conflicts.length ? `${conflicts.length} conflict(s) require resolution` : null,
    });
    await audit(user.id, "sync", deviceId, "push", { applied: applied.length, conflicts: conflicts.length });
    return ok({ applied: applied.length, conflicts, syncedAt: now.toISOString() }, conflicts.length ? 409 : 200);
  }

  /* -------------------------------------------------------- BACKUP */
  if (op === "backup") {
    const label = String(body.label ?? `Backup ${new Date().toISOString().slice(0, 16).replace("T", " ")}`);
    const [issues, tasks, docs, meetingRows, journals, leaves, goals] = await Promise.all([
      db.select().from(s.issues).where(and(eq(s.issues.userId, user.id), isNull(s.issues.deletedAt))),
      db.select().from(s.tasks).where(and(eq(s.tasks.userId, user.id), isNull(s.tasks.deletedAt))),
      db.select().from(s.knowledgeDocs).where(and(eq(s.knowledgeDocs.userId, user.id), isNull(s.knowledgeDocs.deletedAt))),
      db.select().from(s.meetings).where(and(eq(s.meetings.userId, user.id), isNull(s.meetings.deletedAt))),
      db.select().from(s.dailyJournals).where(eq(s.dailyJournals.userId, user.id)),
      db.select().from(s.leaveEntries).where(eq(s.leaveEntries.userId, user.id)),
      db.select().from(s.careerGoals).where(and(eq(s.careerGoals.userId, user.id), isNull(s.careerGoals.deletedAt))),
    ]);
    const payload = { issues, tasks, knowledgeDocs: docs, meetings: meetingRows, journals, leaves, goals, takenAt: new Date().toISOString() };
    const sum = checksum(payload);
    const size = Buffer.byteLength(JSON.stringify(payload));
    const recordCount = issues.length + tasks.length + docs.length + meetingRows.length + journals.length + leaves.length + goals.length;

    const [row] = await db.insert(s.backupSnapshots).values({
      userId: user.id, label, payload, checksum: sum, recordCount, sizeBytes: size,
      verifiedAt: new Date(), verifyResult: "verified",
    }).returning({ id: s.backupSnapshots.id, label: s.backupSnapshots.label, checksum: s.backupSnapshots.checksum, recordCount: s.backupSnapshots.recordCount, sizeBytes: s.backupSnapshots.sizeBytes, createdAt: s.backupSnapshots.createdAt });

    await audit(user.id, "backup", row.id, "created", { recordCount, sizeBytes: size });
    return ok({ backup: row, verified: true }, 201);
  }

  /* -------------------------------------------------------- VERIFY */
  if (op === "verify") {
    const backupId = String(body.backupId ?? "");
    if (!backupId) throw new ApiError(400, "backupId required");
    const [b] = await db.select().from(s.backupSnapshots)
      .where(and(eq(s.backupSnapshots.id, backupId), eq(s.backupSnapshots.userId, user.id))).limit(1);
    if (!b) throw new ApiError(404, "Backup not found");
    const recomputed = checksum(b.payload);
    const okResult = recomputed === b.checksum;
    await db.update(s.backupSnapshots)
      .set({ verifiedAt: new Date(), verifyResult: okResult ? "verified" : "corrupt" })
      .where(eq(s.backupSnapshots.id, backupId));
    await audit(user.id, "backup", backupId, "verified", { result: okResult });
    return ok({ verified: okResult, expected: b.checksum, actual: recomputed });
  }

  /* ------------------------------------------------------- RESTORE */
  if (op === "restore") {
    const backupId = String(body.backupId ?? "");
    if (!backupId) throw new ApiError(400, "backupId required");
    const [b] = await db.select().from(s.backupSnapshots)
      .where(and(eq(s.backupSnapshots.id, backupId), eq(s.backupSnapshots.userId, user.id))).limit(1);
    if (!b) throw new ApiError(404, "Backup not found");
    if (checksum(b.payload) !== b.checksum) throw new ApiError(422, "Backup failed checksum verification — refusing to restore.");

    // Non-destructive restore: re-insert knowledge docs that no longer exist.
    const payload = b.payload as { knowledgeDocs?: (typeof s.knowledgeDocs.$inferSelect)[] };
    const docs = payload.knowledgeDocs ?? [];
    let restored = 0;
    for (const d of docs) {
      const [exists] = await db.select({ id: s.knowledgeDocs.id }).from(s.knowledgeDocs)
        .where(and(eq(s.knowledgeDocs.id, d.id), isNull(s.knowledgeDocs.deletedAt))).limit(1);
      if (exists) continue;
      await db.insert(s.knowledgeDocs).values({
        id: d.id, userId: user.id, title: d.title, body: d.body, docType: d.docType,
        category: d.category, tags: d.tags, language: d.language, isFavorite: d.isFavorite,
        version: d.version,
      }).onConflictDoUpdate({ target: s.knowledgeDocs.id, set: { deletedAt: null, updatedAt: new Date() } });
      restored++;
    }
    await audit(user.id, "backup", backupId, "restored", { restored });
    return ok({ restored, scanned: docs.length });
  }

  throw new ApiError(400, "Unknown op (pull | push | backup | verify | restore)");
});
