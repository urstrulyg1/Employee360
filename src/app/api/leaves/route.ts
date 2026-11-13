import { db } from "@/db";
import { employeePreferences, holidays, leaveApprovals, leaveEntries, leaveTypes } from "@/db/schema";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { audit, handle, ok, ApiError, readJson, requireUser } from "@/lib/api";
import { businessDays, todayYMD } from "@/lib/dates";
import { LEAVE_STATUSES } from "@/lib/domain";

const BLOCKING_CATEGORIES = ["national", "regional", "company"];

async function holidaySet(yearFrom: string, yearTo: string) {
  const rows = await db.select({ d: holidays.holidayDate }).from(holidays)
    .where(inArray(holidays.category, BLOCKING_CATEGORIES));
  void yearFrom; void yearTo;
  return new Set(rows.map((r) => r.d));
}

export const GET = handle(async (req) => {
  const user = await requireUser();
  const u = new URL(req.url);
  const status = u.searchParams.get("status");
  const conds = [eq(leaveEntries.userId, user.id)];
  if (status) conds.push(eq(leaveEntries.status, status));
  const rows = await db.select({ entry: leaveEntries, type: leaveTypes })
    .from(leaveEntries).innerJoin(leaveTypes, eq(leaveEntries.leaveTypeId, leaveTypes.id))
    .where(and(...conds)).orderBy(desc(leaveEntries.startDate)).limit(300);
  return ok(rows.map((r) => ({ ...r.entry, typeName: r.type.name, typeKey: r.type.key, typeColor: r.type.color })));
});

/** POST — create a leave entry. `days` is always computed server-side from the working calendar. */
export const POST = handle(async (req) => {
  const user = await requireUser();
  const body = await readJson<Record<string, unknown>>(req);

  const startDate = String(body.startDate ?? "").slice(0, 10);
  const endDate = String(body.endDate ?? startDate).slice(0, 10);
  const leaveTypeId = String(body.leaveTypeId ?? "");
  const halfDay = !!body.halfDay;
  const status = LEAVE_STATUSES.includes((body.status as never) ?? "pending") ? String(body.status) : "pending";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) throw new ApiError(400, "Valid start/end dates required");
  if (startDate > endDate) throw new ApiError(400, "Start date must be on or before end date");
  if (startDate < "2000-01-01" || endDate > "2100-12-31") throw new ApiError(400, "Dates out of range");
  if (leaveTypeId === "") throw new ApiError(400, "Leave type required");

  const [prefs] = await db.select().from(employeePreferences).where(eq(employeePreferences.userId, user.id)).limit(1);
  const weekendDays = prefs?.weekendDays ?? [0, 6];
  const set = await holidaySet(startDate, endDate);

  if (halfDay && startDate !== endDate) throw new ApiError(400, "Half-day leave must be a single day");
  const days = businessDays(startDate, endDate, weekendDays, set, halfDay);
  if (days <= 0) throw new ApiError(400, "Selected range contains no working days (weekends/holidays excluded)");

  const [row] = await db.transaction(async (tx) => {
    const [created] = await tx.insert(leaveEntries).values({
      userId: user.id, leaveTypeId, startDate, endDate, halfDay,
      halfDayPeriod: halfDay ? (body.halfDayPeriod as string) || null : null,
      days: String(days), status,
      reason: (body.reason as string) || null,
      notes: (body.notes as string) || null,
      planName: (body.planName as string) || null,
      approver: (body.approver as string) || null,
      approvedAt: status === "approved" ? new Date() : null,
    }).returning();
    await tx.insert(leaveApprovals).values({ leaveEntryId: created.id, action: "submitted", actor: user.name, note: `Status: ${status}` });
    return [created];
  });

  await audit(user.id, "leave", row.id, "created", { startDate, endDate, days, status });
  return ok(row, 201);
});

/** GET helper endpoint used by the leave form to preview computed days. */
export const PUT = handle(async (req) => {
  const user = await requireUser();
  const body = await readJson<{ startDate: string; endDate?: string; halfDay?: boolean }>(req);
  const [prefs] = await db.select().from(employeePreferences).where(eq(employeePreferences.userId, user.id)).limit(1);
  const set = await holidaySet(body.startDate, body.endDate ?? body.startDate);
  const days = businessDays(body.startDate, body.endDate ?? body.startDate, prefs?.weekendDays ?? [0, 6], set, !!body.halfDay);
  return ok({ days, weekends: user ? undefined : undefined });
});
