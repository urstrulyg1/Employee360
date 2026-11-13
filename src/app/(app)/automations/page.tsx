"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Zap, Play, History, BellRing, Clock3, CalendarClock, Target, ListTodo, FileText } from "lucide-react";
import { api } from "@/lib/client";
import { Button, Card, CardHeader, Empty, Input, PageHeader, Skeleton, Tag, Toggle } from "@/components/ui";
import { inTz } from "@/lib/dates";
import { cn } from "@/lib/utils";

type Rule = {
  id: string; ruleKey: string; name: string; description: string | null; enabled: boolean;
  leadDays: number; channel: string; lastRunAt: string | null; lastRunCount: number;
};
type Run = { id: string; ruleId: string; generated: number; detail: string | null; ranAt: string };

const ICONS: Record<string, React.ElementType> = {
  deadline_reminder: Clock3, overdue_issue: BellRing, weekly_report: FileText,
  leave_reminder: CalendarClock, goal_deadline: Target, pending_task: ListTodo,
};

export default function AutomationsPage() {
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await api.get<{ rules: Rule[]; runs: Run[] }>("/api/automations");
    setRules(r.rules); setRuns(r.runs);
  }, []);
  useEffect(() => { load().catch((e) => toast.error(e.message)); }, [load]);

  const update = async (rule: Rule, patch: Partial<Rule>) => {
    setRules((rs) => rs?.map((x) => x.id === rule.id ? { ...x, ...patch } : x) ?? null);
    try { await api.patch("/api/automations", { id: rule.id, ...patch }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); load(); }
  };

  const run = async (ruleId?: string) => {
    setBusy(ruleId ?? "all");
    try {
      const r = await api.post<{ ran: number; generated: number; details: { rule: string; generated: number }[] }>("/api/automations", ruleId ? { op: "runOne", ruleId } : { op: "run" });
      toast.success(r.generated > 0 ? `${r.generated} notification(s) generated from ${r.ran} rule(s)` : `Ran ${r.ran} rule(s) — nothing new to notify`);
      load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Run failed"); }
    finally { setBusy(null); }
  };

  const enabledCount = rules?.filter((r) => r.enabled).length ?? 0;

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader
        title="Automation Engine"
        subtitle="Configurable rules that scan your live data and raise de-duplicated notifications"
        actions={<Button size="sm" onClick={() => run()} loading={busy === "all"}><Play className="size-3.5" /> Run all enabled</Button>}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="flex items-center gap-3 p-4">
          <div className="grid size-9 place-items-center rounded-xl bg-indigo-600/10"><Zap className="size-4 text-indigo-400" /></div>
          <div><p className="font-mono text-xl font-bold">{enabledCount}/{rules?.length ?? 0}</p><p className="text-[11px] text-zinc-400">rules enabled</p></div>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <div className="grid size-9 place-items-center rounded-xl bg-emerald-600/10"><BellRing className="size-4 text-emerald-400" /></div>
          <div><p className="font-mono text-xl font-bold">{runs.reduce((a, r) => a + r.generated, 0)}</p><p className="text-[11px] text-zinc-400">notifications generated (last 25 runs)</p></div>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <div className="grid size-9 place-items-center rounded-xl bg-violet-600/10"><History className="size-4 text-violet-400" /></div>
          <div><p className="font-mono text-xl font-bold">{runs.length}</p><p className="text-[11px] text-zinc-400">executions recorded</p></div>
        </Card>
      </div>

      {!rules && <div className="space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-24" />)}</div>}

      <div className="grid gap-3 lg:grid-cols-2">
        {rules?.map((rule) => {
          const Icon = ICONS[rule.ruleKey] ?? Zap;
          return (
            <Card key={rule.id} className={cn("p-4 transition-opacity", !rule.enabled && "opacity-60")}>
              <div className="flex items-start gap-3">
                <div className={cn("grid size-9 shrink-0 place-items-center rounded-xl", rule.enabled ? "bg-indigo-600/10 text-indigo-400" : "bg-zinc-100 text-zinc-400 dark:bg-white/[0.05]")}>
                  <Icon className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[13px] font-semibold">{rule.name}</p>
                      <p className="mt-0.5 text-[11.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">{rule.description}</p>
                    </div>
                    <Toggle checked={rule.enabled} onChange={(v) => update(rule, { enabled: v })} />
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {rule.ruleKey !== "overdue_issue" && rule.ruleKey !== "pending_task" && rule.ruleKey !== "weekly_report" && (
                      <label className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                        Lead time
                        <Input type="number" min={0} max={90} value={rule.leadDays} disabled={!rule.enabled}
                          onChange={(e) => update(rule, { leadDays: Number(e.target.value) })}
                          className="h-7 w-16 text-xs" />
                        days
                      </label>
                    )}
                    <Tag tone={rule.enabled ? "emerald" : "zinc"}>{rule.enabled ? "active" : "paused"}</Tag>
                    {rule.lastRunAt && <span className="text-[10.5px] text-zinc-400">last run {inTz(rule.lastRunAt, "Asia/Kolkata")} · {rule.lastRunCount} new</span>}
                    <Button size="xs" variant="outline" className="ml-auto" disabled={!rule.enabled} loading={busy === rule.id} onClick={() => run(rule.id)}>
                      <Play className="size-3" /> Run now
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader title="Execution history" subtitle="Each run records how many candidates were evaluated and how many new notifications were raised" />
        {runs.length ? (
          <div className="max-h-80 divide-y divide-zinc-100 overflow-y-auto dark:divide-white/[0.05]">
            {runs.map((r) => {
              const rule = rules?.find((x) => x.id === r.ruleId);
              return (
                <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                  <History className="size-3.5 shrink-0 text-zinc-400" />
                  <span className="min-w-0 flex-1 truncate text-[12.5px]">{rule?.name ?? "Rule"}</span>
                  <span className="text-[11px] text-zinc-400">{r.detail}</span>
                  <Tag tone={r.generated > 0 ? "emerald" : "zinc"}>{r.generated} new</Tag>
                  <span className="w-28 text-right text-[10.5px] text-zinc-400">{inTz(r.ranAt, "Asia/Kolkata")}</span>
                </div>
              );
            })}
          </div>
        ) : <div className="p-4"><Empty title="No runs yet" icon={<Play className="size-5" />} hint="Use “Run all enabled” to evaluate your rules now." /></div>}
      </Card>

      <p className="text-[11px] leading-relaxed text-zinc-400">
        Notifications are de-duplicated by a unique key per rule + record + date, so repeated executions never create duplicates.
        Every run is written to <code className="font-mono">automation_runs</code> and the audit log.
      </p>
    </div>
  );
}
