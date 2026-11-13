"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { Compass, Sparkles, CalendarCheck, Info } from "lucide-react";
import { api } from "@/lib/client";
import { Badge, Button, Card, CardHeader, Empty, Modal, PageHeader, Select, Skeleton, Tag } from "@/components/ui";
import { humanize } from "@/lib/dates";
import { cn } from "@/lib/utils";

type Plan = {
  id: string; anchor: string; holidayName: string; holidayCategory: string;
  rangeStart: string; rangeEnd: string; totalDaysOff: number; leaveDates: string[]; leaveDaysNeeded: number;
};
type Balance = { typeId: string; name: string; remaining: number; key: string };

export default function PlannerPage() {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [weekendDays, setWeekendDays] = useState<number[]>([0, 6]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [savePlan, setSavePlan] = useState<Plan | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const [r, b] = await Promise.all([
      api.get<{ plans: Plan[]; weekendDays: number[] }>(`/api/planner?year=${year}`),
      api.get<{ data: Balance[] }>("/api/leaves/balances"),
    ]);
    setPlans(r.plans); setWeekendDays(r.weekendDays); setBalances(b.data);
  }, [year]);
  useEffect(() => { load().catch((e) => toast.error(e.message)); }, [load]);

  const earned = balances.find((b) => b.key === "earned");
  const casual = balances.find((b) => b.key === "casual");

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader
        title="Annual Leave Planner"
        subtitle="Detected long-weekend bridges from your live working calendar — nothing is auto-submitted"
        actions={<Select className="h-8 w-28 text-xs" value={year} onChange={(e) => setYear(Number(e.target.value))}>{[year, year + 1].map((y) => <option key={y} value={y}>{y}</option>)}</Select>}
      />

      {/* balance impact strip */}
      <Card className="flex flex-wrap items-center gap-x-8 gap-y-2 p-4">
        <div>
          <p className="text-[11px] text-zinc-400">Earned Leave remaining</p>
          <p className="font-mono text-xl font-bold">{earned?.remaining ?? "—"}<span className="text-xs font-normal text-zinc-400">d</span></p>
        </div>
        <div>
          <p className="text-[11px] text-zinc-400">Casual Leave remaining</p>
          <p className="font-mono text-xl font-bold">{casual?.remaining ?? "—"}<span className="text-xs font-normal text-zinc-400">d</span></p>
        </div>
        <div className="flex items-start gap-2 rounded-lg border border-indigo-500/20 bg-indigo-500/[0.06] px-3 py-2 max-w-md">
          <Info className="mt-0.5 size-3.5 shrink-0 text-indigo-400" />
          <p className="text-[11.5px] leading-relaxed text-indigo-600 dark:text-indigo-300">
            Saving a plan creates <b>planned</b> leave entries only — visible everywhere but never deducted until approved by your manager.
          </p>
        </div>
      </Card>

      {!plans && <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-40" />)}</div>}

      {plans && plans.length === 0 && (
        <Empty title="No bridge opportunities ahead" icon={<Compass className="size-5" />} hint={"No holidays near weekends remain in " + year + ". Add company holidays to unlock more plans."} />
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {plans?.map((p) => (
          <Card key={p.id} className={cn("p-4 transition-all hover:-translate-y-0.5 hover:shadow-lg", savedIds.has(p.id) && "border-emerald-500/40 dark:border-emerald-400/30")}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[13.5px] font-semibold leading-tight">{p.holidayName}</p>
                <p className="text-[11px] text-zinc-400">{humanize(p.rangeStart)} → {humanize(p.rangeEnd)}</p>
              </div>
              <Badge value={p.holidayCategory === "leave" ? "approved" : p.holidayCategory} />
            </div>

            {/* efficiency meter */}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-zinc-50 p-2.5 text-center dark:bg-white/[0.04]">
                <p className="font-mono text-xl font-bold text-emerald-500">{p.totalDaysOff}</p>
                <p className="text-[10px] uppercase tracking-wider text-zinc-400">days off</p>
              </div>
              <div className="rounded-lg bg-zinc-50 p-2.5 text-center dark:bg-white/[0.04]">
                <p className="font-mono text-xl font-bold text-amber-500">{p.leaveDaysNeeded}</p>
                <p className="text-[10px] uppercase tracking-wider text-zinc-400">leave days</p>
              </div>
            </div>

            {p.leaveDates.length > 0 ? (
              <div className="mt-3">
                <p className="mb-1 text-[10.5px] font-medium uppercase tracking-wider text-zinc-400">Take off</p>
                <div className="flex flex-wrap gap-1">
                  {p.leaveDates.map((d) => (
                    <span key={d} className="rounded-md bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-amber-600 ring-1 ring-inset ring-amber-500/25 dark:text-amber-400">
                      {humanize(d)}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <p className="mt-3 text-[11.5px] text-zinc-400">No leave needed — pure weekend!</p>
            )}

            <Button
              size="sm" variant={savedIds.has(p.id) ? "subtle" : "outline"} className="mt-4 w-full"
              disabled={p.leaveDaysNeeded === 0 || savedIds.has(p.id)}
              onClick={() => setSavePlan(p)}
            >
              {savedIds.has(p.id) ? <><CalendarCheck className="size-3.5 text-emerald-500" /> Plan saved</> : <><Sparkles className="size-3.5" /> Save as plan</>}
            </Button>
          </Card>
        ))}
      </div>

      {/* save confirmation */}
      <Modal open={!!savePlan} onClose={() => setSavePlan(null)} title="Save leave plan">
        {savePlan && (
          <div className="space-y-3">
            <p className="text-[13px] text-zinc-600 dark:text-zinc-300">
              Creates <b>{savePlan.leaveDaysNeeded}</b> <i>planned</i> leave entr{savePlan.leaveDaysNeeded === 1 ? "y" : "ies"} around <b>{savePlan.holidayName}</b> covering{" "}
              <span className="font-mono text-xs">{savePlan.leaveDates.join(", ")}</span> — unlocking a <b>{savePlan.totalDaysOff}-day</b> break.
            </p>
            <p className="text-[11.5px] text-zinc-400">Type: Earned Leave · status: planned · nothing is submitted to an approver.</p>
            <div className="flex justify-end gap-2">
              <Button variant="subtle" onClick={() => setSavePlan(null)}>Cancel</Button>
              <Button onClick={async () => {
                try {
                  for (const d of savePlan.leaveDates) {
                    await api.post("/api/leaves", {
                      leaveTypeId: earned?.typeId ?? casual?.typeId,
                      startDate: d, endDate: d, status: "planned",
                      planName: `${savePlan.holidayName} Bridge ${year}`,
                      reason: `Planner: bridge around ${savePlan.holidayName}`,
                    });
                  }
                  toast.success("Plan saved as planned leaves");
                  setSavedIds((s) => new Set([...s, savePlan.id]));
                  setSavePlan(null);
                } catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); }
              }}>Save plan</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
