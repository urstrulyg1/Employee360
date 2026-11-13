import { db } from "@/db";
import { careerAchievements, careerGoals, dailyJournals, holidays, issues, knowledgeDocs, leaveBalances, leaveEntries, leaveTypes, meetingActionItems, meetings, projects, tasks } from "@/db/schema";
import { and, desc, eq, gte, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import { handle, requireUser } from "@/lib/api";
import { humanize, todayYMD } from "@/lib/dates";
import { computeWorkload } from "@/lib/assistant";
import { format, startOfWeek, subDays } from "date-fns";
import { label } from "@/lib/domain";
import * as XLSX from "xlsx";

type Row = Record<string, string | number | null>;

function toCsv(rows: Row[]) {
  if (!rows.length) return "No records\n";
  const headers = Object.keys(rows[0]);
  const esc = (v: string | number | null) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
}

export const GET = handle(async (req) => {
  const user = await requireUser();
  const u = new URL(req.url);
  const type = u.searchParams.get("type") ?? "issues";
  const formatParam = u.searchParams.get("format") ?? "csv";
  const month = u.searchParams.get("month") ?? todayYMD().slice(0, 7);
  const year = Number(u.searchParams.get("year") ?? new Date().getFullYear());
  const today = todayYMD();

  let rows: Row[] = [];
  let sheetName = "report";
  let title = type;

  if (type === "issues") {
    title = "Issue Tracking Report";
    const data = await db.select({ i: issues, p: projects }).from(issues).leftJoin(projects, eq(issues.projectId, projects.id))
      .where(and(eq(issues.userId, user.id), isNull(issues.deletedAt))).orderBy(desc(issues.createdAt));
    rows = data.map(({ i, p }) => ({
      Key: i.key, Title: i.title, Type: label(i.type), Status: label(i.status), Priority: label(i.priority),
      Project: p?.name ?? "", Assignee: i.assignee, Reporter: i.reporter,
      "Created": i.createdAt.toISOString().slice(0, 10), "Start Date": i.startDate, "Due Date": i.dueDate,
      "Resolved": i.resolvedAt?.toISOString().slice(0, 10) ?? null,
      "Est Hours": i.estimatedHours, "Actual Hours": i.actualHours, Tags: (i.tags ?? []).join("; "),
    }));
    sheetName = "Issues";
  } else if (type === "leave-history") {
    title = "Leave History Report";
    const data = await db.select({ e: leaveEntries, t: leaveTypes }).from(leaveEntries).innerJoin(leaveTypes, eq(leaveEntries.leaveTypeId, leaveTypes.id))
      .where(eq(leaveEntries.userId, user.id)).orderBy(desc(leaveEntries.startDate));
    rows = data.map(({ e, t }) => ({
      Type: t.name, Status: label(e.status), From: e.startDate, To: e.endDate, "Half Day": e.halfDay ? "yes" : "no",
      Days: e.days, Reason: e.reason, Approver: e.approver, Plan: e.planName, "Applied On": e.createdAt.toISOString().slice(0, 10),
    }));
    sheetName = "Leave History";
  } else if (type === "leave-balance") {
    title = `Leave Balance Report ${year}`;
    const [types, balances, entries] = await Promise.all([
      db.select().from(leaveTypes).where(eq(leaveTypes.isActive, true)).orderBy(leaveTypes.sortOrder),
      db.select().from(leaveBalances).where(and(eq(leaveBalances.userId, user.id), eq(leaveBalances.year, year))),
      db.select().from(leaveEntries).where(eq(leaveEntries.userId, user.id)),
    ]);
    rows = types.map((t) => {
      const b = balances.find((x) => x.leaveTypeId === t.id);
      const taken = entries.filter((e) => e.leaveTypeId === t.id && e.status === "approved" && e.startDate.startsWith(String(year))).reduce((s, e) => s + Number(e.days), 0);
      const pending = entries.filter((e) => e.leaveTypeId === t.id && e.status === "pending" && e.startDate.startsWith(String(year))).reduce((s, e) => s + Number(e.days), 0);
      return {
        Category: t.name, Year: year, Opening: b?.opening ?? "0", Accrued: b?.accrued ?? "0", "Carry Forward": b?.carryForward ?? "0",
        Adjustments: b?.adjustments ?? "0", "Taken (Approved)": taken, "Pending Approval": pending,
        Remaining: Math.round((Number(b?.opening ?? 0) + Number(b?.accrued ?? 0) + Number(b?.carryForward ?? 0) + Number(b?.adjustments ?? 0) - taken) * 100) / 100,
      };
    });
    sheetName = "Leave Balance";
  } else if (type === "weekly-work" || type === "monthly-work") {
    const recent = type === "weekly-work";
    title = recent ? "Weekly Work Report" : `Monthly Work Report ${month}`;
    const data = await db.select().from(dailyJournals).where(and(eq(dailyJournals.userId, user.id),
      recent ? sql`journal_date >= ${today}::date - 7` : sql`to_char(journal_date::date,'YYYY-MM') = ${month}`))
      .orderBy(desc(dailyJournals.journalDate));
    rows = data.map((j) => ({
      Date: j.journalDate, Summary: j.summary, "Hours": j.timeSpentHours, Meetings: j.meetings,
      "Tasks Completed": (j.tasksCompleted ?? []).join("; "), "Issues": (j.issuesWorkedOn ?? []).join("; "),
      Challenges: j.challenges, Learnings: j.learnings, "Next Day Priorities": j.nextDayPriorities,
    }));
    sheetName = recent ? "Weekly Work" : "Monthly Work";
  } else if (type === "holidays") {
    title = `Holiday Calendar ${year}`;
    const data = await db.select().from(holidays).where(eq(holidays.year, year)).orderBy(holidays.holidayDate);
    rows = data.map((h) => ({ Date: h.holidayDate, Day: new Date(h.holidayDate + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" }), Name: h.name, Category: label(h.category), Region: h.region, Source: h.source }));
    sheetName = "Holidays";
  } else if (type === "projects") {
    title = "Project Progress Report";
    const data = await db.select().from(projects).where(and(eq(projects.userId, user.id), isNull(projects.deletedAt)));
    const issueCounts = await db.select({ projectId: issues.projectId, open: sql<number>`count(*) filter (where status not in ('resolved','closed'))::int`, total: sql<number>`count(*)::int` })
      .from(issues).where(and(eq(issues.userId, user.id), isNull(issues.deletedAt))).groupBy(issues.projectId);
    rows = data.map((p) => {
      const c = issueCounts.find((x) => x.projectId === p.id);
      return { Project: p.name, Key: p.key, Status: label(p.status), Owner: p.owner, "Start": p.startDate, "Target": p.targetDate, "Open Issues": c?.open ?? 0, "Total Issues": c?.total ?? 0, Technologies: (p.technologies ?? []).join("; ") };
    });
    sheetName = "Projects";
  } else if (type === "achievements") {
    title = "Career Achievements Report";
    const [ach, goalData] = await Promise.all([
      db.select().from(careerAchievements).where(and(eq(careerAchievements.userId, user.id), isNull(careerAchievements.deletedAt))).orderBy(desc(careerAchievements.achievedDate)),
      db.select().from(careerGoals).where(and(eq(careerGoals.userId, user.id), isNull(careerGoals.deletedAt))),
    ]);
    rows = [
      ...ach.map((a) => ({ Kind: "Achievement", Title: a.title, Category: label(a.category), Date: a.achievedDate, Detail: a.description, Impact: a.impact })),
      ...goalData.map((g) => ({ Kind: "Goal", Title: g.title, Category: label(g.horizon), Date: g.targetDate, Detail: `Status: ${label(g.status)} · ${g.progress}%`, Impact: g.evidence })),
    ];
    sheetName = "Achievements";
  } else if (type === "weekly-status") {
    title = "Weekly Status Report";
    const from = format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
    const [resolved, doneTasks, inFlight, journals] = await Promise.all([
      db.select().from(issues).where(and(eq(issues.userId, user.id), isNull(issues.deletedAt), gte(issues.resolvedAt, new Date(from)))),
      db.select().from(tasks).where(and(eq(tasks.userId, user.id), isNull(tasks.deletedAt), gte(tasks.completedAt, new Date(from)))),
      db.select().from(issues).where(and(eq(issues.userId, user.id), isNull(issues.deletedAt), inArray(issues.status, ["in_progress", "blocked", "under_review"]))),
      db.select().from(dailyJournals).where(and(eq(dailyJournals.userId, user.id), gte(dailyJournals.journalDate, from))),
    ]);
    rows = [
      ...resolved.map((i) => ({ Section: "Completed", Item: `${i.key} · ${i.title}`, Detail: label(i.status), Date: i.resolvedAt?.toISOString().slice(0, 10) ?? null })),
      ...doneTasks.map((t) => ({ Section: "Completed", Item: t.title, Detail: "Task", Date: t.completedAt?.toISOString().slice(0, 10) ?? null })),
      ...inFlight.map((i) => ({ Section: i.status === "blocked" ? "Blocked" : "In Flight", Item: `${i.key} · ${i.title}`, Detail: label(i.status), Date: i.dueDate })),
      ...journals.map((j) => ({ Section: "Journal", Item: j.summary ?? "", Detail: `${j.timeSpentHours}h, ${j.meetings} meeting(s)`, Date: j.journalDate })),
    ];
    sheetName = "Weekly Status";
  } else if (type === "monthly-achievements") {
    title = `Monthly Achievement Report ${month}`;
    const from = month + "-01";
    const [ach, resolved, goals] = await Promise.all([
      db.select().from(careerAchievements).where(and(eq(careerAchievements.userId, user.id), isNull(careerAchievements.deletedAt), gte(careerAchievements.achievedDate, from))),
      db.select().from(issues).where(and(eq(issues.userId, user.id), isNull(issues.deletedAt), gte(issues.resolvedAt, new Date(from)))),
      db.select().from(careerGoals).where(and(eq(careerGoals.userId, user.id), isNull(careerGoals.deletedAt))),
    ]);
    rows = [
      ...ach.map((a) => ({ Type: "Achievement", Title: a.title, Category: label(a.category), Impact: a.impact, Date: a.achievedDate })),
      ...resolved.map((i) => ({ Type: "Issue Resolved", Title: `${i.key} · ${i.title}`, Category: label(i.type), Impact: null, Date: i.resolvedAt?.toISOString().slice(0, 10) ?? null })),
      ...goals.map((g) => ({ Type: "Goal Progress", Title: g.title, Category: label(g.horizon), Impact: `${g.progress}% · ${label(g.status)}`, Date: g.targetDate })),
    ];
    sheetName = "Achievements";
  } else if (type === "project-contribution") {
    title = "Project Contribution Report";
    const data = await db.select({
      name: projects.name, key: projects.key, status: projects.status,
      total: sql<number>`count(${issues.id}) filter (where ${issues.deletedAt} is null)::int`,
      resolved: sql<number>`count(${issues.id}) filter (where ${issues.deletedAt} is null and ${issues.resolvedAt} is not null)::int`,
      open: sql<number>`count(${issues.id}) filter (where ${issues.deletedAt} is null and ${issues.status} not in ('resolved','closed'))::int`,
      estimated: sql<string>`coalesce(sum(${issues.estimatedHours}) filter (where ${issues.deletedAt} is null), 0)::text`,
      actual: sql<string>`coalesce(sum(${issues.actualHours}) filter (where ${issues.deletedAt} is null), 0)::text`,
    }).from(projects).leftJoin(issues, eq(issues.projectId, projects.id))
      .where(and(eq(projects.userId, user.id), isNull(projects.deletedAt))).groupBy(projects.id);
    rows = data.map((d) => ({
      Project: d.name, Key: d.key, Status: label(d.status), "Total Issues": d.total,
      Resolved: d.resolved, Open: d.open, "Est Hours": d.estimated, "Actual Hours": d.actual,
      "Completion %": d.total ? Math.round((d.resolved / d.total) * 100) : 0,
    }));
    sheetName = "Contributions";
  } else if (type === "leave-utilisation") {
    title = `Leave Utilisation Report ${year}`;
    const [types, balances, entries] = await Promise.all([
      db.select().from(leaveTypes).where(eq(leaveTypes.isActive, true)).orderBy(leaveTypes.sortOrder),
      db.select().from(leaveBalances).where(and(eq(leaveBalances.userId, user.id), eq(leaveBalances.year, year))),
      db.select().from(leaveEntries).where(eq(leaveEntries.userId, user.id)),
    ]);
    rows = types.map((t) => {
      const b = balances.find((x) => x.leaveTypeId === t.id);
      const inYear = entries.filter((e) => e.leaveTypeId === t.id && e.startDate.startsWith(String(year)));
      const taken = inYear.filter((e) => e.status === "approved").reduce((a, e) => a + Number(e.days), 0);
      const planned = inYear.filter((e) => e.status === "planned").reduce((a, e) => a + Number(e.days), 0);
      const entitlement = Number(b?.opening ?? 0) + Number(b?.accrued ?? 0) + Number(b?.carryForward ?? 0) + Number(b?.adjustments ?? 0);
      return {
        Category: t.name, Year: year, Entitlement: entitlement, Taken: taken, Planned: planned,
        Remaining: Math.round((entitlement - taken) * 100) / 100,
        "Utilisation %": entitlement > 0 ? Math.round((taken / entitlement) * 100) : 0,
      };
    });
    sheetName = "Leave Utilisation";
  } else if (type === "workload") {
    title = "Workload Report";
    const wl = await computeWorkload(user.id);
    rows = [
      ...wl.daily.map((d) => ({
        Section: "Daily", Date: d.date, Day: d.weekday,
        Capacity: d.capacity, "Planned Hours": d.plannedHours, "Logged Hours": d.loggedHours,
        "Items Due": d.dueItems, Status: d.isOff ? `Off (${d.offReason})` : "Working",
      })),
      ...wl.byProject.map((p) => ({
        Section: "Project", Date: null, Day: p.project,
        Capacity: null, "Planned Hours": p.hours, "Logged Hours": null, "Items Due": p.items, Status: null,
      })),
      { Section: "Summary", Date: wl.week.weekStart, Day: "Week total", Capacity: wl.week.capacityHours,
        "Planned Hours": wl.week.committedHours, "Logged Hours": wl.week.loggedHours,
        "Items Due": wl.risks.dueThisWeek, Status: `${wl.week.utilization}% utilisation, ${wl.risks.overdue} overdue` },
    ];
    sheetName = "Workload";
  } else if (type === "career-progress") {
    title = "Career Progress Report";
    const [goals, ach, mtgs] = await Promise.all([
      db.select().from(careerGoals).where(and(eq(careerGoals.userId, user.id), isNull(careerGoals.deletedAt))).orderBy(careerGoals.targetDate),
      db.select().from(careerAchievements).where(and(eq(careerAchievements.userId, user.id), isNull(careerAchievements.deletedAt))),
      db.select().from(meetings).where(and(eq(meetings.userId, user.id), isNull(meetings.deletedAt), eq(meetings.type, "one_on_one"))).orderBy(desc(meetings.meetingDate)).limit(20),
    ]);
    rows = [
      ...goals.map((g) => ({ Section: "Goal", Title: g.title, Horizon: label(g.horizon), Progress: `${g.progress}%`, Status: label(g.status), Date: g.targetDate, Notes: g.evidence })),
      ...ach.map((a) => ({ Section: "Achievement", Title: a.title, Horizon: label(a.category), Progress: "100%", Status: "Logged", Date: a.achievedDate, Notes: a.impact })),
      ...mtgs.map((m) => ({ Section: "1:1 Feedback", Title: m.title, Horizon: m.manager ?? "", Progress: null, Status: null, Date: m.meetingDate, Notes: m.feedback })),
    ];
    sheetName = "Career Progress";
  } else if (type === "meetings") {
    title = "Meeting & Follow-up Report";
    const data = await db.select({ m: meetings }).from(meetings)
      .where(and(eq(meetings.userId, user.id), isNull(meetings.deletedAt))).orderBy(desc(meetings.meetingDate));
    const actions = await db.select({ a: meetingActionItems, t: meetings.title })
      .from(meetingActionItems).innerJoin(meetings, eq(meetingActionItems.meetingId, meetings.id))
      .where(and(eq(meetings.userId, user.id), isNull(meetings.deletedAt)));
    rows = [
      ...data.map(({ m }) => ({ Section: "Meeting", Title: m.title, Type: label(m.type), Date: m.meetingDate, Owner: m.manager, Status: null, Detail: m.decisions })),
      ...actions.map(({ a, t }) => ({ Section: "Action Item", Title: a.description, Type: "Action", Date: a.dueDate, Owner: a.owner, Status: label(a.status), Detail: `From: ${t}` })),
    ];
    sheetName = "Meetings";
  } else if (type === "knowledge") {
    title = "Knowledge Base Export";
    const data = await db.select().from(knowledgeDocs)
      .where(and(eq(knowledgeDocs.userId, user.id), isNull(knowledgeDocs.deletedAt))).orderBy(desc(knowledgeDocs.updatedAt));
    rows = data.map((d) => ({
      Title: d.title, Type: label(d.docType), Category: d.category, Tags: (d.tags ?? []).join("; "),
      Favorite: d.isFavorite ? "yes" : "no", Language: d.language, Views: d.viewCount,
      Updated: d.updatedAt.toISOString().slice(0, 10), Body: d.body,
    }));
    sheetName = "Knowledge";
  } else if (type === "tasks") {
    title = "Task Report";
    const data = await db.select().from(tasks).where(and(eq(tasks.userId, user.id), isNull(tasks.deletedAt))).orderBy(tasks.dueDate);
    rows = data.map((t) => ({ Title: t.title, Status: label(t.status), Priority: label(t.priority), "Due": t.dueDate, "Progress %": t.progress, "Est Hours": t.estimatedHours, "Completed": t.completedAt?.toISOString().slice(0, 10) ?? null }));
    sheetName = "Tasks";
  }

  if (formatParam === "xlsx") {
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Note: "No records for this report" }]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="employee360-${type}-${today}.xlsx"`,
        "X-Report-Title": title,
      },
    });
  }

  const csv = toCsv(rows);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="employee360-${type}-${today}.csv"`,
      "X-Report-Title": title,
    },
  });
});
