import { db } from "@/db";
import { holidayCalendars, holidays } from "@/db/schema";
import { asc, desc, eq, sql } from "drizzle-orm";
import { audit, handle, ok, ApiError, readJson, requireUser } from "@/lib/api";
import { HOLIDAY_CATEGORIES } from "@/lib/domain";

export const GET = handle(async (req) => {
  await requireUser();
  const u = new URL(req.url);
  const year = Number(u.searchParams.get("year") ?? new Date().getFullYear());
  const [rows, stats] = await Promise.all([
    db.select().from(holidays).where(eq(holidays.year, year)).orderBy(asc(holidays.holidayDate)),
    db.select({ category: holidays.category, count: sql<number>`count(*)::int` })
      .from(holidays).where(eq(holidays.year, year)).groupBy(holidays.category),
  ]);
  const years = await db.select({ year: holidays.year }).from(holidays).groupBy(holidays.year).orderBy(desc(holidays.year));

  return ok({
    year,
    availableYears: years.map((y) => y.year),
    holidays: rows,
    stats: {
      total: rows.length,
      byCategory: Object.fromEntries(stats.map((r) => [r.category, r.count])),
      weekendHits: rows.filter((r) => [0, 6].includes(new Date(r.holidayDate + "T00:00:00Z").getUTCDay())).length,
    },
  });
});

/** POST — add one holiday, or bulk-import rows: { rows: [{name, date, category, region}] } */
export const POST = handle(async (req) => {
  const user = await requireUser();
  const body = await readJson<Record<string, unknown>>(req);

  const normalize = (r: Record<string, unknown>) => ({
    name: String(r.name ?? "").trim(),
    date: String(r.date ?? "").slice(0, 10),
    category: HOLIDAY_CATEGORIES.includes(r.category as never) ? String(r.category) : "company",
    region: String(r.region ?? "Company").trim(),
  });

  const items: ReturnType<typeof normalize>[] = Array.isArray(body.rows)
    ? (body.rows as Record<string, unknown>[]).map(normalize)
    : [normalize(body)];

  const invalid = items.filter((i) => !i.name || !/^\d{4}-\d{2}-\d{2}$/.test(i.date));
  if (invalid.length) throw new ApiError(400, `Invalid rows: ${invalid.length} (need name + YYYY-MM-DD date)`);

  let [calendar] = await db.select().from(holidayCalendars).where(eq(holidayCalendars.isDefault, true)).limit(1);
  if (!calendar) {
    [calendar] = await db.insert(holidayCalendars).values({ name: "Company Calendar", isDefault: true }).returning();
  }

  const values = items.map((i) => ({
    ...calendar && { calendarId: calendar.id },
    name: i.name,
    holidayDate: i.date,
    year: Number(i.date.slice(0, 4)),
    category: i.category,
    region: i.region,
    source: Array.isArray(body.rows) ? "imported" : "manual",
  }));

  // onConflictDoNothing surfaces duplicates instead of erroring
  const inserted = await db.insert(holidays).values(values).onConflictDoNothing().returning();
  const insertedSet = new Set(inserted.map((r) => `${r.name}|${r.holidayDate}`));
  const duplicates = items.filter((i) => !insertedSet.has(`${i.name}|${i.date}`));

  await audit(user.id, "holiday", calendar.id, "imported", { added: inserted.length, duplicates: duplicates.length });
  return ok({ added: inserted.length, duplicates, inserted }, 201);
});
