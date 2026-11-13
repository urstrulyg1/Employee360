import { db } from "@/db";
import { employeePreferences, holidays, leaveEntries, leaveTypes } from "@/db/schema";
import { addDays, format, parseISO } from "date-fns";
import { handle, ok, requireUser } from "@/lib/api";
import { todayYMD } from "@/lib/dates";
import { and, eq, gte, ne } from "drizzle-orm";

export type BridgePlan = {
  id: string;
  anchor: string; // holiday date
  holidayName: string;
  holidayCategory: string;
  rangeStart: string;
  rangeEnd: string;
  totalDaysOff: number;
  leaveDates: string[];
  leaveDaysNeeded: number;
};

/**
 * GET /api/planner?year=2026
 * Scans the working calendar for *bridge* opportunities: for each upcoming
 * holiday, expand outward over adjacent non-working days, and compute which
 * working days would need to be taken as leave to stitch a continuous block
 * of time off. Never submits anything; saving is a separate user action.
 */
export const GET = handle(async (req) => {
  const user = await requireUser();
  const u = new URL(req.url);
  const year = Number(u.searchParams.get("year") ?? new Date().getFullYear());
  const today = todayYMD();

  const [prefs, hols, pendingLeaves] = await Promise.all([
    db.select().from(employeePreferences).where(eq(employeePreferences.userId, user.id)).limit(1),
    db.select().from(holidays).where(and(eq(holidays.year, year), gte(holidays.holidayDate, today))),
    db.select().from(leaveEntries).where(and(eq(leaveEntries.userId, user.id), gte(leaveEntries.endDate, today), ne(leaveEntries.status, "cancelled"), ne(leaveEntries.status, "rejected"))),
  ]);
  const weekendDays = prefs[0]?.weekendDays ?? [0, 6];

  const off = new Map<string, { name: string; category: string }>();
  for (const h of hols.filter((h) => ["national", "regional", "company"].includes(h.category))) {
    off.set(h.holidayDate, { name: h.name, category: h.category });
  }
  // approved/pending leaves already give you days off — count them as anchors too
  for (const l of pendingLeaves) {
    let cur = parseISO(l.startDate);
    const end = parseISO(l.endDate);
    while (cur <= end) {
      off.set(format(cur, "yyyy-MM-dd"), { name: "Leave (already on calendar)", category: "leave" });
      cur = addDays(cur, 1);
    }
  }

  const ymd = (dt: Date) => format(dt, "yyyy-MM-dd");
  const isWeekend = (date: Date) => weekendDays.includes(date.getDay());
  const isOff = (date: Date) => isWeekend(date) || off.has(ymd(date));

  const plans: BridgePlan[] = [];
  const seen = new Set<string>();

  for (const [dateStr, info] of [...off.entries()].sort()) {
    const d0 = parseISO(dateStr);
    // Expand each side up to 4 working bridge days
    let start = d0;
    let end = d0;
    const leaveDates: string[] = [];
    for (let i = 1; i <= 5; i++) {
      const prev = addDays(start, -1);
      if (isOff(prev)) { start = prev; continue; }
      if (leaveDates.length < 4) { leaveDates.unshift(ymd(prev)); start = prev; continue; }
      break;
    }
    for (let i = 1; i <= 5; i++) {
      const next = addDays(end, 1);
      if (isOff(next)) { end = next; continue; }
      const totalBridges = 4;
      if (leaveDates.length < totalBridges + 4 && leaveDates.length < 4) { leaveDates.push(ymd(next)); end = next; continue; }
      break;
    }
    const totalDaysOff = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    // Only surface genuinely interesting plans: >= 4 total days off OR at least 1 bridge day producing >= 4 off
    if (totalDaysOff < 4) continue;
    const key = `${ymd(start)}_${ymd(end)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    plans.push({
      id: key,
      anchor: dateStr,
      holidayName: info.name,
      holidayCategory: info.category,
      rangeStart: ymd(start),
      rangeEnd: ymd(end),
      totalDaysOff,
      leaveDates,
      leaveDaysNeeded: leaveDates.length,
    });
  }

  return ok({ plans: plans.slice(0, 24), weekendDays });
});

/** Saved plans are stored as `planned` leave entries via POST /api/leaves with planName. */
export { };
