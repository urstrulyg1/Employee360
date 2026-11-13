// Domain constants shared between UI and API validation.

export const ISSUE_TYPES = ["bug", "feature", "enhancement", "dev_task", "tech_debt", "research", "support", "maintenance"] as const;
export type IssueType = (typeof ISSUE_TYPES)[number];

export const PRIORITIES = ["critical", "high", "medium", "low"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const ISSUE_STATUSES = ["backlog", "open", "in_progress", "blocked", "under_review", "resolved", "closed"] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export const TASK_STATUSES = ["todo", "in_progress", "blocked", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const LEAVE_STATUSES = ["planned", "pending", "approved", "rejected", "cancelled"] as const;
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];

export const HOLIDAY_CATEGORIES = ["national", "regional", "company", "optional", "restricted"] as const;
export type HolidayCategory = (typeof HOLIDAY_CATEGORIES)[number];

export const GOAL_HORIZONS = ["short", "quarterly", "annual", "learning", "career"] as const;
export const ACHIEVEMENT_CATEGORIES = [
  "project", "technical", "production_issue", "enhancement", "certification",
  "learning", "mentoring", "knowledge_sharing", "team", "customer_impact", "process_improvement",
] as const;

export const GITHUB_TYPES = ["commit", "pr_opened", "pr_merged", "pr_review", "issue"] as const;

/* ---- display maps ---- */
export const labels: Record<string, string> = {
  bug: "Bug", feature: "Feature", enhancement: "Enhancement", dev_task: "Dev Task",
  tech_debt: "Tech Debt", research: "Research", support: "Support", maintenance: "Maintenance",
  critical: "Critical", high: "High", medium: "Medium", low: "Low",
  backlog: "Backlog", open: "Open", in_progress: "In Progress", blocked: "Blocked",
  under_review: "Under Review", resolved: "Resolved", closed: "Closed",
  todo: "To Do", done: "Done",
  planned: "Planned", pending: "Pending", approved: "Approved", rejected: "Rejected", cancelled: "Cancelled",
  national: "National", regional: "Regional", company: "Company", optional: "Optional", restricted: "Restricted",
  active: "Active", on_hold: "On Hold", completed: "Completed", archived: "Archived",
  meeting: "Meeting", reminder: "Reminder", issue: "Issue", task: "Task", leave: "Leave", holiday: "Holiday", milestone: "Milestone",
  commit: "Commit", pr_opened: "PR Opened", pr_merged: "PR Merged", pr_review: "PR Review",
  not_started: "Not Started", short: "Short-term", quarterly: "Quarterly", annual: "Annual",
  one_on_one: "1:1", standup: "Standup", retro: "Retro", skip_level: "Skip-level", external: "External",
  note: "Note", snippet: "Code Snippet", runbook: "Runbook", architecture: "Architecture", troubleshooting: "Troubleshooting",
  dropped: "Dropped", in_progress_item: "In Progress",
  learning: "Learning", career: "Career",
  project: "Project", technical: "Technical", production_issue: "Production Issue",
  certification: "Certification", mentoring: "Mentoring", knowledge_sharing: "Knowledge Sharing",
  team: "Team", customer_impact: "Customer Impact", process_improvement: "Process Improvement",
};

export const tone: Record<string, string> = {
  critical: "red", high: "orange", medium: "yellow", low: "zinc",
  backlog: "zinc", open: "sky", in_progress: "indigo", blocked: "red",
  under_review: "violet", resolved: "emerald", closed: "zinc",
  todo: "sky", done: "emerald",
  planned: "violet", pending: "amber", approved: "emerald", rejected: "red", cancelled: "zinc",
  national: "rose", regional: "amber", company: "indigo", optional: "teal", restricted: "violet",
  active: "emerald", on_hold: "amber", completed: "sky", archived: "zinc",
  meeting: "indigo", issue: "sky", task: "teal", leave: "amber", holiday: "rose", milestone: "violet", reminder: "zinc",
  not_started: "zinc",
};

export type Tone = "zinc" | "red" | "orange" | "amber" | "yellow" | "emerald" | "teal" | "sky" | "indigo" | "violet" | "rose";

export const toneClasses: Record<Tone, { dot: string; chip: string; bar: string; hex: string }> = {
  zinc:    { dot: "bg-zinc-400",    chip: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-300 ring-zinc-500/25",    bar: "bg-zinc-400",    hex: "#a1a1aa" },
  red:     { dot: "bg-red-500",     chip: "bg-red-500/10 text-red-600 dark:text-red-400 ring-red-500/25",         bar: "bg-red-500",     hex: "#ef4444" },
  orange:  { dot: "bg-orange-500",  chip: "bg-orange-500/10 text-orange-600 dark:text-orange-400 ring-orange-500/25", bar: "bg-orange-500", hex: "#f97316" },
  amber:   { dot: "bg-amber-500",   chip: "bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-500/25", bar: "bg-amber-500",   hex: "#f59e0b" },
  yellow:  { dot: "bg-yellow-500",  chip: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 ring-yellow-500/25", bar: "bg-yellow-500", hex: "#eab308" },
  emerald: { dot: "bg-emerald-500", chip: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/25", bar: "bg-emerald-500", hex: "#10b981" },
  teal:    { dot: "bg-teal-500",    chip: "bg-teal-500/10 text-teal-600 dark:text-teal-400 ring-teal-500/25",       bar: "bg-teal-500",    hex: "#14b8a6" },
  sky:     { dot: "bg-sky-500",     chip: "bg-sky-500/10 text-sky-600 dark:text-sky-400 ring-sky-500/25",           bar: "bg-sky-500",     hex: "#0ea5e9" },
  indigo:  { dot: "bg-indigo-500",  chip: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 ring-indigo-500/25", bar: "bg-indigo-500", hex: "#6366f1" },
  violet:  { dot: "bg-violet-500",  chip: "bg-violet-500/10 text-violet-600 dark:text-violet-400 ring-violet-500/25", bar: "bg-violet-500", hex: "#8b5cf6" },
  rose:    { dot: "bg-rose-500",    chip: "bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-rose-500/25",       bar: "bg-rose-500",    hex: "#f43f5e" },
};

export const label = (v: string) => labels[v] ?? v;
export const toneOf = (v: string): Tone => (tone[v] as Tone) ?? "zinc";
