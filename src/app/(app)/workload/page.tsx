"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Gauge, AlertTriangle, Clock3, Settings2, Save, CalendarX, TrendingUp, Download } from "lucide-react";
import { api } from "@/lib/client";
import { Badge, Button, Card, CardHeader, Empty, Field, Input, Modal, PageHeader, Progress, Skeleton, Tag } from "@/components/ui";
import { MiniBars, Donut } from "@/components/charts";
import { humanize } from "@/lib/dates";
import { cn } from "@/lib/utils";

type Workload = {
  settings: { workStartHour: number; workEndHour: number; focusHoursPerDay: number; weekendDays: number[]; grossDayHours: number };
  week: { weekStart: string; weekEnd: string; workingDays: number; capacityHours: number; committedHours: number; loggedHours: number; utilization: number; openTasks: number; openIssues: number };
  daily: { date: string; weekday: string; isOff: boolean; offReason: string | null; capacity: number; dueItems: number; plannedHours: number; loggedHours: number }[];
  byProject: { project: string; items: number; hours: number }[];
  estVsActual: { estimated: number; actual: number };
  risks: { overdue: number; dueThisWeek: number; conflicts: { date: string; count: number; hours: number; items: string[] }[] };
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function WorkloadPage() {
  const [d, setD] = useState<Workload | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => setD(await api.get<Workload>("/api/workload")), []);
  useEffect(() => { load().catch((e) => toast.error(e.message)); }, [load]);

  if (!d) {
    return <div className="space-y-4"><PageHeader title="Workload & Capacity" /><div className="grid gap-3 sm:grid-cols-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}</div><Skeleton className="h-72" /></div>;
  }

  const utilTone = d.week.utilization > 100 ? "red" : d.week.utilization > 80 ? "amber" : "emerald";
  const maxBar = Math.max(d.settings.focusHoursPerDay, ...d.daily.map((x) => Math.max(x.plannedHours, x.loggedHours)), 1);

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader
        title="Workload & Capacity"
        subtitle={`Week of ${humanize(d.week.weekStart)} — capacity derived from your working calendar, holidays and approved leave`}
        actions={
          <>
            <Button size="sm" variant="outline" onClick={() => window.open("/api/reports?type=workload&format=xlsx")}><Download className="size-3.5" /> Report</Button>
            <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Settings2 className="size-3.5" /> Adjust schedule</Button>
          </>
        }
      />

      {/* KPI row */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center justify-between"><p className="text-[11px] text-zinc-400">Available capacity</p><Clock3 className="size-3.5 text-indigo-400" /></div>
          <p className="mt-1 font-mono text-2xl font-bold">{d.week.capacityHours}<span className="text-sm font-normal text-zinc-400">h</span></p>
          <p className="text-[10.5px] text-zinc-500">{d.week.workingDays} working day(s) × {d.settings.focusHoursPerDay}h focus</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between"><p className="text-[11px] text-zinc-400">Committed this week</p><Gauge className="size-3.5 text-violet-400" /></div>
          <p className="mt-1 font-mono text-2xl font-bold">{d.week.committedHours}<span className="text-sm font-normal text-zinc-400">h</span></p>
          <Progress className="mt-2" value={Math.min(100, d.week.utilization)} tone={utilTone} />
          <p className="mt-1 text-[10.5px] text-zinc-500">{d.week.utilization}% utilisation{d.week.utilization > 100 ? " — over capacity" : ""}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between"><p className="text-[11px] text-zinc-400">Logged (journal)</p><TrendingUp className="size-3.5 text-emerald-400" /></div>
          <p className="mt-1 font-mono text-2xl font-bold">{d.week.loggedHours}<span className="text-sm font-normal text-zinc-400">h</span></p>
          <p className="text-[10.5px] text-zinc-500">{d.week.openIssues} open issue(s), {d.week.openTasks} open task(s)</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between"><p className="text-[11px] text-zinc-400">Risk signals</p><AlertTriangle className={cn("size-3.5", d.risks.overdue ? "text-red-500" : "text-zinc-400")} /></div>
          <p className="mt-1 font-mono text-2xl font-bold text-red-500">{d.risks.overdue}</p>
          <p className="text-[10.5px] text-zinc-500">overdue · {d.risks.dueThisWeek} due this week · {d.risks.conflicts.length} conflict day(s)</p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* daily distribution */}
        <Card className="lg:col-span-2">
          <CardHeader title="Daily workload distribution" subtitle="Planned hours vs. logged hours against daily focus capacity" />
          <div className="space-y-2.5 p-4">
            {d.daily.map((day) => (
              <div key={day.date} className={cn("rounded-lg border p-2.5", day.isOff ? "border-dashed border-zinc-200 bg-zinc-50/60 dark:border-white/[0.07] dark:bg-white/[0.02]" : "border-zinc-200 dark:border-white/[0.07]")}>
                <div className="flex items-center gap-2">
                  <span className="w-9 font-mono text-[11px] font-semibold text-zinc-500">{day.weekday}</span>
                  <span className="font-mono text-[10.5px] text-zinc-400">{day.date.slice(5)}</span>
                  {day.isOff ? <Tag tone="zinc">{day.offReason}</Tag> : (
                    <>
                      {day.dueItems > 0 && <Tag tone={day.plannedHours > day.capacity ? "red" : "sky"}>{day.dueItems} due</Tag>}
                      {day.plannedHours > day.capacity && <Tag tone="red">over capacity</Tag>}
                    </>
                  )}
                  <span className="ml-auto font-mono text-[10.5px] text-zinc-400">
                    {day.plannedHours}h planned · {day.loggedHours}h logged · {day.capacity}h capacity
                  </span>
                </div>
                {!day.isOff && (
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="w-12 text-[9.5px] uppercase text-zinc-400">plan</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-white/[0.06]">
                        <div className={cn("h-full rounded-full", day.plannedHours > day.capacity ? "bg-red-500" : "bg-indigo-500")} style={{ width: `${Math.min(100, (day.plannedHours / maxBar) * 100)}%` }} />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-12 text-[9.5px] uppercase text-zinc-400">logged</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-white/[0.06]">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, (day.loggedHours / maxBar) * 100)}%` }} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Project-wise workload" subtitle="Remaining estimated hours on open work" />
            <div className="p-4">
              {d.byProject.length ? (
                <>
                  <Donut data={d.byProject.map((p) => ({ name: p.project, value: p.hours }))} />
                  <div className="mt-2 space-y-1.5">
                    {d.byProject.map((p) => (
                      <div key={p.project} className="flex items-center justify-between text-[11.5px]">
                        <span className="truncate text-zinc-600 dark:text-zinc-300">{p.project}</span>
                        <span className="font-mono text-zinc-400">{p.hours}h · {p.items} item(s)</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : <Empty title="No open work" hint="Nothing is currently assigned to a project." />}
            </div>
          </Card>

          <Card>
            <CardHeader title="Estimated vs actual" subtitle="All open items" />
            <div className="p-4">
              <MiniBars data={[{ k: "Estimated", v: d.estVsActual.estimated }, { k: "Actual", v: d.estVsActual.actual }]} x="k" y="v" />
              <p className="mt-1 text-center text-[11px] text-zinc-400">
                {d.estVsActual.estimated > 0
                  ? `${Math.round((d.estVsActual.actual / d.estVsActual.estimated) * 100)}% of estimate consumed`
                  : "Add estimates to your issues and tasks to track accuracy"}
              </p>
            </div>
          </Card>
        </div>
      </div>

      {/* conflicts */}
      <Card>
        <CardHeader title="Deadline conflict detection" subtitle={`Days where committed work exceeds ${d.settings.focusHoursPerDay}h focus capacity or stacks more than 2 items`} />
        {d.risks.conflicts.length ? (
          <div className="divide-y divide-zinc-100 dark:divide-white/[0.05]">
            {d.risks.conflicts.map((c) => (
              <div key={c.date} className="flex items-start gap-3 px-4 py-3">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-medium">{humanize(c.date)} — {c.count} item(s) totalling {c.hours}h</p>
                  <p className="mt-0.5 text-[11.5px] text-zinc-500 dark:text-zinc-400">{c.items.join(" · ")}</p>
                </div>
                <Tag tone="amber">{Math.round((c.hours / d.settings.focusHoursPerDay) * 100)}% of capacity</Tag>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-4"><Empty title="No deadline conflicts" icon={<CalendarX className="size-5" />} hint="Your scheduled work fits within daily capacity this week." /></div>
        )}
      </Card>

      <ScheduleModal open={open} settings={d.settings} onClose={() => setOpen(false)} onSaved={(w) => { setD(w); setOpen(false); }} />
    </div>
  );
}

function ScheduleModal({ open, settings, onClose, onSaved }: {
  open: boolean; settings: Workload["settings"]; onClose: () => void; onSaved: (w: Workload) => void;
}) {
  const [f, setF] = useState(settings);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setF(settings); }, [settings, open]);

  return (
    <Modal open={open} onClose={onClose} title="Adjust working hours & weekly schedule">
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Field label="Start hour"><Input type="number" min={0} max={23} value={f.workStartHour} onChange={(e) => setF({ ...f, workStartHour: Number(e.target.value) })} /></Field>
          <Field label="End hour"><Input type="number" min={1} max={24} value={f.workEndHour} onChange={(e) => setF({ ...f, workEndHour: Number(e.target.value) })} /></Field>
          <Field label="Focus hours/day" hint="Productive hours after meetings"><Input type="number" min={0} max={24} step="0.5" value={f.focusHoursPerDay} onChange={(e) => setF({ ...f, focusHoursPerDay: Number(e.target.value) })} /></Field>
        </div>
        <div>
          <p className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">Non-working days</p>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((name, i) => (
              <button key={name} type="button"
                onClick={() => setF({ ...f, weekendDays: f.weekendDays.includes(i) ? f.weekendDays.filter((x) => x !== i) : [...f.weekendDays, i] })}
                className={cn("rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition-colors",
                  f.weekendDays.includes(i) ? "border-indigo-500/50 bg-indigo-600/10 text-indigo-600 dark:text-indigo-300" : "border-zinc-200 text-zinc-500 dark:border-white/[0.1]")}>
                {name}
              </button>
            ))}
          </div>
        </div>
        <p className="rounded-lg bg-zinc-50 p-2.5 text-[11.5px] text-zinc-500 dark:bg-white/[0.04]">
          Gross day: {Math.max(0, f.workEndHour - f.workStartHour)}h · planning capacity uses <b>{f.focusHoursPerDay}h/day</b>.
          Holidays and approved leave are removed automatically.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="subtle" onClick={onClose}>Cancel</Button>
          <Button loading={busy} onClick={async () => {
            setBusy(true);
            try {
              const w = await api.patch<Workload>("/api/workload", f);
              toast.success("Schedule updated");
              onSaved(w);
            } catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); }
            finally { setBusy(false); }
          }}><Save className="size-3.5" /> Save schedule</Button>
        </div>
      </div>
    </Modal>
  );
}
