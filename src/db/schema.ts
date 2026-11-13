// Employee 360 — normalized PostgreSQL schema (Drizzle ORM / pg-core)
// Conventions:
//  - UUID primary keys (gen_random_uuid)
//  - created_at / updated_at stored in UTC (timestamptz)
//  - dates stored as ISO date strings (YYYY-MM-DD) and rendered in the employee timezone
//  - soft deletion (deleted_at) on business entities
//  - unique constraints to prevent duplicate / double-synced records

import {
  pgTable, uuid, varchar, text, integer, numeric, boolean, date,
  timestamp, jsonb, uniqueIndex, index,
} from "drizzle-orm/pg-core";

/* ---------------------------------------------------------------- Auth */

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  passwordHash: text("password_hash").notNull(),
  role: varchar("role", { length: 40 }).notNull().default("employee"),
  timezone: varchar("timezone", { length: 64 }).notNull().default("Asia/Kolkata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("users_email_uq").on(t.email)]);

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  token: varchar("token", { length: 128 }).notNull(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("sessions_token_uq").on(t.token), index("sessions_user_idx").on(t.userId)]);

export const employeeProfiles = pgTable("employee_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  employeeId: varchar("employee_id", { length: 40 }).notNull(),
  designation: varchar("designation", { length: 120 }).notNull(),
  department: varchar("department", { length: 120 }).notNull(),
  manager: varchar("manager", { length: 120 }),
  joiningDate: date("joining_date"),
  location: varchar("location", { length: 120 }),
  employmentStatus: varchar("employment_status", { length: 40 }).notNull().default("active"),
  avatarColor: varchar("avatar_color", { length: 20 }).notNull().default("#6366f1"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const employeePreferences = pgTable("employee_preferences", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  workStartHour: integer("work_start_hour").notNull().default(9),
  workEndHour: integer("work_end_hour").notNull().default(18),
  weekendDays: integer("weekend_days").array().notNull().default([0, 6]), // 0=Sun ... 6=Sat
  country: varchar("country", { length: 80 }).notNull().default("India"),
  state: varchar("state", { length: 80 }).notNull().default("Karnataka"),
  city: varchar("city", { length: 80 }).notNull().default("Bengaluru"),
  financialYearStart: varchar("financial_year_start", { length: 5 }).notNull().default("04-01"),
  reservePendingLeave: boolean("reserve_pending_leave").notNull().default(false),
  focusHoursPerDay: numeric("focus_hours_per_day", { precision: 4, scale: 2 }).notNull().default("6"),
  aiEnabled: boolean("ai_enabled").notNull().default(true),
  notifyIssueDeadlines: boolean("notify_issue_deadlines").notNull().default(true),
  notifyHolidays: boolean("notify_holidays").notNull().default(true),
  notifyLeaves: boolean("notify_leaves").notNull().default(true),
  notifyGoals: boolean("notify_goals").notNull().default(true),
  reminderIntervalHours: integer("reminder_interval_hours").notNull().default(48),
  widgetLayout: jsonb("widget_layout"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------- Projects */

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 160 }).notNull(),
  key: varchar("key", { length: 12 }).notNull(),
  description: text("description"),
  repoUrl: text("repo_url"),
  owner: varchar("owner", { length: 120 }),
  status: varchar("status", { length: 24 }).notNull().default("active"), // active|on_hold|completed|archived
  startDate: date("start_date"),
  targetDate: date("target_date"),
  technologies: text("technologies").array(),
  notes: text("notes"),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => [uniqueIndex("projects_key_uq").on(t.key), index("projects_status_idx").on(t.status)]);

export const repositories = pgTable("repositories", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 160 }).notNull(),
  url: text("url").notNull(),
  provider: varchar("provider", { length: 40 }).notNull().default("github"),
  defaultBranch: varchar("default_branch", { length: 80 }).notNull().default("main"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("repositories_url_uq").on(t.url)]);

/* --------------------------------------------------------------- Issues */

