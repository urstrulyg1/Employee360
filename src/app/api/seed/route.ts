import { db } from "@/db";
import * as s from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { count, eq, and } from "drizzle-orm";
import { ok } from "@/lib/api";
import { addDays, subDays, format, isWeekend } from "date-fns";

/**
 * POST /api/seed — idempotent demo-data seed.
 * Runs only while the users table is empty. All records are real rows in
 * PostgreSQL (nothing is client-side mock data).
 */
export async function POST() {
  const [{ value: userCount }] = await db.select({ value: count() }).from(s.users);
  if (userCount > 0) {
    return Response.json({ error: "Database already seeded" }, { status: 409 });
  }

  const today = new Date();
  const d = (offset: number) => format(addDays(today, offset), "yyyy-MM-dd");
  const dp = (offset: number) => format(subDays(today, offset), "yyyy-MM-dd");
  const ts = (offset: number, hour = 10) => {
    const base = offset >= 0 ? addDays(today, offset) : subDays(today, -offset);
    base.setHours(hour, 0, 0, 0);
    return base;
  };
  const bizDaysAgo = (n: number) => {
    let cursor = today;
    let countBack = 0;
    while (countBack < n) {
      cursor = subDays(cursor, 1);
      if (!isWeekend(cursor)) countBack++;
    }
    return format(cursor, "yyyy-MM-dd");
  };

  /* ------------------------------- user + profile + prefs ------------------------------- */
  const [user] = await db.insert(s.users).values({
    email: "aarav.sharma@employee360.app",
    name: "Aarav Sharma",
    passwordHash: hashPassword("Employee@360"),
    timezone: "Asia/Kolkata",
  }).returning();

  await db.insert(s.employeeProfiles).values({
    userId: user.id,
    employeeId: "EMP-1042",
    designation: "Senior Software Engineer",
    department: "Platform Engineering",
    manager: "Priya Nair",
    joiningDate: "2021-07-12",
    location: "Bengaluru, India",
    employmentStatus: "active",
    avatarColor: "#6366f1",
  });

  await db.insert(s.employeePreferences).values({ userId: user.id });

  /* ------------------------------- leave types + balances ------------------------------- */
  const ltRows = await db.insert(s.leaveTypes).values([
    { key: "casual", name: "Casual Leave", color: "#6366f1", annualQuota: "12", carryForwardMax: "4", sortOrder: 1 },
    { key: "sick", name: "Sick Leave", color: "#f43f5e", annualQuota: "12", carryForwardMax: "0", sortOrder: 2 },
    { key: "earned", name: "Earned Leave", color: "#10b981", annualQuota: "15", carryForwardMax: "30", sortOrder: 3 },
    { key: "privilege", name: "Privilege Leave", color: "#0ea5e9", annualQuota: "10", carryForwardMax: "10", sortOrder: 4 },
    { key: "optional_holiday", name: "Optional Holiday", color: "#14b8a6", annualQuota: "3", carryForwardMax: "0", sortOrder: 5 },
    { key: "comp_off", name: "Compensatory Off", color: "#f59e0b", annualQuota: "0", carryForwardMax: "0", sortOrder: 6 },
    { key: "wfh", name: "Work From Home", color: "#8b5cf6", annualQuota: "24", carryForwardMax: "0", sortOrder: 7 },
    { key: "unpaid", name: "Unpaid Leave", color: "#a1a1aa", annualQuota: "0", carryForwardMax: "0", countsAsPaid: false, sortOrder: 8 },
  ]).returning();
  const lt = Object.fromEntries(ltRows.map((r) => [r.key, r]));

  const year = today.getFullYear();
  for (const type of ltRows) {
    await db.insert(s.leaveBalances).values({
      userId: user.id,
      leaveTypeId: type.id,
      year,
      opening: type.key === "comp_off" ? "2" : type.annualQuota,
      accrued: "0",
      carryForward: type.key === "earned" ? "6" : "0",
    });
  }

  /* ------------------------------- holiday calendar ------------------------------- */
  const [calendar] = await db.insert(s.holidayCalendars).values({
    name: "India — Bengaluru (Company)", country: "India", state: "Karnataka", city: "Bengaluru", isDefault: true,
  }).returning();

  const H = calendar.id;
  const holidays: (typeof s.holidays.$inferInsert)[] = [
    // India gazetted 2026 (verified against official government lists)
    { calendarId: H, name: "Republic Day", holidayDate: "2026-01-26", year: 2026, category: "national", region: "India", source: "system" },
    { calendarId: H, name: "Makar Sankranti / Pongal", holidayDate: "2026-01-14", year: 2026, category: "optional", region: "India", source: "system" },
    { calendarId: H, name: "Holi", holidayDate: "2026-03-04", year: 2026, category: "national", region: "India", source: "system" },
    { calendarId: H, name: "Id-ul-Fitr", holidayDate: "2026-03-21", year: 2026, category: "national", region: "India", source: "system" },
    { calendarId: H, name: "Ram Navami", holidayDate: "2026-03-26", year: 2026, category: "regional", region: "Karnataka", source: "system" },
    { calendarId: H, name: "Mahavir Jayanti", holidayDate: "2026-03-31", year: 2026, category: "regional", region: "Karnataka", source: "system" },
    { calendarId: H, name: "Good Friday", holidayDate: "2026-04-03", year: 2026, category: "national", region: "India", source: "system" },
    { calendarId: H, name: "Buddha Purnima / May Day", holidayDate: "2026-05-01", year: 2026, category: "national", region: "India", source: "system" },
    { calendarId: H, name: "Id-ul-Zuha (Bakrid)", holidayDate: "2026-05-27", year: 2026, category: "national", region: "India", source: "system" },
    { calendarId: H, name: "Muharram", holidayDate: "2026-06-26", year: 2026, category: "national", region: "India", source: "system" },
    { calendarId: H, name: "Independence Day", holidayDate: "2026-08-15", year: 2026, category: "national", region: "India", source: "system" },
    { calendarId: H, name: "Milad-un-Nabi", holidayDate: "2026-08-26", year: 2026, category: "national", region: "India", source: "system" },
    { calendarId: H, name: "Janmashtami", holidayDate: "2026-09-04", year: 2026, category: "regional", region: "Karnataka", source: "system" },
    { calendarId: H, name: "Gandhi Jayanti", holidayDate: "2026-10-02", year: 2026, category: "national", region: "India", source: "system" },
    { calendarId: H, name: "Dussehra", holidayDate: "2026-10-20", year: 2026, category: "national", region: "India", source: "system" },
    { calendarId: H, name: "Diwali (Deepavali)", holidayDate: "2026-11-08", year: 2026, category: "national", region: "India", source: "system" },
    { calendarId: H, name: "Guru Nanak Jayanti", holidayDate: "2026-11-24", year: 2026, category: "national", region: "India", source: "system" },
    { calendarId: H, name: "Christmas Day", holidayDate: "2026-12-25", year: 2026, category: "national", region: "India", source: "system" },
    { calendarId: H, name: "Ugadi", holidayDate: "2026-03-19", year: 2026, category: "regional", region: "Karnataka", source: "system" },
    { calendarId: H, name: "Karnataka Rajyotsava", holidayDate: "2026-11-01", year: 2026, category: "regional", region: "Karnataka", source: "system" },
    { calendarId: H, name: "Karwa Chauth", holidayDate: "2026-10-29", year: 2026, category: "optional", region: "India", source: "system" },
    { calendarId: H, name: "Holika Dahan", holidayDate: "2026-03-03", year: 2026, category: "restricted", region: "India", source: "system" },
    // Company holidays
    { calendarId: H, name: "Company Foundation Day", holidayDate: "2026-06-15", year: 2026, category: "company", region: "Company", source: "manual" },
    { calendarId: H, name: "Diwali — Observed", holidayDate: "2026-11-09", year: 2026, category: "company", region: "Company", source: "manual" },
    { calendarId: H, name: "Year-End Bridge Day", holidayDate: "2026-12-24", year: 2026, category: "company", region: "Company", source: "manual" },
  ];
  await db.insert(s.holidays).values(holidays);

  /* ------------------------------- projects + repos ------------------------------- */
  const projects = await db.insert(s.projects).values([
    { name: "Orion API Platform", key: "ORN", userId: user.id, description: "Unified internal API gateway and service mesh for product teams.", repoUrl: "https://github.com/acme/orion-api", owner: "Aarav Sharma", status: "active", startDate: dp(210), targetDate: d(75), technologies: ["Go", "PostgreSQL", "Redis", "gRPC"], notes: "Quarterly OKR-critical initiative." },
    { name: "Atlas Design System", key: "ATL", userId: user.id, description: "Enterprise component library used by 6 product surfaces.", repoUrl: "https://github.com/acme/atlas-ds", owner: "Priya Nair", status: "active", startDate: dp(160), targetDate: d(120), technologies: ["React", "TypeScript", "Storybook"] },
    { name: "Nova Billing Service", key: "NVA", userId: user.id, description: "Subscription invoicing, proration and dunning flows.", repoUrl: "https://github.com/acme/nova-billing", owner: "Aarav Sharma", status: "active", startDate: dp(90), targetDate: d(45), technologies: ["Node.js", "Stripe", "PostgreSQL"] },
    { name: "Mercury Mobile App", key: "MRC", userId: user.id, description: "Companion mobile app for field operations.", repoUrl: "https://github.com/acme/mercury-mobile", owner: "Rahul Iyer", status: "on_hold", startDate: dp(120), targetDate: d(200), technologies: ["React Native", "Expo"] },
    { name: "Legacy CRM Sunset", key: "LCS", userId: user.id, description: "Decommission legacy CRM, migrate contacts & pipelines.", repoUrl: "https://github.com/acme/legacy-crm", owner: "Aarav Sharma", status: "completed", startDate: dp(300), targetDate: dp(20), technologies: ["Python", "ETL"], notes: "Completed ahead of schedule." },
  ]).returning();
  const pr = Object.fromEntries(projects.map((p) => [p.key, p]));

  await db.insert(s.repositories).values(projects.filter((p) => p.repoUrl).map((p) => ({
    projectId: p.id, name: p.repoUrl!.split("/").slice(-2).join("/"), url: p.repoUrl!, provider: "github",
  })));

  /* ------------------------------- issues ------------------------------- */
  const issueSeed: (typeof s.issues.$inferInsert)[] = [
    { key: "ISS-1018", title: "Gateway returns 502 under burst load", type: "bug", priority: "critical", status: "in_progress", projectId: pr.ORN.id, repository: "acme/orion-api", assignee: "Aarav Sharma", reporter: "SRE Oncall", dueDate: d(2), startDate: dp(3), estimatedHours: "16", actualHours: "9", tags: ["incident", "p1"], externalUrl: "https://jira.acme.com/browse/ORN-442" },
    { key: "ISS-1017", title: "Add rate-limit SPI for tenant tiers", type: "feature", priority: "high", status: "open", projectId: pr.ORN.id, repository: "acme/orion-api", assignee: "Aarav Sharma", reporter: "Product", dueDate: d(6), estimatedHours: "24", tags: ["gateway"] },
    { key: "ISS-1016", title: "Token refresh race in web client", type: "bug", priority: "high", status: "under_review", projectId: pr.ATL.id, repository: "acme/atlas-ds", assignee: "Aarav Sharma", reporter: "QA", dueDate: d(1), startDate: dp(5), estimatedHours: "8", actualHours: "6", tags: ["auth"] },
    { key: "ISS-1015", title: "Storybook a11y addon keeps crashing", type: "bug", priority: "medium", status: "blocked", projectId: pr.ATL.id, repository: "acme/atlas-ds", assignee: "Aarav Sharma", reporter: "Design", dueDate: dp(2), startDate: dp(7), estimatedHours: "6", actualHours: "3", tags: ["tooling"], description: "Blocked on upstream regression in addon-a11y@8.2 — tracking issue #2214." },
    { key: "ISS-1014", title: "Invoice proration off by one day", type: "bug", priority: "critical", status: "open", projectId: pr.NVA.id, repository: "acme/nova-billing", assignee: "Aarav Sharma", reporter: "Finance Ops", dueDate: dp(1), estimatedHours: "12", tags: ["billing", "p2"] },
    { key: "ISS-1013", title: "Stripe webhook retries exhausted silently", type: "bug", priority: "high", status: "in_progress", projectId: pr.NVA.id, repository: "acme/nova-billing", assignee: "Aarav Sharma", reporter: "SRE Oncall", dueDate: d(4), startDate: dp(2), estimatedHours: "10", actualHours: "4", tags: ["webhooks"] },
    { key: "ISS-1012", title: "Refactor gateway config loader", type: "tech_debt", priority: "medium", status: "backlog", projectId: pr.ORN.id, repository: "acme/orion-api", assignee: "Aarav Sharma", reporter: "Aarav Sharma", dueDate: d(21), estimatedHours: "20", tags: ["refactor"] },
    { key: "ISS-1011", title: "Dark-mode contrast audit", type: "enhancement", priority: "low", status: "open", projectId: pr.ATL.id, repository: "acme/atlas-ds", assignee: "Aarav Sharma", reporter: "Design", dueDate: d(14), estimatedHours: "6", tags: ["a11y"] },
    { key: "ISS-1010", title: "Offline sync queue for field app", type: "feature", priority: "high", status: "open", projectId: pr.MRC.id, repository: "acme/mercury-mobile", assignee: "Rahul Iyer", reporter: "Product", dueDate: d(30), estimatedHours: "40", tags: ["offline"] },
    { key: "ISS-1009", title: "Dunning email templates — localisation", type: "dev_task", priority: "medium", status: "resolved", projectId: pr.NVA.id, repository: "acme/nova-billing", assignee: "Aarav Sharma", reporter: "Product", dueDate: dp(3), startDate: dp(9), resolvedAt: ts(-3, 16), estimatedHours: "8", actualHours: "7", tags: ["i18n"] },
    { key: "ISS-1008", title: "Migrate CRM contacts to warehouse", type: "dev_task", priority: "high", status: "closed", projectId: pr.LCS.id, assignee: "Aarav Sharma", reporter: "Data", dueDate: dp(24), resolvedAt: ts(-24, 15), estimatedHours: "24", actualHours: "22", tags: ["migration"] },
    { key: "ISS-1007", title: "Gateway latency p95 regression", type: "bug", priority: "high", status: "open", projectId: pr.ORN.id, repository: "acme/orion-api", assignee: "Aarav Sharma", reporter: "Observability", dueDate: dp(5), startDate: dp(10), estimatedHours: "14", actualHours: "5", tags: ["perf"] },
    { key: "ISS-1006", title: "Research: service-mesh egress policy", type: "research", priority: "low", status: "backlog", projectId: pr.ORN.id, assignee: "Aarav Sharma", reporter: "Aarav Sharma", dueDate: d(35), estimatedHours: "12", tags: ["spike"] },
    { key: "ISS-1005", title: "Support: SSO login loop for ACME-1843", type: "support", priority: "medium", status: "resolved", projectId: pr.ORN.id, assignee: "Aarav Sharma", reporter: "Support", dueDate: dp(6), resolvedAt: ts(-7, 12), estimatedHours: "3", actualHours: "2.5", tags: ["customer"] },
    { key: "ISS-1004", title: "Quarterly dependency upgrades", type: "maintenance", priority: "medium", status: "in_progress", projectId: pr.ATL.id, repository: "acme/atlas-ds", assignee: "Aarav Sharma", reporter: "Aarav Sharma", dueDate: d(10), startDate: dp(4), estimatedHours: "10", actualHours: "3", tags: ["deps"] },
    { key: "ISS-1003", title: "Feature: usage-based billing meter API", type: "feature", priority: "high", status: "under_review", projectId: pr.NVA.id, repository: "acme/nova-billing", assignee: "Aarav Sharma", reporter: "Product", dueDate: d(3), startDate: dp(12), estimatedHours: "32", actualHours: "30", tags: ["api"] },
    { key: "ISS-1002", title: "Crash on Android 12 rotation", type: "bug", priority: "medium", status: "closed", projectId: pr.MRC.id, assignee: "Rahul Iyer", reporter: "QA", dueDate: dp(15), resolvedAt: ts(-16, 18), estimatedHours: "5", actualHours: "4", tags: ["android"] },
    { key: "ISS-1001", title: "Decommission legacy reporting cron", type: "maintenance", priority: "low", status: "closed", projectId: pr.LCS.id, assignee: "Aarav Sharma", reporter: "Data", dueDate: dp(32), resolvedAt: ts(-33, 11), estimatedHours: "4", actualHours: "4", tags: ["cleanup"] },
  ].map((i, idx) => ({ ...i, userId: user.id, createdAt: ts(-(30 - idx)), updatedAt: ts(-(((idx % 5) + 1)), 14) }));
  const insertedIssues = await db.insert(s.issues).values(issueSeed).returning();
  const issByKey = Object.fromEntries(insertedIssues.map((i) => [i.key, i]));

  // comments + status history
  const commentSeeds: (typeof s.issueComments.$inferInsert)[] = [
    { issueId: issByKey["ISS-1018"].id, author: "Aarav Sharma", body: "Reproduced with 4k RPS burst; connection pool starvation on upstream workers. Trying exponential backoff.", createdAt: ts(-2, 11) },
    { issueId: issByKey["ISS-1018"].id, author: "SRE Oncall", body: "Confirmed — adding temporary autoscale rule while fix lands.", createdAt: ts(-1, 9) },
    { issueId: issByKey["ISS-1015"].id, author: "Aarav Sharma", body: "Pinning addon-a11y to 8.1.7 until upstream fixes #2214.", createdAt: ts(-2, 16) },
    { issueId: issByKey["ISS-1014"].id, author: "Finance Ops", body: "Three credits issued manually for affected invoices this month.", createdAt: ts(-1, 14) },
    { issueId: issByKey["ISS-1016"].id, author: "Aarav Sharma", body: "PR #312 up for review — moved refresh onto a shared mutex.", createdAt: ts(-1, 13) },
  ];
  await db.insert(s.issueComments).values(commentSeeds);

  const histSeeds: (typeof s.issueStatusHistory.$inferInsert)[] = [
    { issueId: issByKey["ISS-1018"].id, fromStatus: "open", toStatus: "in_progress", changedBy: "Aarav Sharma", changedAt: ts(-3, 10) },
    { issueId: issByKey["ISS-1016"].id, fromStatus: "in_progress", toStatus: "under_review", changedBy: "Aarav Sharma", changedAt: ts(-1, 13) },
    { issueId: issByKey["ISS-1015"].id, fromStatus: "in_progress", toStatus: "blocked", changedBy: "Aarav Sharma", changedAt: ts(-2, 15) },
    { issueId: issByKey["ISS-1009"].id, fromStatus: "in_progress", toStatus: "resolved", changedBy: "Aarav Sharma", changedAt: ts(-3, 16) },
  ];
  await db.insert(s.issueStatusHistory).values(histSeeds);

  /* ------------------------------- tasks ------------------------------- */
  const taskSeed: (typeof s.tasks.$inferInsert)[] = [
    { title: "Write burst-load soak test for gateway", projectId: pr.ORN.id, status: "in_progress", priority: "critical", dueDate: d(1), estimatedHours: "6", actualHours: "3", progress: 55 },
    { title: "Review PR #312 feedback + merge", projectId: pr.ATL.id, status: "todo", priority: "high", dueDate: d(1), estimatedHours: "2", progress: 0 },
    { title: "Reconcile proration edge-cases doc", projectId: pr.NVA.id, status: "todo", priority: "high", dueDate: d(2), estimatedHours: "4", progress: 0 },
    { title: "Prepare sprint demo deck", status: "todo", priority: "medium", dueDate: d(3), estimatedHours: "3", progress: 0 },
    { title: "Dependency risk register update", projectId: pr.ORN.id, status: "todo", priority: "low", dueDate: d(9), estimatedHours: "2", progress: 0 },
    { title: "1:1 notes + growth plan draft", status: "in_progress", priority: "medium", dueDate: d(5), estimatedHours: "1", progress: 40 },
    { title: "Archive legacy CRM dashboards", projectId: pr.LCS.id, status: "done", priority: "medium", dueDate: dp(4), completedAt: ts(-4, 12), progress: 100 },
    { title: "Document webhook retry SOP", projectId: pr.NVA.id, status: "done", priority: "medium", dueDate: dp(6), completedAt: ts(-6, 15), progress: 100 },
    { title: "Atlassian status page automation", status: "done", priority: "low", dueDate: dp(9), completedAt: ts(-9, 16), progress: 100 },
    { title: "Shadow-support rotation handover", status: "done", priority: "medium", dueDate: dp(12), completedAt: ts(-12, 10), progress: 100 },
    { title: "Spike: Redis 8 vector sets for cache", projectId: pr.ORN.id, status: "blocked", priority: "low", dueDate: dp(1), estimatedHours: "6", progress: 20 },
    { title: "OKR mid-quarter check-in prep", status: "todo", priority: "medium", dueDate: d(7), estimatedHours: "2", progress: 0 },
  ].map((t, idx) => ({ ...t, userId: user.id, createdAt: ts(-(20 - idx)) }));
  const insertedTasks = await db.insert(s.tasks).values(taskSeed).returning();
  const [mainTask] = insertedTasks;
  await db.insert(s.subtasks).values([
    { taskId: mainTask.id, title: "Add k6 burst scenario", done: true, sortOrder: 1 },
    { taskId: mainTask.id, title: "Record flame graphs", done: true, sortOrder: 2 },
    { taskId: mainTask.id, title: "Publish results to wiki", done: false, sortOrder: 3 },
  ]);
  await db.insert(s.taskDependencies).values([
    { taskId: insertedTasks[3].id, dependsOnTaskId: insertedTasks[0].id },
  ]);

  /* ------------------------------- journals (last 10 business days) ------------------------------- */
  const journalBodies = [
    { summary: "Deep-dived the 502 burst incident; narrowed it to upstream pool exhaustion and started the backoff patch.", challenges: "Flaky perf env throttled the soak test.", solutions: "Point-in-time pool metrics + pprof capture during burst.", learnings: "Hikari-style pool metrics map cleanly to Go worker pools.", timeSpentHours: "7.5", meetings: 2, issuesWorkedOn: ["ISS-1018"], tasksCompleted: ["Reproduced burst failure locally"] },
    { summary: "Opened PR #312 for the token-refresh race; paired on review comments.", learnings: "Broadcast channel vs. mutex trade-offs for refresh flows.", timeSpentHours: "7", meetings: 3, issuesWorkedOn: ["ISS-1016"], tasksCompleted: ["PR #312 opened"] },
    { summary: "Proration bug triage with Finance Ops; documented the off-by-one boundary cases.", challenges: "Ambiguous inclusive/exclusive day semantics in legacy code.", timeSpentHours: "6.5", meetings: 2, issuesWorkedOn: ["ISS-1014"], pendingWork: "Boundary-case matrix sign-off" },
    { summary: "Webhook retry SOP published; wired alert on exhausted retries.", solutions: "DLQ + PagerDuty route for exhausted Stripe retries.", timeSpentHours: "8", meetings: 1, issuesWorkedOn: ["ISS-1013"], tasksCompleted: ["Document webhook retry SOP"] },
    { summary: "Resolved dunning i18n templates; verified all 6 locales render on staging.", timeSpentHours: "7.5", meetings: 1, issuesWorkedOn: ["ISS-1009"], tasksCompleted: ["ISS-1009 resolved"] },
    { summary: "Sprint demo prep; harvested metrics from observability dashboards.", timeSpentHours: "6", meetings: 4, pendingWork: "Demo dry-run before sprint review" },
    { summary: "Dependency upgrade sweep across Atlas; fixed two breaking changes in tokens build.", timeSpentHours: "7", meetings: 1, issuesWorkedOn: ["ISS-1004"], tasksCompleted: ["tokens build green"] },
    { summary: "Burst soak test harness ready (k6); baseline flame graphs captured.", timeSpentHours: "7.5", meetings: 2, issuesWorkedOn: ["ISS-1018"], tasksCompleted: ["Add k6 burst scenario", "Record flame graphs"] },
    { summary: "Growth plan draft + mentoring session notes; research spike on Redis 8 blocked by staging capacity.", timeSpentHours: "6.5", meetings: 2, pendingWork: "Request staging capacity for spike" },
    { summary: "Weekly wrap: cleaned backlog, triaged 4 new support pings, updated risk register.", timeSpentHours: "7", meetings: 3 },
  ];
  const journalRows = journalBodies.map((b, i) => ({
    userId: user.id,
    journalDate: bizDaysAgo(10 - i),
    summary: b.summary,
    challenges: (b as { challenges?: string }).challenges ?? null,
    solutions: (b as { solutions?: string }).solutions ?? null,
    learnings: (b as { learnings?: string }).learnings ?? null,
    pendingWork: (b as { pendingWork?: string }).pendingWork ?? null,
    nextDayPriorities: i < 4 ? "Focus ISS-1018 fix and clear review queue" : null,
    meetings: b.meetings,
    timeSpentHours: b.timeSpentHours,
    tasksCompleted: b.tasksCompleted ?? null,
    issuesWorkedOn: (b as { issuesWorkedOn?: string[] }).issuesWorkedOn ?? null,
    createdAt: ts(-(10 - i), 18),
    updatedAt: ts(-(10 - i), 18),
  }));
  const insertedJournals = await db.insert(s.dailyJournals).values(journalRows).returning();

  await db.insert(s.workLogs).values(
    insertedJournals.slice(0, 6).map((j, i) => ({
      userId: user.id,
      issueId: i % 2 === 0 ? issByKey["ISS-1018"].id : issByKey["ISS-1013"].id,
      journalId: j.id,
      workDate: j.journalDate,
      hours: "4.0",
      note: "Focused engineering time",
    })),
  );

  /* ------------------------------- leaves ------------------------------- */
  await db.insert(s.leaveEntries).values([
    { userId: user.id, leaveTypeId: lt.sick.id, status: "approved", startDate: dp(28), endDate: dp(27), days: "2", reason: "Viral fever", notes: "Recovered; doctor certification on file.", approver: "Priya Nair", approvedAt: ts(-29, 9), createdAt: ts(-29, 8) },
    { userId: user.id, leaveTypeId: lt.earned.id, status: "approved", startDate: dp(60), endDate: dp(55), days: "4", reason: "Family visit to Mysuru", approver: "Priya Nair", approvedAt: ts(-62, 10), createdAt: ts(-62, 9) },
    { userId: user.id, leaveTypeId: lt.wfh.id, status: "approved", startDate: dp(4), endDate: dp(4), days: "1", reason: "AC installation at home", approver: "Priya Nair", approvedAt: ts(-5, 10), createdAt: ts(-5, 9) },
    { userId: user.id, leaveTypeId: lt.casual.id, status: "pending", startDate: d(6), endDate: d(6), days: "1", reason: "Passport renewal appointment", approver: "Priya Nair", createdAt: ts(-1, 9) },
    { userId: user.id, leaveTypeId: lt.earned.id, status: "planned", startDate: year === 2026 ? "2026-11-05" : d(120), endDate: year === 2026 ? "2026-11-06" : d(121), days: "2", reason: "Diwali bridge — travel to hometown", planName: "Diwali Bridge 2026", createdAt: ts(-2, 15) },
    { userId: user.id, leaveTypeId: lt.comp_off.id, status: "planned", startDate: d(20), endDate: d(20), days: "1", reason: "Comp-off for release weekend", planName: "Release Comp-Off", createdAt: ts(-3, 15) },
    { userId: user.id, leaveTypeId: lt.optional_holiday.id, status: "rejected", startDate: dp(15), endDate: dp(15), days: "1", reason: "Regional festival", approver: "Priya Nair", approvedAt: ts(-16, 14), notes: "Rejected: release freeze window.", createdAt: ts(-17, 10) },
  ]);

  /* ------------------------------- calendar extras + reminders ------------------------------- */
  await db.insert(s.calendarEvents).values([
    { userId: user.id, title: "Sprint Planning", category: "meeting", eventDate: d(3), startTime: "10:00", allDay: false, recurrence: "weekly" },
    { userId: user.id, title: "1:1 with Priya", category: "meeting", eventDate: d(1), startTime: "16:00", allDay: false, recurrence: "weekly" },
    { userId: user.id, title: "Orion Architecture Review", category: "milestone", eventDate: d(8), startTime: "11:00", allDay: false },
    { userId: user.id, title: "Nova billing go-live gate", category: "milestone", eventDate: d(45) },
    { userId: user.id, title: "Submit monthly expense report", category: "reminder", eventDate: d(5) },
  ]);

  await db.insert(s.reminders).values([
    { userId: user.id, title: "Renew IDP access token", remindAt: ts(9, 9), category: "security", recurrence: null, enabled: true },
    { userId: user.id, title: "Quarter review self-assessment", remindAt: ts(14, 9), category: "career", recurrence: null, enabled: true },
  ]);

  /* ------------------------------- career ------------------------------- */
  await db.insert(s.careerGoals).values([
    { userId: user.id, title: "Ship Orion GA to all product lines", horizon: "annual", targetDate: d(75), progress: 55, status: "in_progress", description: "Drive the Orion API platform from limited rollout to GA with SLO dashboards.", evidence: "https://wiki.acme.com/orion/ga-plan" },
    { userId: user.id, title: "Complete CKA certification", horizon: "learning", targetDate: d(60), progress: 30, status: "in_progress", description: "Certified Kubernetes Administrator — lab hours weekly.", evidence: "Lab notebook: killer.sh progress" },
    { userId: user.id, title: "Close out all P1/P2 gateway incidents", horizon: "quarterly", targetDate: d(30), progress: 70, status: "in_progress", description: "Zero repeat incidents; incident review docs for each P1." },
    { userId: user.id, title: "Mentor two junior engineers to L3", horizon: "career", targetDate: d(180), progress: 25, status: "in_progress", description: "Structured mentoring plan, monthly checkpoints." },
  ]);

  await db.insert(s.careerAchievements).values([
    { userId: user.id, category: "project", title: "Legacy CRM sunset delivered 3 weeks early", description: "Led decommission: migrated 1.2M contacts, retired 14 cron jobs.", impact: "Saved ~$38k/yr infra; removed a major security surface.", achievedDate: dp(20) },
    { userId: user.id, category: "production_issue", title: "Zero-downtime fix for billing idempotency bug", description: "Root-caused double-charge race; shipped idempotency keys.", impact: "Prevented recurring finance escalations.", achievedDate: dp(45) },
    { userId: user.id, category: "certification", title: "AWS Solutions Architect Associate", description: "Certification completed with 890/1000.", achievedDate: dp(90) },
    { userId: user.id, category: "knowledge_sharing", title: "Internal talk: Go profiling in production", description: "45-min session + hands-on lab for 60 engineers.", impact: "Adopted as onboarding material.", achievedDate: dp(35) },
    { userId: user.id, category: "process_improvement", title: "Introduced incident review template", description: "Blameless template now used org-wide for P1/P2 reviews.", achievedDate: dp(75) },
  ]);

  await db.insert(s.performanceEvidence).values({
    userId: user.id,
    targetRole: "Staff Software Engineer (L6)",
    requiredCompetencies: "Cross-team technical leadership; system design at scale; incident command; mentoring; roadmap influence.",
    demonstratedSkills: "Led Orion design sign-off; commanded 2 P1 incidents; mentor for 2 engineers; design docs adopted as org templates.",
    achievementsSummary: "CRM sunset early + savings; billing idempotency fix; AWS SAA certification; org-wide incident template.",
    evidenceLinks: "https://wiki.acme.com/orion · https://wiki.acme.com/incidents/template",
    feedback: "Manager: deepen cross-org influence; present roadmap at eng all-hands.",
    developmentGaps: "Broader org visibility; conference presence; formal architecture review board participation.",
    nextSteps: "1) Present Orion roadmap at all-hands (next quarter). 2) Join arch review board rotation. 3) Publish 2 external blog posts.",
  });

  /* ------------------------------- github (disconnected placeholder) ------------------------------- */
  await db.insert(s.githubConnections).values({ userId: user.id, status: "disconnected" });

  /* ------------------------------- audit ------------------------------- */
  await db.insert(s.auditLogs).values({
    userId: user.id, entity: "system", entityId: user.id, action: "seed.completed",
    metadata: { note: "Initial dataset created by /api/seed" },
  });

  const [{ value: issueCount }] = await db.select({ value: count() }).from(s.issues);
  return ok({ seeded: true, user: user.email, issues: issueCount }, 201);
}

/** Allow re-seeding only in empty DB; keeps GET harmless for browser checks. */
export async function GET() {
  const [{ value: userCount }] = await db.select({ value: count() }).from(s.users);
  return ok({ seeded: userCount > 0 });
}
