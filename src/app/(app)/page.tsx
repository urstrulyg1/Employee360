"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight, Bug, CircleDot, Clock3, Flame, Palmtree, Rocket, SquareKanban,
  CalendarDays, CheckCircle2, AlertTriangle, LayoutGrid, Plus, Minus, Eye, EyeOff,
  PartyPopper, GitBranch, Target,
} from "lucide-react";
import { api } from "@/lib/client";
import { Badge, Button, Card, CardHeader, Empty, Modal, PageHeader, Skeleton, Tag } from "@/components/ui";
import { Donut, GroupedBars, WeekBars, formatWeek } from "@/components/charts";
import { humanize, todayYMD, daysUntil } from "@/lib/dates";
import { label } from "@/lib/domain";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

type Dash = {
  profile: { designation: string; department: string; location: string } | null;
  preferences: { widgetLayout?: unknown } | null;
  kpis: Record<string, number> & { totalIssues: number; openIssues: number; inProgressIssues: number; blockedIssues: number; resolvedIssues: number; overdueIssues: number; tasksCompletedThisMonth: number; activeProjects: number; leavesTaken: number; leaveEntitlement: number; upcomingHolidays: number; upcomingPlannedLeaves: number; openTasks: number };
  distributions: {
    issuesByStatus: { name: string; value: number }[];
    issuesByPriority: { name: string; value: number }[];
    projectBreakdown: { name: string; key: string; value: number }[];
    weeklyTasks: { week: string; value: number }[];
    monthlyTrend: { month: string; tasks: number; issues: number; hours: number }[];
  };
  upcoming: {
    holidays: { id: string; name: string; holidayDate: string; category: string }[];
    leaves: { entry: { id: string; startDate: string; endDate: string; days: string; status: string }; type: { name: string; color: string } }[];
    deadlines: { id: string; key: string; title: string; dueDate: string; priority: string }[];
  };
  recent: {
    issues: { id: string; key: string; title: string; status: string; priority: string; updatedAt: string }[];
    journals: { id: string; journalDate: string; summary: string | null; timeSpentHours: string }[];
    completedTasks: { id: string; title: string; completedAt: string | null; priority: string }[];
    activity: { entity: string; action: string; createdAt: string; metadata: unknown }[];
    github: { id: string; activityDate: string; type: string; title: string; count: number }[];
  };
};

type WidgetKey = "kpis" | "workOverview" | "calendarOverview" | "recent" | "insights";
const WIDGETS: { key: WidgetKey; title: string }[] = [
  { key: "kpis", title: "KPI Cards" },
  { key: "workOverview", title: "Work Overview Charts" },
  { key: "calendarOverview", title: "Calendar Overview" },
  { key: "recent", title: "Recent Activity" },
  { key: "insights", title: "Productivity Insights" },
];

