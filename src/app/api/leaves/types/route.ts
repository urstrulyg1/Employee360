import { db } from "@/db";
import { leaveTypes } from "@/db/schema";
import { eq } from "drizzle-orm";
import { handle, ok, requireUser, readJson, ApiError, audit } from "@/lib/api";

export const GET = handle(async () => {
  await requireUser();
  const rows = await db.select().from(leaveTypes).where(eq(leaveTypes.isActive, true)).orderBy(leaveTypes.sortOrder);
  return ok(rows);
});

/** POST — configurable additional leave categories. */
export const POST = handle(async (req) => {
  const user = await requireUser();
  const body = await readJson<{ name?: string; annualQuota?: number; carryForwardMax?: number }>(req);
  const name = String(body.name ?? "").trim();
  if (!name) throw new ApiError(400, "Name required");
  const key = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const [row] = await db.insert(leaveTypes).values({
    key, name,
    annualQuota: String(body.annualQuota ?? 0),
    carryForwardMax: String(body.carryForwardMax ?? 0),
    sortOrder: 90,
  }).returning();
  await audit(user.id, "leave_type", row.id, "created", { name });
  return ok(row, 201);
});
