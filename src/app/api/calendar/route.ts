import { db } from "@/db";
import { calendarEvents, holidays, issues, leaveEntries, projects, tasks, leaveTypes } from "@/db/schema";
import { and, eq, gte, isNull, lte, ne } from "drizzle-orm";
import { audit, handle, ok, ApiError, readJson, requireUser } from "@/lib/api";
import { todayYMD } from "@/lib/dates";

export type CalEvent = {
  id: string;
  title: string;
  category: string;
  date: string;
  endDate?: string | null;
  startTime?: string | null;
  allDay: boolean;
  source?: "synced" | "manual";
  sourceRef?: string | null;
  meta?: Record<string, string | null>;
};

/** GET /api/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD — merges synced module events with manual events (no duplicates). */
export const GET = handle(async (req) => {
  const user = await requireUser();
  const u = new URL(req.url);
  const today = todayYMD();
  const from = (u.searchParams.get("from") ?? today.slice(0, 8) + "01").slice(0, 10);
  const defaultTo = new Date(parseYMDd(from)); defaultTo.setMonth(defaultTo.getMonth() + 2);
  const to = (u.searchParams.get("to") ?? defaultTo.toISOString().slice(0, 10)).slice(0, 10);

  function parseYMDd(s: string) { return new Date(s + "T00:00:00Z"); }

  const [myIssues, myTasks, myLeaves, hols, own, projectMilestones] = await Promise.all([
    db.select().from(issues).where(and(eq(issues.userId, user.id), isNull(issues.deletedAt), ne(issues.status, "closed"), gte(issues.dueDate, from), lte(issues.dueDate, to))),
    db.select().from(tasks).where(and(eq(tasks.userId, user.id), isNull(tasks.deletedAt), ne(tasks.status, "done"), gte(tasks.dueDate, from), lte(tasks.dueDate, to))),
    db.select({ entry: leaveEntries, type: leaveTypes }).from(leaveEntries).innerJoin(leaveTypes, eq(leaveEntries.leaveTypeId, leaveTypes.id))
      .where(and(eq(leaveEntries.userId, user.id), lte(leaveEntries.startDate, to), gte(leaveEntries.endDate, from), ne(leaveEntries.status, "cancelled"), ne(leaveEntries.status, "rejected"))),
    db.select().from(holidays).where(and(gte(holidays.holidayDate, from), lte(holidays.holidayDate, to))),
    db.select().from(calendarEvents).where(and(eq(calendarEvents.userId, user.id), gte(calendarEvents.eventDate, from), lte(calendarEvents.eventDate, to))),
    db.select().from(projects).where(and(eq(projects.userId, user.id), isNull(projects.deletedAt), gte(projects.targetDate, from), lte(projects.targetDate, to))),
  ]);

  const events: CalEvent[] = [
    ...myIssues.map((i) => ({
      id: `issue-${i.id}`, title: `${i.key} · ${i.title}`, category: "issue", date: i.dueDate!, allDay: true,
      source: "synced" as const, sourceRef: `/issues/${i.id}`,
      meta: { status: i.status, priority: i.priority },
    })),
    ...myTasks.map((t) => ({
      id: `task-${t.id}`, title: t.title, category: "task", date: t.dueDate!, allDay: true,
      source: "synced" as const, sourceRef: "/tasks", meta: { status: t.status, priority: t.priority },
    })),
    ...myLeaves.map(({ entry, type }) => ({
      id: `leave-${entry.id}`, title: `${type.name}${entry.halfDay ? " (½)" : ""}`, category: "leave",
      date: entry.startDate, endDate: entry.endDate, allDay: true,
      source: "synced" as const, sourceRef: "/leaves", meta: { status: entry.status, type: type.name },
    })),
    ...hols.map((h) => ({
      id: `holiday-${h.id}`, title: h.name, category: "holiday", date: h.holidayDate, allDay: true,
      source: "synced" as const, sourceRef: "/holidays", meta: { category: h.category, region: h.region },
    })),
    ...projectMilestones.map((p) => ({
      id: `milestone-${p.id}`, title: `${p.name} target`, category: "milestone", date: p.targetDate!, allDay: true,
      source: "synced" as const, sourceRef: "/projects", meta: { status: p.status },
    })),
    ...own.map((e) => ({
      id: e.id, title: e.title, category: e.category, date: e.eventDate, endDate: e.endDate,
      startTime: e.startTime, allDay: e.allDay, source: "manual" as const, meta: { recurrence: e.recurrence },
    })),
  ];

  return ok({ from, to, events });
});

/** POST — create a manual calendar event (meeting / reminder / personal). */
export const POST = handle(async (req) => {
  const user = await requireUser();
  const body = await readJson<Record<string, unknown>>(req);
  const title = String(body.title ?? "").trim();
  const eventDate = String(body.eventDate ?? "").slice(0, 10);
  if (!title) throw new ApiError(400, "Title required");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) throw new ApiError(400, "Valid eventDate required");
  const allowed = ["meeting", "reminder", "milestone"];
  const category = allowed.includes(String(body.category)) ? String(body.category) : "meeting";

  const [row] = await db.insert(calendarEvents).values({
    userId: user.id, title, eventDate, category,
    description: (body.description as string) || null,
    endDate: body.endDate ? String(body.endDate).slice(0, 10) : null,
    startTime: body.startTime ? String(body.startTime).slice(0, 5) : null,
    allDay: !body.startTime,
    recurrence: body.recurrence ? String(body.recurrence) : null,
  }).returning();
  await audit(user.id, "calendar_event", row.id, "created", { title });
  return ok(row, 201);
});

/** PATCH / DELETE with id in body (manual events only). */
export const PATCH = handle(async (req) => {
  const user = await requireUser();
  const body = await readJson<Record<string, unknown>>(req);
  const id = String(body.id ?? "");
  if (!id) throw new ApiError(400, "id required");
  const [existing] = await db.select().from(calendarEvents).where(and(eq(calendarEvents.id, id), eq(calendarEvents.userId, user.id))).limit(1);
  if (!existing) throw new ApiError(404, "Event not found");
  const patch: Partial<typeof calendarEvents.$inferInsert> = { updatedAt: new Date() };
  if (body.title !== undefined) patch.title = String(body.title) || existing.title;
  for (const key of ["description", "recurrence", "startTime"] as const) {
    if (body[key] !== undefined) patch[key] = (body[key] as string) || null;
  }
  if (body.eventDate) patch.eventDate = String(body.eventDate).slice(0, 10);
  if (body.endDate !== undefined) patch.endDate = body.endDate ? String(body.endDate).slice(0, 10) : null;
  if (body.category !== undefined) patch.category = String(body.category);
  const [row] = await db.update(calendarEvents).set(patch).where(eq(calendarEvents.id, id)).returning();
  await audit(user.id, "calendar_event", id, "updated");
  return ok(row);
});

export const DELETE = handle(async (req) => {
  const user = await requireUser();
  const body = await readJson<{ id?: string }>(req);
  if (!body.id) throw new ApiError(400, "id required");
  await db.delete(calendarEvents).where(and(eq(calendarEvents.id, body.id), eq(calendarEvents.userId, user.id)));
  return ok({ deleted: true });
});