export const issues = pgTable("issues", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: varchar("key", { length: 20 }).notNull(),
  title: varchar("title", { length: 240 }).notNull(),
  description: text("description"),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  repository: varchar("repository", { length: 160 }),
  type: varchar("type", { length: 24 }).notNull().default("bug"),
  priority: varchar("priority", { length: 16 }).notNull().default("medium"),
  status: varchar("status", { length: 24 }).notNull().default("open"),
  assignee: varchar("assignee", { length: 120 }),
  reporter: varchar("reporter", { length: 120 }),
  startDate: date("start_date"),
  dueDate: date("due_date"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  estimatedHours: numeric("estimated_hours", { precision: 6, scale: 2 }),
  actualHours: numeric("actual_hours", { precision: 6, scale: 2 }),
  tags: text("tags").array(),
  externalUrl: text("external_url"),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("issues_key_uq").on(t.key),
  index("issues_status_idx").on(t.status),
  index("issues_priority_idx").on(t.priority),
  index("issues_due_idx").on(t.dueDate),
  index("issues_project_idx").on(t.projectId),
]);

export const issueComments = pgTable("issue_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  issueId: uuid("issue_id").notNull().references(() => issues.id, { onDelete: "cascade" }),
  author: varchar("author", { length: 120 }).notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("issue_comments_issue_idx").on(t.issueId)]);

export const issueAttachments = pgTable("issue_attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  issueId: uuid("issue_id").notNull().references(() => issues.id, { onDelete: "cascade" }),
  fileName: varchar("file_name", { length: 240 }).notNull(),
  url: text("url").notNull(),
  sizeBytes: integer("size_bytes"),
  uploadedBy: varchar("uploaded_by", { length: 120 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const issueStatusHistory = pgTable("issue_status_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  issueId: uuid("issue_id").notNull().references(() => issues.id, { onDelete: "cascade" }),
  fromStatus: varchar("from_status", { length: 24 }).notNull(),
  toStatus: varchar("to_status", { length: 24 }).notNull(),
  changedBy: varchar("changed_by", { length: 120 }),
  changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("issue_history_issue_idx").on(t.issueId)]);

/* ---------------------------------------------------------------- Tasks */

export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 240 }).notNull(),
  description: text("description"),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  status: varchar("status", { length: 24 }).notNull().default("todo"), // todo|in_progress|blocked|done
  priority: varchar("priority", { length: 16 }).notNull().default("medium"),
  dueDate: date("due_date"),
  estimatedHours: numeric("estimated_hours", { precision: 6, scale: 2 }),
  actualHours: numeric("actual_hours", { precision: 6, scale: 2 }),
  progress: integer("progress").notNull().default(0),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  sortOrder: integer("sort_order").notNull().default(0),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => [
  index("tasks_status_idx").on(t.status),
  index("tasks_due_idx").on(t.dueDate),
  index("tasks_project_idx").on(t.projectId),
]);

export const subtasks = pgTable("subtasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 240 }).notNull(),
  done: boolean("done").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("subtasks_task_idx").on(t.taskId)]);

export const taskDependencies = pgTable("task_dependencies", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  dependsOnTaskId: uuid("depends_on_task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("task_dep_uq").on(t.taskId, t.dependsOnTaskId)]);

export const workLogs = pgTable("work_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  issueId: uuid("issue_id").references(() => issues.id, { onDelete: "cascade" }),
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }),
  journalId: uuid("journal_id"),
  workDate: date("work_date").notNull(),
  hours: numeric("hours", { precision: 5, scale: 2 }).notNull(),
  note: text("note"),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("work_logs_date_idx").on(t.workDate), index("work_logs_issue_idx").on(t.issueId)]);

/* -------------------------------------------------------------- Journal */

export const dailyJournals = pgTable("daily_journals", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  journalDate: date("journal_date").notNull(),
  summary: text("summary"),
  tasksCompleted: text("tasks_completed").array(),
  issuesWorkedOn: text("issues_worked_on").array(), // issue keys e.g. ISS-1010
  challenges: text("challenges"),
  solutions: text("solutions"),
  meetings: integer("meetings").notNull().default(0),
  learnings: text("learnings"),
  pendingWork: text("pending_work"),
  nextDayPriorities: text("next_day_priorities"),
  timeSpentHours: numeric("time_spent_hours", { precision: 5, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("journal_user_date_uq").on(t.userId, t.journalDate),
  index("journal_date_idx").on(t.journalDate),
]);

/* ---------------------------------------------------------------- Leaves */

export const leaveTypes = pgTable("leave_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: varchar("key", { length: 40 }).notNull(),
  name: varchar("name", { length: 80 }).notNull(),
  color: varchar("color", { length: 20 }).notNull().default("#6366f1"),
  annualQuota: numeric("annual_quota", { precision: 5, scale: 2 }).notNull().default("0"),
  carryForwardMax: numeric("carry_forward_max", { precision: 5, scale: 2 }).notNull().default("0"),
  countsAsPaid: boolean("counts_as_paid").notNull().default(true),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("leave_types_key_uq").on(t.key)]);

