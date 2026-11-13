"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { Download, FileText, AlertTriangle, Gauge, CalendarDays, Flame, Printer } from "lucide-react";
import { api } from "@/lib/client";
import { Badge, Button, Card, CardHeader, PageHeader, Skeleton } from "@/components/ui";
import { Donut, GroupedBars, MiniBars, WeekBars, formatWeek } from "@/components/charts";
import { humanize } from "@/lib/dates";
import { label } from "@/lib/domain";

type Analytics = {
  issues: {
    createdVsResolved: { month: string; created: number; resolved: number }[];
    byStatus: { name: string; value: number }[];
    byPriority: { name: string; value: number }[];
    byType: { name: string; value: number }[];
    avgResolutionHours: number;
    overdue: { key: string; title: string; dueDate: string | null; status: string; priority: string }[];
    projectTrend: unknown[];
  };
  leaves: {
    monthlyUsage: { month: string; value: number }[];
    byCategory: { name: string; value: number; color: string }[];
    statusCounts: { name: string; value: number }[];
  };
  productivity: {
    tasksWeekly: { week: string; value: number }[];
    hoursWeekly: { week: string; value: number }[];
    commitsWeekly: { week: string; value: number }[];
    totalHoursLogged: number;
    projectContributions: { project: string; v: number }[];
  };
};

const REPORTS = [
  { type: "weekly-status", title: "Weekly status report", desc: "Completed, in-flight, blockers and availability", param: "" },
  { type: "monthly-achievements", title: "Monthly achievement report", desc: "Achievements, resolved issues and goal progress", param: "&month=" + new Date().toISOString().slice(0, 7) },
  { type: "project-contribution", title: "Project contribution report", desc: "Per-project delivery, effort and completion rate", param: "" },
  { type: "leave-utilisation", title: "Leave utilisation report", desc: "Entitlement vs taken vs planned, with utilisation %", param: "&year=" + new Date().getFullYear() },
  { type: "workload", title: "Workload report", desc: "Daily capacity, planned vs logged hours, risks", param: "" },
  { type: "career-progress", title: "Career progress report", desc: "Goals, achievements and 1:1 feedback trail", param: "" },
  { type: "meetings", title: "Meeting & follow-up report", desc: "Meetings, decisions and action item status", param: "" },
  { type: "knowledge", title: "Knowledge base export", desc: "All technical notes, snippets and runbooks", param: "" },
  { type: "monthly-work", title: "Monthly work report", desc: "Journals, hours, meetings for the current month", param: "&month=" + new Date().toISOString().slice(0, 7) },
  { type: "weekly-work", title: "Weekly work report", desc: "Last 7 days of journal entries", param: "" },
  { type: "issues", title: "Issue tracking report", desc: "All issues with status, effort and dates", param: "" },
  { type: "leave-history", title: "Leave history report", desc: "Every leave entry with deduction rules applied", param: "" },
  { type: "leave-balance", title: "Leave balance report", desc: "Opening / accrued / taken / remaining per category", param: "&year=" + new Date().getFullYear() },
  { type: "holidays", title: "Annual holiday calendar", desc: "Verified holidays for the selected year", param: "&year=" + new Date().getFullYear() },
  { type: "projects", title: "Project progress report", desc: "Status, open issues and owners per project", param: "" },
  { type: "achievements", title: "Career achievements report", desc: "Goals and verified achievements log", param: "" },
];

