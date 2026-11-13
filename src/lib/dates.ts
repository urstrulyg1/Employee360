import { addDays, parseISO, format, isBefore, isAfter, startOfWeek } from "date-fns";

export const toYMD = (d: Date) => format(d, "yyyy-MM-dd");
export const parseYMD = (s: string) => parseISO(s.slice(0, 10));
export const todayYMD = () => toYMD(new Date());

export function eachDayYMD(startYMD: string, endYMD: string): string[] {
  const out: string[] = [];
  let d = parseYMD(startYMD);
  const end = parseYMD(endYMD);
  let guard = 0;
  while (!isAfter(d, end) && guard < 400) {
    out.push(toYMD(d));
    d = addDays(d, 1);
    guard++;
  }
  return out;
}

export function isWeekendYMD(ymd: string, weekendDays: number[]) {
  return weekendDays.includes(parseYMD(ymd).getDay());
}

/**
 * Business-day leave calculation:
 * counts calendar days in [start, end] excluding configured weekend days and
 * holidays. Half-day leave counts as 0.5.
 */
export function businessDays(
  startYMD: string,
  endYMD: string,
  weekendDays: number[],
  holidayDates: Set<string>,
  halfDay = false,
): number {
  const days = eachDayYMD(startYMD, endYMD).filter(
    (d) => !isWeekendYMD(d, weekendDays) && !holidayDates.has(d),
  );
  if (halfDay && startYMD === endYMD) return days.length ? 0.5 : 0;
  const raw = days.length;
  return halfDay ? Math.max(0, raw - 0.5) : raw;
}

export function humanize(ymd?: string | null) {
  if (!ymd) return "—";
  try {
    return format(parseYMD(ymd), "d MMM yyyy");
  } catch {
    return ymd;
  }
}

export function humanizeShort(ymd?: string | null) {
  if (!ymd) return "—";
  try {
    return format(parseYMD(ymd), "d MMM");
  } catch {
    return ymd;
  }
}

export function weekStartYMD(d = new Date()) {
  return toYMD(startOfWeek(d, { weekStartsOn: 1 }));
}

export function daysUntil(ymd: string) {
  const now = parseYMD(todayYMD());
  const target = parseYMD(ymd);
  return Math.round((target.getTime() - now.getTime()) / 86400000);
}

export function isPastYMD(ymd: string) {
  return isBefore(parseYMD(ymd), parseYMD(todayYMD()));
}

/** Format an ISO/Date timestamp in an employee timezone. */
export function inTz(input: string | Date, tz: string, opts?: Intl.DateTimeFormatOptions) {
  const d = typeof input === "string" ? new Date(input) : input;
  return d.toLocaleString("en-GB", {
    timeZone: tz,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    ...opts,
  });
}