export const leaveBalances = pgTable("leave_balances", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  leaveTypeId: uuid("leave_type_id").notNull().references(() => leaveTypes.id, { onDelete: "cascade" }),
  year: integer("year").notNull(),
  opening: numeric("opening", { precision: 5, scale: 2 }).notNull().default("0"),
  accrued: numeric("accrued", { precision: 5, scale: 2 }).notNull().default("0"),
  carryForward: numeric("carry_forward", { precision: 5, scale: 2 }).notNull().default("0"),
  adjustments: numeric("adjustments", { precision: 5, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("leave_balance_uq").on(t.userId, t.leaveTypeId, t.year)]);

export const leaveEntries = pgTable("leave_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  leaveTypeId: uuid("leave_type_id").notNull().references(() => leaveTypes.id),
  status: varchar("status", { length: 24 }).notNull().default("planned"), // planned|pending|approved|rejected|cancelled
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  halfDay: boolean("half_day").notNull().default(false),
  halfDayPeriod: varchar("half_day_period", { length: 4 }), // am|pm
  days: numeric("days", { precision: 5, scale: 2 }).notNull(),
  reason: text("reason"),
  notes: text("notes"),
  approver: varchar("approver", { length: 120 }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  planName: varchar("plan_name", { length: 120 }), // links saved annual-leave-planner batches
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("leave_entries_status_idx").on(t.status),
  index("leave_entries_dates_idx").on(t.startDate, t.endDate),
]);

export const leaveApprovals = pgTable("leave_approvals", {
  id: uuid("id").primaryKey().defaultRandom(),
  leaveEntryId: uuid("leave_entry_id").notNull().references(() => leaveEntries.id, { onDelete: "cascade" }),
  action: varchar("action", { length: 24 }).notNull(), // submitted|approved|rejected|cancelled
  actor: varchar("actor", { length: 120 }).notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("leave_approvals_entry_idx").on(t.leaveEntryId)]);

export const leaveBalanceAdjustments = pgTable("leave_balance_adjustments", {
  id: uuid("id").primaryKey().defaultRandom(),
  leaveBalanceId: uuid("leave_balance_id").notNull().references(() => leaveBalances.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 5, scale: 2 }).notNull(),
  reason: text("reason").notNull(),
  createdBy: varchar("created_by", { length: 120 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("leave_adj_balance_idx").on(t.leaveBalanceId)]);

/* -------------------------------------------------------------- Holidays */

export const holidayCalendars = pgTable("holiday_calendars", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 120 }).notNull(),
  country: varchar("country", { length: 80 }).notNull().default("India"),
  state: varchar("state", { length: 80 }),
  city: varchar("city", { length: 80 }),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const holidays = pgTable("holidays", {
  id: uuid("id").primaryKey().defaultRandom(),
  calendarId: uuid("calendar_id").references(() => holidayCalendars.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 160 }).notNull(),
  holidayDate: date("holiday_date").notNull(),
  year: integer("year").notNull(),
  category: varchar("category", { length: 24 }).notNull().default("company"), // national|regional|company|optional|restricted
  region: varchar("region", { length: 120 }),
  source: varchar("source", { length: 16 }).notNull().default("manual"), // system|manual|imported
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("holidays_name_date_region_uq").on(t.name, t.holidayDate, t.region),
  index("holidays_date_idx").on(t.holidayDate),
  index("holidays_year_idx").on(t.year),
]);

/* -------------------------------------------------------------- Calendar */