export default function AnalyticsPage() {
  const [d, setD] = useState<Analytics | null>(null);
  useEffect(() => { api.get<Analytics>("/api/analytics").then(setD).catch((e) => toast.error(e.message)); }, []);

  if (!d) {
    return (
      <div className="space-y-4">
        <PageHeader title="Analytics & Reports" subtitle="Computed live from PostgreSQL" />
        <div className="grid gap-4 md:grid-cols-3">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-60" />)}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Analytics & Reports" subtitle="Every figure below is computed from your stored records" />

      {/* ISSUES */}
      <section>
        <SectionTitle title="Issue analytics" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title="Created vs resolved" subtitle="Monthly" />
            <div className="p-4"><GroupedBars data={d.issues.createdVsResolved} keys={["created", "resolved"]} colors={["#94a3b8", "#10b981"]} /></div>
          </Card>
          <Card>
            <CardHeader title="Resolution time" subtitle="Created → resolved" />
            <div className="flex flex-col items-center justify-center gap-1 p-8">
              <Gauge className="size-5 text-indigo-400" />
              <p className="font-mono text-4xl font-bold tracking-tight">{d.issues.avgResolutionHours}<span className="text-base font-medium text-zinc-400">h</span></p>
              <p className="text-[11px] text-zinc-400">average across resolved issues</p>
            </div>
          </Card>
          <Card>
            <CardHeader title="Status distribution" />
            <div className="p-4"><Donut data={d.issues.byStatus} useTones /></div>
          </Card>
          <Card>
            <CardHeader title="Priority distribution" />
            <div className="p-4"><Donut data={d.issues.byPriority} useTones /></div>
          </Card>
          <Card>
            <CardHeader title="Overdue issues" subtitle={`${d.issues.overdue.length} need attention`} />
            <div className="max-h-72 divide-y divide-zinc-100 overflow-y-auto dark:divide-white/[0.05]">
              {d.issues.overdue.map((o) => (
                <div key={o.key} className="flex items-center gap-2 px-4 py-2.5">
                  <AlertTriangle className="size-3.5 shrink-0 text-red-500" />
                  <span className="font-mono text-[11px] text-zinc-400">{o.key}</span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px]">{o.title}</span>
                  <Badge value={o.priority} />
                  <span className="font-mono text-[10.5px] text-red-400">{humanize(o.dueDate)}</span>
                </div>
              ))}
              {!d.issues.overdue.length && <p className="px-4 py-10 text-center text-xs text-emerald-500">No overdue issues. Nice.</p>}
            </div>
          </Card>
        </div>
      </section>

      {/* LEAVES */}
      <section>
        <SectionTitle title="Leave analytics" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader title="Monthly usage" subtitle="Approved leave days per month" />
            <div className="p-4">
              {d.leaves.monthlyUsage.length ? <MiniBars data={d.leaves.monthlyUsage} x="month" y="value" color="#f59e0b" /> : <p className="py-8 text-center text-xs text-zinc-400">No approved leaves yet</p>}
            </div>
          </Card>
          <Card>
            <CardHeader title="Category split" subtitle="Approved days by leave type" />
            <div className="p-4">
              {d.leaves.byCategory.length ? <Donut data={d.leaves.byCategory} /> : <p className="py-8 text-center text-xs text-zinc-400">No data</p>}
            </div>
          </Card>
          <Card>
            <CardHeader title="Request pipeline" subtitle="Entries by status" />
            <div className="p-4"><Donut data={d.leaves.statusCounts} useTones /></div>
          </Card>
        </div>
      </section>

      {/* PRODUCTIVITY */}
      <section>
        <SectionTitle title="Productivity analytics" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader title="Tasks completed" subtitle="Per week, last 12 weeks" />
            <div className="p-4">{d.productivity.tasksWeekly.length ? <WeekBars data={d.productivity.tasksWeekly} /> : <p className="py-8 text-center text-xs text-zinc-400">No completions recorded</p>}</div>
          </Card>
          <Card>
            <CardHeader title="Hours logged" subtitle={`${d.productivity.totalHoursLogged}h total from journal`} />
            <div className="p-4">{d.productivity.hoursWeekly.length ? <WeekBars data={d.productivity.hoursWeekly} color="#0ea5e9" /> : <p className="py-8 text-center text-xs text-zinc-400">No hours logged</p>}</div>
          </Card>
          <Card>
            <CardHeader title="GitHub commits" subtitle="Raw signal — not a performance measure" />
            <div className="p-4">
              {d.productivity.commitsWeekly.length ? <WeekBars data={d.productivity.commitsWeekly} color="#8b5cf6" /> : (
                <p className="py-8 text-center text-xs text-zinc-400">No activity — <Link className="text-indigo-500 hover:underline" href="/activity">connect GitHub</Link></p>
              )}
            </div>
          </Card>
          <Card className="lg:col-span-3">
            <CardHeader title="Project contributions" subtitle="Resolved issues per project" />
            <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
              {d.productivity.projectContributions.map((p) => (
                <div key={p.project} className="rounded-lg border border-zinc-100 p-3 dark:border-white/[0.06]">
                  <p className="truncate text-[11px] text-zinc-500">{p.project}</p>
                  <p className="font-mono text-xl font-bold text-emerald-500">{p.v}</p>
                  <p className="text-[10px] text-zinc-400">issues resolved</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </section>

      {/* REPORTS */}
      <section>
        <SectionTitle title="Downloadable reports" />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {REPORTS.map((r) => (
            <Card key={r.type} className="flex flex-col p-4">
              <FileText className="size-4 text-indigo-400" />
              <p className="mt-2 text-[13px] font-semibold">{r.title}</p>
              <p className="mt-0.5 flex-1 text-[11.5px] leading-relaxed text-zinc-500">{r.desc}</p>
              <div className="mt-3 flex gap-1.5">
                <Button size="xs" variant="outline" onClick={() => window.open(`/api/reports?type=${r.type}&format=csv${r.param}`)}><Download className="size-3" /> CSV</Button>
                <Button size="xs" variant="outline" onClick={() => window.open(`/api/reports?type=${r.type}&format=xlsx${r.param}`)}><Download className="size-3" /> XLSX</Button>
                <Button size="xs" variant="ghost" onClick={() => window.open(`/reports/print?type=${r.type}${r.param}`, "_blank")}><Printer className="size-3" /> PDF</Button>
              </div>
            </Card>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-zinc-400">PDF export opens a print-ready view — use your browser's “Save as PDF”.</p>
      </section>
    </div>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <Flame className="size-3.5 text-indigo-400" />
      <h2 className="text-[13px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{title}</h2>
      <div className="h-px flex-1 bg-zinc-200/70 dark:bg-white/[0.06]" />
    </div>
  );
}
