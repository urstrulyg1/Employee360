import { db } from "@/db";
import { employeePreferences } from "@/db/schema";
import { eq } from "drizzle-orm";
import { audit, handle, ok, ApiError, readJson, requireUser } from "@/lib/api";
import { computeWorkload } from "@/lib/assistant";

/** GET /api/workload — daily + weekly capacity, utilisation, conflicts. */
export const GET = handle(async () => {
  const user = await requireUser();
  return ok(await computeWorkload(user.id));
});

/** PATCH — adjust working hours / weekly schedule / focus capacity. */
export const PATCH = handle(async (req) => {
  const user = await requireUser();
  const body = await readJson<{ workStartHour?: number; workEndHour?: number; focusHoursPerDay?: number; weekendDays?: number[] }>(req);

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (body.workStartHour !== undefined) {
    const v = Number(body.workStartHour);
    if (!Number.isInteger(v) || v < 0 || v > 23) throw new ApiError(400, "workStartHour must be 0–23");
    patch.workStartHour = v;
  }
  if (body.workEndHour !== undefined) {
    const v = Number(body.workEndHour);
    if (!Number.isInteger(v) || v < 1 || v > 24) throw new ApiError(400, "workEndHour must be 1–24");
    patch.workEndHour = v;
  }
  if (patch.workStartHour !== undefined && patch.workEndHour !== undefined && Number(patch.workEndHour) <= Number(patch.workStartHour)) {
    throw new ApiError(400, "Work end hour must be after start hour");
  }
  if (body.focusHoursPerDay !== undefined) {
    const v = Number(body.focusHoursPerDay);
    if (!(v >= 0 && v <= 24)) throw new ApiError(400, "focusHoursPerDay must be 0–24");
    patch.focusHoursPerDay = String(v);
  }
  if (body.weekendDays !== undefined) {
    if (!Array.isArray(body.weekendDays) || body.weekendDays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
      throw new ApiError(400, "weekendDays must be integers 0–6");
    }
    patch.weekendDays = body.weekendDays;
  }

  await db.update(employeePreferences).set(patch).where(eq(employeePreferences.userId, user.id));
  await audit(user.id, "workload", user.id, "schedule_updated", patch);
  return ok(await computeWorkload(user.id));
});