export const calendarEvents = pgTable("calendar_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 240 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 24 }).notNull().default("meeting"), // issue|milestone|task|leave|holiday|meeting|reminder
  eventDate: date("event_date").notNull(),
  endDate: date("end_date"),
  startTime: varchar("start_time", { length: 5 }),
  allDay: boolean("all_day").notNull().default(true),
  color: varchar("color", { length: 20 }),
  recurrence: varchar("recurrence", { length: 16 }), // none|daily|weekly|monthly
  sourceType: varchar("source_type", { length: 24 }), // issue|task|leave|holiday|project => synced
  sourceId: varchar("source_id", { length: 64 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("cal_events_date_idx").on(t.eventDate),
  uniqueIndex("cal_events_source_uq").on(t.userId, t.sourceType, t.sourceId),
]);

export const reminders = pgTable("reminders", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 240 }).notNull(),
  remindAt: timestamp("remind_at", { withTimezone: true }).notNull(),
  category: varchar("category", { length: 24 }).notNull().default("general"),
  recurrence: varchar("recurrence", { length: 16 }),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("reminders_user_idx").on(t.userId, t.enabled)]);

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  dedupeKey: varchar("dedupe_key", { length: 160 }).notNull(),
  title: varchar("title", { length: 240 }).notNull(),
  message: text("message").notNull(),
  category: varchar("category", { length: 24 }).notNull().default("general"),
  isRead: boolean("is_read").notNull().default(false),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("notifications_dedupe_uq").on(t.userId, t.dedupeKey),
  index("notifications_user_read_idx").on(t.userId, t.isRead),
]);

/* --------------------------------------------------------------- GitHub */

export const githubConnections = pgTable("github_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  username: varchar("username", { length: 120 }),
  accessToken: text("access_token"), // stored server-side only; never returned to clients
  status: varchar("status", { length: 24 }).notNull().default("disconnected"),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  connectedAt: timestamp("connected_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const githubActivity = pgTable("github_activity", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  activityDate: date("activity_date").notNull(),
  repo: varchar("repo", { length: 200 }),
  type: varchar("type", { length: 24 }).notNull(), // commit|pr_opened|pr_merged|pr_review|issue
  title: text("title").notNull(),
  url: text("url"),
  count: integer("count").notNull().default(1),
  manual: boolean("manual").notNull().default(false),
  externalId: varchar("external_id", { length: 160 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("gh_activity_user_date_idx").on(t.userId, t.activityDate),
  uniqueIndex("gh_activity_ext_uq").on(t.userId, t.externalId),
]);

/* ------------------------------------------------------- Career / Perf */

export const careerGoals = pgTable("career_goals", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 240 }).notNull(),
  description: text("description"),
  horizon: varchar("horizon", { length: 24 }).notNull().default("quarterly"), // short|quarterly|annual|learning|career
  targetDate: date("target_date"),
  progress: integer("progress").notNull().default(0),
  status: varchar("status", { length: 24 }).notNull().default("not_started"), // not_started|in_progress|on_hold|completed
  evidence: text("evidence"),
  completionNotes: text("completion_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => [index("goals_user_idx").on(t.userId)]);

export const careerAchievements = pgTable("career_achievements", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  category: varchar("category", { length: 40 }).notNull().default("technical"),
  title: varchar("title", { length: 240 }).notNull(),
  description: text("description"),
  impact: text("impact"),
  achievedDate: date("achieved_date"),
  evidenceUrl: text("evidence_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => [index("achievements_user_idx").on(t.userId)]);

export const performanceEvidence = pgTable("performance_evidence", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  targetRole: varchar("target_role", { length: 160 }),
  requiredCompetencies: text("required_competencies"),
  demonstratedSkills: text("demonstrated_skills"),
  achievementsSummary: text("achievements_summary"),
  evidenceLinks: text("evidence_links"),
  feedback: text("feedback"),
  developmentGaps: text("development_gaps"),
  nextSteps: text("next_steps"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("performance_evidence_user_uq").on(t.userId)]);

/* ---------------------------------------------------------------- Audit */

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  entity: varchar("entity", { length: 40 }).notNull(),
  entityId: varchar("entity_id", { length: 64 }),
  action: varchar("action", { length: 40 }).notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("audit_entity_idx").on(t.entity, t.entityId), index("audit_user_idx").on(t.userId)]);

/* ===================================================================== */
/*  PHASE 2 — Advanced modules                                           */
/* ===================================================================== */

/* ------------------------------------------------- Meetings & manager */

export const meetings = pgTable("meetings", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 240 }).notNull(),
  type: varchar("type", { length: 24 }).notNull().default("one_on_one"), // one_on_one|team|review|retro|standup|skip_level|external
  meetingDate: date("meeting_date").notNull(),
  startTime: varchar("start_time", { length: 5 }),
  durationMinutes: integer("duration_minutes").notNull().default(30),
  attendees: text("attendees").array(),
  manager: varchar("manager", { length: 120 }),
  agenda: text("agenda"),
  notes: text("notes"),
  discussionTopics: text("discussion_topics").array(),
  feedback: text("feedback"),
  decisions: text("decisions"),
  managerCommitments: text("manager_commitments"),
  followUpDate: date("follow_up_date"),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  issueId: uuid("issue_id").references(() => issues.id, { onDelete: "set null" }),
  careerGoalId: uuid("career_goal_id").references(() => careerGoals.id, { onDelete: "set null" }),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => [index("meetings_user_date_idx").on(t.userId, t.meetingDate), index("meetings_type_idx").on(t.type)]);