export default function OverviewPage() {
  const [data, setData] = useState<Dash | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [layout, setLayout] = useState<{ key: WidgetKey; visible: boolean }[]>(WIDGETS.map((w) => ({ key: w.key, visible: true })));

  const load = useCallback(async () => {
    try {
      const r = await api.get<Dash>("/api/dashboard");
      setData(r);
      const saved = (r.preferences?.widgetLayout as { key: WidgetKey; visible: boolean }[] | undefined);
      if (Array.isArray(saved) && saved.length) {
        setLayout(WIDGETS.map((w) => saved.find((s) => s.key === w.key) ?? { key: w.key, visible: true }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load dashboard");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveLayout = async () => {
    try {
      await api.patch("/api/profile", { preferences: { widgetLayout: layout } });
      toast.success("Dashboard layout saved");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); }
  };

  const isVisible = (k: WidgetKey) => layout.find((l) => l.key === k)?.visible ?? true;
  const ordered = useMemo(() => {
    const core = layout.map((l) => l.key).filter((k) => k !== "kpis");
    return core.filter(isVisible) as WidgetKey[];
  }, [layout]);

  const renderWidget = (key: WidgetKey) => {
    if (!data) return null;
    switch (key) {
      case "workOverview": return <WorkOverview key={key} d={data} />;
      case "calendarOverview": return <CalendarOverview key={key} d={data} />;
      case "recent": return <RecentActivity key={key} d={data} />;
      case "insights": return <Insights key={key} d={data} />;
      default: return null;
    }
  };

  if (error) {
    return <Empty title="Dashboard unavailable" hint={error} icon={<AlertTriangle className="size-5" />} action={<Button onClick={load}>Retry</Button>} />;
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader
        title="Overview"
        subtitle={`${new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })} · Live from your database`}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setCustomOpen(true)}><LayoutGrid className="size-3.5" /> Customize</Button>
            <Link href="/issues?new=1"><Button size="sm"><Rocket className="size-3.5" /> New issue</Button></Link>
          </>
        }
      />

      {/* KPI band */}
      {isVisible("kpis") && (
        !data ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-6">
            {[...Array(12)].map((_, i) => <Skeleton key={i} className="h-[86px]" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-6">
            <Kpi icon={CircleDot} label="Assigned issues" value={data.kpis.totalIssues} href="/issues" />
            <Kpi icon={Bug} label="Open" value={data.kpis.openIssues} tone="sky" href="/issues?status=open" />
            <Kpi icon={Clock3} label="In progress" value={data.kpis.inProgressIssues} tone="indigo" href="/issues?status=in_progress" />
            <Kpi icon={AlertTriangle} label="Blocked" value={data.kpis.blockedIssues} tone="red" href="/issues?status=blocked" />
            <Kpi icon={CheckCircle2} label="Resolved" value={data.kpis.resolvedIssues} tone="emerald" href="/issues?status=resolved" />
            <Kpi icon={Flame} label="Overdue" value={data.kpis.overdueIssues} tone="orange" href="/issues" />
            <Kpi icon={CheckCircle2} label="Tasks done (month)" value={data.kpis.tasksCompletedThisMonth} tone="emerald" href="/tasks" />
            <Kpi icon={SquareKanban} label="Active projects" value={data.kpis.activeProjects} tone="violet" href="/projects" />
            <Kpi icon={Palmtree} label="Leaves taken" value={data.kpis.leavesTaken} tone="amber" href="/leaves" />
            <Kpi icon={Palmtree} label="Leave entitlement" value={data.kpis.leaveEntitlement} tone="teal" href="/leaves" suffix="d" />
            <Kpi icon={PartyPopper} label="Holidays ahead" value={data.kpis.upcomingHolidays} tone="rose" href="/holidays" />
            <Kpi icon={CalendarDays} label="Planned leaves" value={data.kpis.upcomingPlannedLeaves} tone="violet" href="/planner" />
          </div>
        )
      )}

      {/* Widgets */}
      {!data ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-64 lg:col-span-2" />
          <Skeleton className="h-64" />
          <Skeleton className="h-64" /><Skeleton className="h-64" /><Skeleton className="h-64" />
        </div>
      ) : (
        ordered.map(renderWidget)
      )}

      {/* Customize modal */}
      <Modal open={customOpen} onClose={() => setCustomOpen(false)} title="Customize dashboard widgets">
        <p className="mb-4 text-xs text-zinc-500">Toggle visibility and reorder sections. The layout is stored in your employee preferences.</p>
        <div className="space-y-1">
          {layout.map((w, i) => (
            <div key={w.key} className="flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 dark:border-white/[0.07]">
              <button onClick={() => setLayout((l) => l.map((x, j) => j === i ? { ...x, visible: !x.visible } : x))} className="text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
                {w.visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
              </button>
              <span className={cn("flex-1 text-[13px] font-medium", !w.visible && "text-zinc-400 line-through")}>{WIDGETS.find((x) => x.key === w.key)?.title}</span>
              <Button size="xs" variant="ghost" disabled={i === 0} onClick={() => setLayout((l) => { const n = [...l]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; })}><Plus className="size-3 rotate-45 hidden" />↑</Button>
              <Button size="xs" variant="ghost" disabled={i === layout.length - 1} onClick={() => setLayout((l) => { const n = [...l]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; return n; })}><Minus className="hidden" />↓</Button>
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="subtle" onClick={() => setCustomOpen(false)}>Close</Button>
          <Button onClick={() => { saveLayout(); setCustomOpen(false); }}>Save layout</Button>
        </div>
      </Modal>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
function Kpi({ icon: Icon, label: l, value, tone = "indigo", href, suffix }: { icon: React.ElementType; label: string; value: number; tone?: string; href: string; suffix?: string }) {
  const toneHex: Record<string, string> = { indigo: "text-indigo-500", sky: "text-sky-500", red: "text-red-500", emerald: "text-emerald-500", orange: "text-orange-500", violet: "text-violet-500", amber: "text-amber-500", teal: "text-teal-500", rose: "text-rose-500" };
  return (
    <Link href={href} className="group">
      <Card className="flex h-[86px] flex-col justify-between p-3 transition-all hover:-translate-y-0.5 hover:border-indigo-500/30 hover:shadow-md dark:hover:border-indigo-400/20">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">{l}</span>
          <Icon className={cn("size-3.5", toneHex[tone])} />
        </div>
        <div className="flex items-baseline gap-1">
          <span className="font-mono text-xl font-semibold tracking-tight text-zinc-900 dark:text-white">{value}{suffix}</span>
          <ArrowUpRight className="size-3 text-zinc-300 opacity-0 transition-opacity group-hover:opacity-100 dark:text-zinc-600" />
        </div>
      </Card>
    </Link>
  );
}

function WorkOverview({ d }: { d: Dash }) {
  const trend = d.distributions.monthlyTrend;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader title="Monthly productivity trend" subtitle="Tasks completed, issues resolved and logged hours" />
        <div className="p-4">
          {trend.length ? <GroupedBars data={trend} keys={["tasks", "issues"]} colors={["#10b981", "#6366f1"]} /> : <Empty title="No activity yet" />}
        </div>
      </Card>
      <Card>
        <CardHeader title="Weekly task completion" subtitle="Last 8 weeks" />
        <div className="p-4">
          {d.distributions.weeklyTasks.length ? <WeekBars data={d.distributions.weeklyTasks} /> : <Empty title="Nothing completed recently" />}
        </div>
      </Card>
      <Card>
        <CardHeader title="Issues by status" />
        <div className="p-4"><Donut data={d.distributions.issuesByStatus} useTones /></div>
      </Card>
      <Card>
        <CardHeader title="Issues by priority" />
        <div className="p-4"><Donut data={d.distributions.issuesByPriority} useTones /></div>
      </Card>
      <Card>
        <CardHeader title="Work by project" subtitle="Issues per project" />
        <div className="space-y-3 p-4">
          {d.distributions.projectBreakdown.map((p) => (
            <div key={p.key}>
              <div className="mb-1 flex items-center justify-between text-[12px]">
                <span className="font-medium text-zinc-700 dark:text-zinc-300">{p.name}</span>
                <span className="font-mono text-zinc-400">{p.value}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-white/[0.06]">
                <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500" style={{ width: `${Math.min(100, p.value * 14)}%` }} />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function CalendarOverview({ d }: { d: Dash }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card>
        <CardHeader title="Upcoming holidays" action={<Link href="/holidays" className="text-[11px] text-indigo-500 hover:underline">All</Link>} />
        <div className="divide-y divide-zinc-100 dark:divide-white/[0.05]">
          {d.upcoming.holidays.map((h) => (
            <div key={h.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="w-10 text-center">
                <p className="font-mono text-[15px] font-semibold leading-none">{h.holidayDate.slice(8, 10)}</p>
                <p className="text-[10px] uppercase text-zinc-400">{new Date(h.holidayDate + "T00:00:00").toLocaleDateString("en-GB", { month: "short" })}</p>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-medium">{h.name}</p>
                <p className="text-[11px] text-zinc-400">{daysUntil(h.holidayDate)} day(s) away</p>
              </div>
              <Badge value={h.category} />
            </div>
          ))}
          {!d.upcoming.holidays.length && <p className="px-4 py-6 text-center text-xs text-zinc-400">No holidays in the next 45 days</p>}
        </div>
      </Card>
      <Card>
        <CardHeader title="Upcoming leaves" action={<Link href="/leaves" className="text-[11px] text-indigo-500 hover:underline">Manage</Link>} />
        <div className="divide-y divide-zinc-100 dark:divide-white/[0.05]">
          {d.upcoming.leaves.map(({ entry, type }) => (
            <div key={entry.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="h-8 w-1 rounded-full" style={{ background: type.color }} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-medium">{type.name}</p>
                <p className="text-[11px] text-zinc-400">{humanize(entry.startDate)} → {humanize(entry.endDate)} · {entry.days}d</p>
              </div>
              <Badge value={entry.status} />
            </div>
          ))}
          {!d.upcoming.leaves.length && <p className="px-4 py-6 text-center text-xs text-zinc-400">No upcoming leaves</p>}
        </div>
      </Card>
      <Card>
        <CardHeader title="Issue deadlines" subtitle="Next 3 weeks" action={<Link href="/issues" className="text-[11px] text-indigo-500 hover:underline">Issues</Link>} />
        <div className="divide-y divide-zinc-100 dark:divide-white/[0.05]">
          {d.upcoming.deadlines.map((i) => (
            <Link key={i.id} href={`/issues/${i.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-50 dark:hover:bg-white/[0.03]">
              <span className="font-mono text-[11px] text-zinc-400">{i.key}</span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{i.title}</span>
              <Badge value={i.priority} />
              <span className="font-mono text-[11px] text-zinc-400">{humanize(i.dueDate)}</span>
            </Link>
          ))}
          {!d.upcoming.deadlines.length && <p className="px-4 py-6 text-center text-xs text-zinc-400">No deadlines in the next 3 weeks</p>}
        </div>
      </Card>
    </div>
  );
}

function RecentActivity({ d }: { d: Dash }) {
  const tz = "Asia/Kolkata";
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-1">
        <CardHeader title="Recently updated issues" />
        <div className="divide-y divide-zinc-100 dark:divide-white/[0.05]">
          {d.recent.issues.map((i) => (
            <Link key={i.id} href={`/issues/${i.id}`} className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-zinc-50 dark:hover:bg-white/[0.03]">
              <span className="font-mono text-[11px] text-zinc-400">{i.key}</span>
              <span className="min-w-0 flex-1 truncate text-[12.5px]">{i.title}</span>
              <Badge value={i.status} />
            </Link>
          ))}
        </div>
      </Card>
      <Card className="lg:col-span-1">
        <CardHeader title="Recently completed tasks" />
        <div className="divide-y divide-zinc-100 dark:divide-white/[0.05]">
          {d.recent.completedTasks.map((t) => (
            <div key={t.id} className="flex items-center gap-2.5 px-4 py-2.5">
              <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
              <span className="min-w-0 flex-1 truncate text-[12.5px]">{t.title}</span>
              <span className="text-[10.5px] text-zinc-400">{t.completedAt ? new Date(t.completedAt).toLocaleDateString("en-GB", { timeZone: tz, day: "numeric", month: "short" }) : ""}</span>
            </div>
          ))}
          {!d.recent.completedTasks.length && <p className="px-4 py-6 text-center text-xs text-zinc-400">No completed tasks yet</p>}
        </div>
      </Card>
      <Card className="lg:col-span-1">
        <CardHeader title="Recent journal entries" subtitle="Work log summaries" />
        <div className="divide-y divide-zinc-100 dark:divide-white/[0.05]">
          {d.recent.journals.map((j) => (
            <Link key={j.id} href={`/journal?date=${j.journalDate}`} className="block px-4 py-2.5 hover:bg-zinc-50 dark:hover:bg-white/[0.03]">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] text-zinc-400">{humanize(j.journalDate)}</span>
                <span className="text-[11px] text-zinc-400">{j.timeSpentHours}h</span>
              </div>
              <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-zinc-600 dark:text-zinc-400">{j.summary}</p>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Insights({ d }: { d: Dash }) {
  const gh = d.recent.github;
  const auditFeed = d.recent.activity;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card>
        <CardHeader title="Weekly accomplishments" subtitle="From your journal" />
        <div className="space-y-2 px-4 py-3">
          {d.recent.journals.map((j) => (
            <p key={j.id} className="text-[12px] leading-relaxed text-zinc-600 dark:text-zinc-400">
              <span className="mr-2 font-mono text-[10.5px] text-zinc-400">{humanize(j.journalDate)}</span>{j.summary}
            </p>
          ))}
          {!d.recent.journals.length && <p className="py-4 text-center text-xs text-zinc-400">Write today's journal to see weekly accomplishments.</p>}
        </div>
      </Card>
      <Card>
        <CardHeader title="Developer activity" subtitle="Latest GitHub signals" action={<Link href="/activity" className="text-[11px] text-indigo-500 hover:underline">Open</Link>} />
        <div className="divide-y divide-zinc-100 dark:divide-white/[0.05]">
          {gh.map((g) => (
            <div key={g.id} className="flex items-center gap-2.5 px-4 py-2.5">
              <GitBranch className="size-3.5 shrink-0 text-zinc-400" />
              <span className="min-w-0 flex-1 truncate text-[12.5px]">{g.title}</span>
              <Tag>{label(g.type)}</Tag>
            </div>
          ))}
          {!gh.length && (
            <div className="px-4 py-6 text-center">
              <p className="text-xs text-zinc-400">No GitHub activity yet.</p>
              <Link href="/activity" className="mt-1 inline-block text-[11px] text-indigo-500 hover:underline">Connect GitHub or add a manual entry</Link>
            </div>
          )}
        </div>
      </Card>
      <Card>
        <CardHeader title="Activity trail" subtitle="Audit log" />
        <div className="divide-y divide-zinc-100 dark:divide-white/[0.05]">
          {auditFeed.map((a, i) => (
            <div key={i} className="flex items-center gap-2.5 px-4 py-2.5">
              <Target className="size-3.5 shrink-0 text-zinc-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px]"><span className="font-medium">{a.entity}</span> <span className="text-zinc-400">{a.action.replace(/\./g, " ")}</span></p>
              </div>
              <span className="text-[10.5px] text-zinc-400">{new Date(a.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: tzConst })}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

const tzConst = "Asia/Kolkata";
