import { db } from "@/db";
import { employeePreferences, leaveBalanceAdjustments, leaveBalances, leaveEntries, leaveTypes } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { audit, handle, ok, ApiError, readJson, requireUser } from "@/lib/api";

/**
 * GET /api/leaves/balances?year=2026
 * Balance rule (configurable company policy):
 *   remaining = opening + accrued + carryForward + adjustments − taken(approved)
 *   − pending only when `reservePendingLeave` is enabled.
 * Planned leave never reduces the balance.
 */
export const GET = handle(async (req) => {
  const user = await requireUser();
  const u = new URL(req.url);
  const year = Number(u.searchParams.get("year") ?? new Date().getFullYear());

  const [types, balances, entries, prefs, adjustments] = await Promise.all([
    db.select().from(leaveTypes).where(eq(leaveTypes.isActive, true)).orderBy(leaveTypes.sortOrder),
    db.select().from(leaveBalances).where(and(eq(leaveBalances.userId, user.id), eq(leaveBalances.year, year))),
    db.select().from(leaveEntries).where(eq(leaveEntries.userId, user.id)),
    db.select().from(employeePreferences).where(eq(employeePreferences.userId, user.id)).limit(1),
    db.select().from(leaveBalanceAdjustments),
  ]);
  const reservePending = prefs[0]?.reservePendingLeave ?? false;

  const inYear = entries.filter((e) => e.startDate.startsWith(String(year)));
  const byId = new Map(balances.map((b) => [b.leaveTypeId, b]));

  const data = types.map((t) => {
    const b = byId.get(t.id);
    const taken = inYear.filter((e) => e.leaveTypeId === t.id && e.status === "approved").reduce((s, e) => s + Number(e.days), 0);
    const pending = inYear.filter((e) => e.leaveTypeId === t.id && e.status === "pending").reduce((s, e) => s + Number(e.days), 0);
    const planned = inYear.filter((e) => e.leaveTypeId === t.id && e.status === "planned").reduce((s, e) => s + Number(e.days), 0);
    const opening = Number(b?.opening ?? 0);
    const accrued = Number(b?.accrued ?? 0);
    const carryForward = Number(b?.carryForward ?? 0);
    const adj = Number(b?.adjustments ?? 0);
    const remaining = Math.round((opening + accrued + carryForward + adj - taken - (reservePending ? pending : 0)) * 100) / 100;
    return {
      typeId: t.id, key: t.key, name: t.name, color: t.color,
      opening, accrued, carryForward, adjustments: adj, taken, pending, planned,
      remaining, unlimited: Number(t.annualQuota) === 0 && t.key === "unpaid",
      adjustmentRows: adjustments.filter((a) => a.leaveBalanceId === b?.id),
    };
  });

  return ok({ year, reservePending, data });
});

/** POST — manual balance adjustment (audit-logged). */
export const POST = handle(async (req) => {
  const user = await requireUser();
  const body = await readJson<{ leaveTypeId?: string; year?: number; amount?: number; reason?: string }>(req);
  if (!body.leaveTypeId || body.amount === undefined || !body.reason?.trim()) {
    throw new ApiError(400, "leaveTypeId, amount and reason are required");
  }
  const year = Number(body.year ?? new Date().getFullYear());

  const result = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(leaveBalances)
      .where(and(eq(leaveBalances.userId, user.id), eq(leaveBalances.leaveTypeId, body.leaveTypeId!), eq(leaveBalances.year, year))).limit(1);
    let balance = existing;
    if (!balance) {
      [balance] = await tx.insert(leaveBalances).values({ userId: user.id, leaveTypeId: body.leaveTypeId!, year }).returning();
    } else {
      [balance] = await tx.update(leaveBalances)
        .set({ adjustments: String(Number(balance.adjustments) + Number(body.amount)), updatedAt: new Date() })
        .where(eq(leaveBalances.id, balance.id)).returning();
    }
    const [adj] = await tx.insert(leaveBalanceAdjustments).values({
      leaveBalanceId: balance.id, amount: String(body.amount), reason: body.reason!.trim(), createdBy: user.name,
    }).returning();
    return { balance, adjustment: adj };
  });

  await audit(user.id, "leave_balance", result.balance.id, "adjusted", { amount: body.amount, reason: body.reason });
  return ok(result, 201);
});