export const meetingActionItems = pgTable("meeting_action_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  meetingId: uuid("meeting_id").notNull().references(() => meetings.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  owner: varchar("owner", { length: 120 }),
  dueDate: date("due_date"),
  status: varchar("status", { length: 20 }).notNull().default("open"), // open|in_progress|done|dropped
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("mai_meeting_idx").on(t.meetingId), index("mai_status_idx").on(t.status)]);

/* ------------------------------------------------- Knowledge base */

export const knowledgeDocs = pgTable("knowledge_docs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 240 }).notNull(),
  docType: varchar("doc_type", { length: 24 }).notNull().default("note"), // note|snippet|command|runbook|architecture|troubleshooting
  category: varchar("category", { length: 80 }),
  body: text("body").notNull().default(""),       // markdown / rich text
  language: varchar("language", { length: 32 }),   // for code snippets
  tags: text("tags").array(),
  isFavorite: boolean("is_favorite").notNull().default(false),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  relatedDocIds: text("related_doc_ids").array(),
  attachments: jsonb("attachments"),
  viewCount: integer("view_count").notNull().default(0),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => [
  index("kb_user_idx").on(t.userId),
  index("kb_type_idx").on(t.docType),
  index("kb_fav_idx").on(t.userId, t.isFavorite),
]);

/* ------------------------------------------------- Automation engine */

export const automationRules = pgTable("automation_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  ruleKey: varchar("rule_key", { length: 48 }).notNull(), // deadline_reminder|overdue_issue|weekly_report|leave_reminder|goal_deadline|pending_task
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description"),
  enabled: boolean("enabled").notNull().default(true),
  leadDays: integer("lead_days").notNull().default(3),
  channel: varchar("channel", { length: 20 }).notNull().default("in_app"), // in_app|desktop
  config: jsonb("config"),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  lastRunCount: integer("last_run_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("automation_user_rule_uq").on(t.userId, t.ruleKey)]);

export const automationRuns = pgTable("automation_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  ruleId: uuid("rule_id").notNull().references(() => automationRules.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  generated: integer("generated").notNull().default(0),
  detail: text("detail"),
  ranAt: timestamp("ran_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("automation_runs_rule_idx").on(t.ruleId)]);

/* ------------------------------------------------- AI assistant */

export const aiConversations = pgTable("ai_conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 200 }).notNull().default("New conversation"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("ai_conv_user_idx").on(t.userId)]);

export const aiMessages = pgTable("ai_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull().references(() => aiConversations.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 12 }).notNull(), // user|assistant
  content: text("content").notNull(),
  intent: varchar("intent", { length: 40 }),
  sources: jsonb("sources"),          // supporting records behind every answer
  provider: varchar("provider", { length: 24 }).notNull().default("grounded"),
  edited: boolean("edited").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("ai_msg_conv_idx").on(t.conversationId)]);

/* ------------------------------------------------- Sync & backup */

export const syncState = pgTable("sync_state", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  deviceId: varchar("device_id", { length: 64 }).notNull(),
  deviceLabel: varchar("device_label", { length: 120 }),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  lastCursor: timestamp("last_cursor", { withTimezone: true }),
  status: varchar("status", { length: 20 }).notNull().default("idle"), // idle|syncing|error|conflict
  pendingOps: integer("pending_ops").notNull().default(0),
  conflictCount: integer("conflict_count").notNull().default(0),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("sync_user_device_uq").on(t.userId, t.deviceId)]);

export const backupSnapshots = pgTable("backup_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  label: varchar("label", { length: 120 }).notNull(),
  payload: jsonb("payload").notNull(),
  checksum: varchar("checksum", { length: 64 }).notNull(),
  recordCount: integer("record_count").notNull().default(0),
  sizeBytes: integer("size_bytes").notNull().default(0),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  verifyResult: varchar("verify_result", { length: 20 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("backup_user_idx").on(t.userId)]);
