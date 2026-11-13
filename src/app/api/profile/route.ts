import { db } from "@/db";
import { employeePreferences, employeeProfiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { handle, ok, requireUser, readJson } from "@/lib/api";

export const GET = handle(async () => {
  const user = await requireUser();
  const [profile] = await db.select().from(employeeProfiles).where(eq(employeeProfiles.userId, user.id)).limit(1);
  const [preferences] = await db.select().from(employeePreferences).where(eq(employeePreferences.userId, user.id)).limit(1);
  return ok({
    user: { id: user.id, name: user.name, email: user.email, timezone: user.timezone },
    profile: profile ?? null,
    preferences: preferences ?? null,
  });
});

export const PATCH = handle(async (req) => {
  const user = await requireUser();
  const body = await readJson<Record<string, unknown>>(req);
  const { profile, preferences, name, timezone } = body as {
    profile?: Record<string, unknown>;
    preferences?: Record<string, unknown>;
    name?: string;
    timezone?: string;
  };

  if (name || timezone) {
    const { users } = await import("@/db/schema");
    await db.update(users).set({
      ...(name ? { name } : {}),
      ...(timezone ? { timezone } : {}),
      updatedAt: new Date(),
    }).where(eq(users.id, user.id));
  }
  if (profile) {
    await db.update(employeeProfiles).set({ ...profile, updatedAt: new Date() }).where(eq(employeeProfiles.userId, user.id));
  }
  if (preferences) {
    await db.update(employeePreferences).set({ ...preferences, updatedAt: new Date() }).where(eq(employeePreferences.userId, user.id));
  }
  return ok({ updated: true });
});
