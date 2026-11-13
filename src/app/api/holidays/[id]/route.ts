import { db } from "@/db";
import { holidays } from "@/db/schema";
import { eq } from "drizzle-orm";
import { audit, handle, ok, ApiError, readJson, requireUser } from "@/lib/api";
import { HOLIDAY_CATEGORIES } from "@/lib/domain";

export const PATCH = handle(async (req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const body = await readJson<Record<string, unknown>>(req);
  const [existing] = await db.select().from(holidays).where(eq(holidays.id, id)).limit(1);
  if (!existing) throw new ApiError(404, "Holiday not found");

  const patch: Partial<typeof holidays.$inferInsert> = { updatedAt: new Date() };
  if (body.name !== undefined) patch.name = String(body.name);
  if (body.holidayDate !== undefined) {
    const d = String(body.holidayDate).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new ApiError(400, "Invalid date");
    patch.holidayDate = d;
    patch.year = Number(d.slice(0, 4));
  }
  if (body.category !== undefined) {
    if (!HOLIDAY_CATEGORIES.includes(body.category as never)) throw new ApiError(400, "Invalid category");
    patch.category = String(body.category);
  }
  if (body.region !== undefined) patch.region = String(body.region);

  const [row] = await db.update(holidays).set(patch).where(eq(holidays.id, id)).returning();
  await audit(user.id, "holiday", id, "updated");
  return ok(row);
});

export const DELETE = handle(async (_req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const [existing] = await db.select({ id: holidays.id }).from(holidays).where(eq(holidays.id, id)).limit(1);
  if (!existing) throw new ApiError(404, "Holiday not found");
  await db.delete(holidays).where(eq(holidays.id, id));
  await audit(user.id, "holiday", id, "deleted");
  return ok({ deleted: true });
});
