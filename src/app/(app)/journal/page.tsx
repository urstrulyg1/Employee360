"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { BookOpenText, Download, Save, CalendarDays, Trash2, TrendingUp, Clock3, Users } from "lucide-react";
import { api } from "@/lib/client";
import { Badge, Button, Card, CardHeader, Empty, Field, Input, PageHeader, Skeleton, Tabs, Textarea, Confirm, Tag } from "@/components/ui";
import { humanize, todayYMD } from "@/lib/dates";
import { cn } from "@/lib/utils";

type Journal = {
  id: string; journalDate: string; summary: string | null; tasksCompleted: string[] | null;
  issuesWorkedOn: string[] | null; challenges: string | null; solutions: string | null;
  meetings: number; learnings: string | null; pendingWork: string | null;
  nextDayPriorities: string | null; timeSpentHours: string;
};
type Summary = { weekly: { week: string; entries: number; hours: string; meetings: number }[]; monthly: { month: string; entries: number; hours: string; meetings: number }[] };

const TEMPLATE = `What I shipped today:\n- \n\nWhere I got stuck:\n- \n\nTomorrow's focus:\n- `;

export default function JournalPage() {
  return <Suspense fallback={<Skeleton className="h-96" />}><JournalInner /></Suspense>;
}

function JournalInner() {
  const params = useSearchParams();
  const [entries, setEntries] = useState<Journal[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [tab, setTab] = useState<"entries" | "weekly" | "monthly">("entries");
  const [search, setSearch] = useState("");
  const [selectedDate, setSelectedDate] = useState<string>(params.get("date") ?? todayYMD());
  const [form, setForm] = useState<Partial<Journal>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [delConfirm, setDelConfirm] = useState(false);

  const load = useCallback(async () => {
    const q = search ? `?q=${encodeURIComponent(search)}` : "";
    setEntries(await api.get<Journal[]>(`/api/journals${q}`));
  }, [search]);
  const loadSummary = useCallback(async () => setSummary(await api.get<Summary>("/api/journals?mode=summary")), []);
  useEffect(() => { const t = setTimeout(() => load().catch((e) => toast.error(e.message)), 200); return () => clearTimeout(t); }, [load]);
  useEffect(() => { loadSummary().catch(() => {}); }, [loadSummary]);

  const selected = useMemo(() => entries?.find((e) => e.journalDate === selectedDate) ?? null, [entries, selectedDate]);

  useEffect(() => {
    setDirty(false);
    setForm(selected ? { ...selected } : { journalDate: selectedDate, summary: "", tasksCompleted: [], issuesWorkedOn: [], meetings: 0, timeSpentHours: "" });
  }, [selectedDate, selected]);

  const save = async () => {
    setSaving(true);
    try {
      await api.post("/api/journals", { ...form, journalDate: selectedDate });
      toast.success("Journal saved to PostgreSQL");
      setDirty(false);
      load(); loadSummary();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); }
    finally { setSaving(false); }
  };

  const totalHours = useMemo(() => entries?.reduce((s, e) => s + Number(e.timeSpentHours || 0), 0) ?? 0, [entries]);

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader title="Daily Work Journal" subtitle="Chronological log of what you built, unblocked and learned"
        actions={
          <>
            <Button size="sm" variant="outline" onClick={() => window.open("/api/reports?type=weekly-work&format=csv")}><Download className="size-3.5" /> Weekly</Button>
            <Button size="sm" variant="outline" onClick={() => window.open(`/api/reports?type=monthly-work&format=csv&month=${todayYMD().slice(0, 7)}`)}><Download className="size-3.5" /> Monthly</Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        {/* Left: list */}
        <Card className="h-fit lg:sticky lg:top-[4.5rem]">
          <CardHeader title={`Entries (${entries?.length ?? 0})`} subtitle={`${totalHours.toFixed(1)}h logged`}
            action={<Button size="xs" variant="ghost" onClick={() => setSelectedDate(todayYMD())}>Today</Button>} />
          <div className="px-3 py-2 border-b border-zinc-100 dark:border-white/[0.06]">
            <Input className="h-8 text-xs" placeholder="Search summaries…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="max-h-[560px] overflow-y-auto p-1.5">
            {!entries && <div className="space-y-2 p-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16" />)}</div>}
            {entries?.length === 0 && <p className="px-3 py-8 text-center text-xs text-zinc-400">No entries yet — write today's journal on the right.</p>}
            {entries?.map((e) => (
              <button
                key={e.id}
                onClick={() => setSelectedDate(e.journalDate)}
                className={cn(
                  "w-full rounded-lg px-3 py-2.5 text-left transition-colors",
                  selectedDate === e.journalDate ? "bg-indigo-600/[0.08] dark:bg-indigo-400/[0.1]" : "hover:bg-zinc-50 dark:hover:bg-white/[0.04]",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] font-medium text-zinc-500 dark:text-zinc-400">{humanize(e.journalDate)}</span>
                  <span className="font-mono text-[10.5px] text-zinc-400">{e.timeSpentHours}h · {e.meetings}m</span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-zinc-600 dark:text-zinc-400">{e.summary}</p>
                {(e.issuesWorkedOn?.length ?? 0) > 0 && (
                  <div className="mt-1 flex gap-1">{e.issuesWorkedOn!.slice(0, 3).map((k) => <span key={k} className="rounded bg-zinc-100 px-1 text-[9.5px] font-mono text-zinc-500 dark:bg-white/[0.06]">{k}</span>)}</div>
                )}
              </button>
            ))}
          </div>
        </Card>

        {/* Right: editor + summaries */}
        <div className="space-y-4">
          <Tabs
            tabs={[{ key: "entries", label: "Entry editor" }, { key: "weekly", label: "Weekly summary" }, { key: "monthly", label: "Monthly summary" }]}
            active={tab} onChange={(v) => setTab(v as typeof tab)}
          />

          {tab === "entries" && (
            <Card>
              <CardHeader
                title={selected ? `Entry — ${humanize(selectedDate)}` : `New entry — ${humanize(selectedDate)}`}
                subtitle="Saved per day; re-editing a date upserts the same record"
                action={
                  <div className="flex items-center gap-1.5">
                    <Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="h-8 w-36 text-xs" />
                    <Button size="xs" variant="ghost" onClick={() => setForm((f) => ({ ...f, summary: (f.summary ?? "") + (f.summary ? "\n\n" : "") + TEMPLATE }))}>Insert template</Button>
                    {selected && <Button size="xs" variant="ghost" onClick={() => setDelConfirm(true)}><Trash2 className="size-3.5 text-red-500" /></Button>}
                  </div>
                }
              />
              <div className="space-y-4 p-4">
                <Field label="Work summary">
                  <Textarea rows={4} value={form.summary ?? ""} onChange={(e) => { setForm((f) => ({ ...f, summary: e.target.value })); setDirty(true); }} placeholder="What did you work on today?" />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Tasks completed (one per line)">
                    <Textarea rows={2} value={(form.tasksCompleted ?? []).join("\n")} onChange={(e) => { setForm((f) => ({ ...f, tasksCompleted: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })); setDirty(true); }} />
                  </Field>
                  <Field label="Issues worked on (keys, one per line)" hint="e.g. ISS-1018 — links this entry to your tracker">
                    <Textarea rows={2} value={(form.issuesWorkedOn ?? []).join("\n")} onChange={(e) => { setForm((f) => ({ ...f, issuesWorkedOn: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })); setDirty(true); }} />
                  </Field>
                  <Field label="Technical challenges">
                    <Textarea rows={2} value={form.challenges ?? ""} onChange={(e) => { setForm((f) => ({ ...f, challenges: e.target.value })); setDirty(true); }} />
                  </Field>
                  <Field label="Solutions implemented">
                    <Textarea rows={2} value={form.solutions ?? ""} onChange={(e) => { setForm((f) => ({ ...f, solutions: e.target.value })); setDirty(true); }} />
                  </Field>
                  <Field label="Learnings">
                    <Textarea rows={2} value={form.learnings ?? ""} onChange={(e) => { setForm((f) => ({ ...f, learnings: e.target.value })); setDirty(true); }} />
                  </Field>
                  <Field label="Pending work">
                    <Textarea rows={2} value={form.pendingWork ?? ""} onChange={(e) => { setForm((f) => ({ ...f, pendingWork: e.target.value })); setDirty(true); }} />
                  </Field>
                  <Field label="Next-day priorities" className="sm:col-span-2">
                    <Input value={form.nextDayPriorities ?? ""} onChange={(e) => { setForm((f) => ({ ...f, nextDayPriorities: e.target.value })); setDirty(true); }} />
                  </Field>
                  <Field label="Meetings attended">
                    <Input type="number" min={0} value={form.meetings ?? 0} onChange={(e) => { setForm((f) => ({ ...f, meetings: Number(e.target.value) })); setDirty(true); }} />
                  </Field>
                  <Field label="Time spent (hours)">
                    <Input type="number" min={0} step="0.5" value={form.timeSpentHours ?? ""} onChange={(e) => { setForm((f) => ({ ...f, timeSpentHours: e.target.value })); setDirty(true); }} />
                  </Field>
                </div>
                <div className="flex items-center justify-end gap-2 border-t border-zinc-100 pt-4 dark:border-white/[0.06]">
                  {dirty && <span className="text-[11px] text-amber-500">Unsaved changes</span>}
                  <Button onClick={save} loading={saving}><Save className="size-3.5" /> Save entry</Button>
                </div>
              </div>
            </Card>
          )}

          {tab !== "entries" && (
            <Card>
              <CardHeader
                title={tab === "weekly" ? "Weekly rollups" : "Monthly rollups"}
                subtitle="Aggregated from real journal records"
              />
              <div className="divide-y divide-zinc-100 dark:divide-white/[0.05]">
                {(tab === "weekly" ? summary?.weekly : summary?.monthly)?.map((r) => (
                  <div key={(r as { week?: string; month?: string }).week ?? (r as { month: string }).month} className="flex items-center gap-4 px-4 py-3">
                    <div className="w-24 font-mono text-[12px] text-zinc-500">{(r as { week?: string }).week ?? (r as { month: string }).month}</div>
                    <div className="flex items-center gap-1.5 text-[12.5px]"><BookOpenText className="size-3.5 text-indigo-400" />{r.entries} entries</div>
                    <div className="flex items-center gap-1.5 text-[12.5px]"><Clock3 className="size-3.5 text-emerald-400" />{r.hours}h</div>
                    <div className="flex items-center gap-1.5 text-[12.5px]"><Users className="size-3.5 text-amber-400" />{r.meetings} meetings</div>
                  </div>
                ))}
                {!summary && <Skeleton className="m-4 h-40" />}
                {summary && (tab === "weekly" ? summary.weekly : summary.monthly)?.length === 0 && <p className="px-4 py-8 text-center text-xs text-zinc-400">No journal data yet.</p>}
              </div>
            </Card>
          )}
        </div>
      </div>

      <Confirm open={delConfirm} title="Delete journal entry?" message={`Entry for ${humanize(selectedDate)} will be permanently removed.`} danger onCancel={() => setDelConfirm(false)}
        onConfirm={async () => {
          if (!selected) return;
          try { await api.del("/api/journals", { id: selected.id }); toast.success("Entry deleted"); setDelConfirm(false); load(); loadSummary(); }
          catch (e) { toast.error(e instanceof Error ? e.message : "Delete failed"); }
        }} />
    </div>
  );
}
