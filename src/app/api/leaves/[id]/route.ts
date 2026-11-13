import { db } from "@/db";
import { leaveApprovals, leaveEntries } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { audit, handle, ok, ApiError, readJson, requireUser } from "@/lib/api";
import { LEAVE_STATUSES } from "@/lib/domain";

export const PATCH = handle(async (req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const body = await readJson<Record<string, unknown>>(req);

  const [existing] = await db.select().from(leaveEntries)
    .where(and(eq(leaveEntries.id, id), eq(leaveEntries.userId, user.id))).limit(1);
  if (!existing) throw new ApiError(404, "Leave entry not found");

  const patch: Partial<typeof leaveEntries.$inferInsert> = { updatedAt: new Date() };
  for (const key of ["reason", "notes", "approver", "planName"] as const) {
    if (body[key] !== undefined) patch[key] = (body[key] as string) || null;
  }
  for (const key of ["startDate", "endDate"] as const) {
    if (body[key]) patch[key] = String(body[key]);
  }
  if (body.leaveTypeId) patch.leaveTypeId = String(body.leaveTypeId);
  if (body.days !== undefined) patch.days = String(body.days);
  if (body.halfDay !== undefined) patch.halfDay = !!body.halfDay;

  const newStatus = body.status as string | undefined;
  if (newStatus) {
    if (!LEAVE_STATUSES.includes(newStatus as never)) throw new ApiError(400, "Invalid status");
    patch.status = newStatus;
    if (newStatus === "approved" || newStatus === "rejected") patch.approvedAt = new Date();
  }

  const [row] = await db.transaction(async (tx) => {
    const [updated] = await tx.update(leaveEntries).set(patch).where(eq(leaveEntries.id, id)).returning();
    if (newStatus && newStatus !== existing.status) {
      await tx.insert(leaveApprovals).values({
        leaveEntryId: id,
        action: newStatus === "approved" ? "approved" : newStatus === "rejected" ? "rejected" : newStatus === "cancelled" ? "cancelled" : "submitted",
        actor: user.name,
        note: (body.note as string) || null,
      });
    }
    return [updated];
  });

  await audit(user.id, "leave", id, "updated", newStatus ? { status: `${existing.status} -> ${newStatus}` } : undefined);
  return ok(row);
});

/** DELETE — cancel a leave entry (soft: status -> cancelled, audit trail preserved). */
export const DELETE = handle(async (_req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const [existing] = await db.select().from(leaveEntries)
    .where(and(eq(leaveEntries.id, id), eq(leaveEntries.userId, user.id))).limit(1);
  if (!existing) throw new ApiError(404, "Leave entry not found");
  await db.transaction(async (tx) => {
    await tx.update(leaveEntries).set({ status: "cancelled", updatedAt: new Date() }).where(eq(leaveEntries.id, id));
    await tx.insert(leaveApprovals).values({ leaveEntryId: id, action: "cancelled", actor: user.name });
  });
  await audit(user.id, "leave", id, "cancelled");
  return ok({ cancelled: true });
});
