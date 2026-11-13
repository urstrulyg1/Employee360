"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { PartyPopper, Plus, Upload, Pencil, Trash2, Download, CalendarX } from "lucide-react";
import { api } from "@/lib/client";
import { Badge, Button, Card, CardHeader, Confirm, Empty, Field, IconButton, Input, Modal, PageHeader, Select, Textarea, Skeleton } from "@/components/ui";
import { HOLIDAY_CATEGORIES, label } from "@/lib/domain";
import { humanize } from "@/lib/dates";
import { cn } from "@/lib/utils";

type Holiday = { id: string; name: string; holidayDate: string; year: number; category: string; region: string | null; source: string };
type Resp = { year: number; availableYears: number[]; holidays: Holiday[]; stats: { total: number; byCategory: Record<string, number>; weekendHits: number } };

export default function HolidaysPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState<Resp | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<Holiday | null>(null);
  const [delId, setDelId] = useState<string | null>(null);
  const [catFilter, setCatFilter] = useState("");

  const load = useCallback(async () => setData(await api.get<Resp>(`/api/holidays?year=${year}`)), [year]);
  useEffect(() => { load().catch((e) => toast.error(e.message)); }, [load]);

  const grouped = useMemo(() => {
    const map = new Map<string, Holiday[]>();
    for (const h of (data?.holidays ?? []).filter((h) => !catFilter || h.category === catFilter)) {
      const month = h.holidayDate.slice(0, 7);
      map.set(month, [...(map.get(month) ?? []), h]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [data, catFilter]);

  const years = useMemo(() => {
    const set = new Set([year - 1, year, year + 1, ...(data?.availableYears ?? [])]);
    return [...set].sort((a, b) => b - a);
  }, [data, year]);

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader title="Holiday Calendar" subtitle="India (Karnataka) — gazetted dates verified; company entries manual; import/export supported"
        actions={
          <>
            <Button size="sm" variant="outline" onClick={() => window.open(`/api/reports?type=holidays&format=xlsx&year=${year}`)}><Download className="size-3.5" /> XLSX</Button>
            <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}><Upload className="size-3.5" /> Import CSV</Button>
            <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="size-3.5" /> Add holiday</Button>
          </>
        }
      />

      {/* stats header */}
      {data ? (
        <div className="grid gap-3 sm:grid-cols-4">
          <Card className="p-4">
            <p className="text-[11px] text-zinc-400">Total holidays ({data.year})</p>
            <p className="mt-1 font-mono text-2xl font-bold">{data.stats.total}</p>
          </Card>
          <Card className="p-4">
            <p className="text-[11px] text-zinc-400">Falling on weekends</p>
            <p className="mt-1 font-mono text-2xl font-bold text-amber-500">{data.stats.weekendHits}</p>
            <p className="text-[10.5px] text-zinc-500">worth compensating in policy</p>
          </Card>
          <Card className="p-4 sm:col-span-2">
            <p className="text-[11px] text-zinc-400 mb-2">By category</p>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(data.stats.byCategory).map(([cat, count]) => (
                <button key={cat} onClick={() => setCatFilter(catFilter === cat ? "" : cat)}
                  className={cn("transition-transform hover:scale-105", catFilter && catFilter !== cat && "opacity-40")}>
                  <Badge value={cat} /><span className="ml-1 font-mono text-[11px] text-zinc-400">{count}</span>
                </button>
              ))}
            </div>
          </Card>
        </div>
      ) : <div className="grid gap-3 sm:grid-cols-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}</div>}

      <div className="flex items-center gap-2">
        <CalendarX className="size-4 text-zinc-400" />
        <Select className="h-8 w-28 text-xs" value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </Select>
        <span className="text-[11px] text-zinc-400">Multiple years supported · duplicate names+dates+regions are rejected on import</span>
      </div>

      {/* month groups */}
      {!data ? <Skeleton className="h-[400px]" /> : grouped.length === 0 ? (
        <Empty title="No holidays" hint="Add company holidays manually or import a CSV." action={<Button size="sm" onClick={() => setImportOpen(true)}><Upload className="size-3.5" /> Import CSV</Button>} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {grouped.map(([month, items]) => (
            <Card key={month}>
              <CardHeader title={new Date(month + "-01T00:00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" })} subtitle={`${items.length} holiday(s)`} />
              <div className="divide-y divide-zinc-100 dark:divide-white/[0.05]">
                {items.map((h) => {
                  const isWknd = [0, 6].includes(new Date(h.holidayDate + "T00:00:00Z").getUTCDay());
                  return (
                    <div key={h.id} className="group flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-50 dark:hover:bg-white/[0.02]">
                      <div className={cn("w-10 shrink-0 text-center", isWknd && "opacity-60")}>
                        <p className="font-mono text-[15px] font-semibold leading-none">{h.holidayDate.slice(8, 10)}</p>
                        <p className="text-[9.5px] uppercase text-zinc-400">{new Date(h.holidayDate + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short" })}</p>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium">{h.name} {isWknd && <span className="ml-1 text-[10px] text-amber-500">weekend</span>}</p>
                        <p className="text-[11px] text-zinc-400">{h.region} · {h.source}</p>
                      </div>
                      <Badge value={h.category} />
                      <div className="flex opacity-0 transition-opacity group-hover:opacity-100">
                        <IconButton className="size-7" onClick={() => setEditing(h)}><Pencil className="size-3.5" /></IconButton>
                        <IconButton className="size-7" onClick={() => setDelId(h.id)}><Trash2 className="size-3.5 text-red-500" /></IconButton>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      )}

      <HolidayForm open={addOpen || !!editing} holiday={editing} onClose={() => { setAddOpen(false); setEditing(null); }} onSaved={() => { setAddOpen(false); setEditing(null); load(); }} />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onSaved={() => { setImportOpen(false); load(); }} />
      <Confirm open={!!delId} title="Remove holiday?" message="This holiday will be deleted and excluded from leave calculations going forward." danger
        onCancel={() => setDelId(null)}
        onConfirm={async () => { try { await api.del(`/api/holidays/${delId}`); toast.success("Holiday removed"); setDelId(null); load(); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } }} />
    </div>
  );
}

function HolidayForm({ open, holiday, onClose, onSaved }: { open: boolean; holiday: Holiday | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: holiday?.name ?? "", holidayDate: holiday?.holidayDate ?? "", category: holiday?.category ?? "company", region: holiday?.region ?? "Company" });
  const [busy, setBusy] = useState(false);
  useEffect(() => { setF({ name: holiday?.name ?? "", holidayDate: holiday?.holidayDate ?? "", category: holiday?.category ?? "company", region: holiday?.region ?? "Company" }); }, [holiday]);
  return (
    <Modal open={open} onClose={onClose} title={holiday ? "Edit holiday" : "Add holiday"}>
      <div className="space-y-4">
        <Field label="Name"><Input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Founder's Day" /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Date"><Input type="date" value={f.holidayDate} onChange={(e) => setF({ ...f, holidayDate: e.target.value })} /></Field>
          <Field label="Category">
            <Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
              {HOLIDAY_CATEGORIES.map((c) => <option key={c} value={c}>{label(c)}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Region / scope"><Input value={f.region} onChange={(e) => setF({ ...f, region: e.target.value })} placeholder="Company / Karnataka / India" /></Field>
        <div className="flex justify-end gap-2">
          <Button variant="subtle" onClick={onClose}>Cancel</Button>
          <Button loading={busy} disabled={!f.name.trim() || !f.holidayDate} onClick={async () => {
            setBusy(true);
            try {
              if (holiday) await api.patch(`/api/holidays/${holiday.id}`, f);
              else await api.post("/api/holidays", { ...f, date: f.holidayDate });
              toast.success("Saved"); onSaved();
            } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
            finally { setBusy(false); }
          }}>{holiday ? "Save" : "Add holiday"}</Button>
        </div>
      </div>
    </Modal>
  );
}

function ImportModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const parse = () => {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    const rows = [];
    for (const line of lines) {
      const [name, date, category, region] = line.split(",").map((x) => x.trim());
      if (name && /^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) rows.push({ name, date, category: category || "company", region });
    }
    return rows;
  };

  const run = async () => {
    const rows = parse();
    if (!rows.length) { toast.error("No valid rows. Format: name, YYYY-MM-DD, category, region"); return; }
    setBusy(true);
    try {
      const r = await api.post<{ added: number; duplicates: { name: string; date: string }[] }>("/api/holidays", { rows });
      setResult(`${r.added} added · ${r.duplicates.length} duplicate(s) skipped${r.duplicates.length ? ": " + r.duplicates.map((d) => `${d.name} (${d.date})`).join(", ") : ""}`);
      setText("");
      onSaved();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Import failed"); }
    finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Import holidays (CSV)" wide>
      <div className="space-y-3">
        <p className="text-xs text-zinc-500">
          One row per line: <code className="font-mono text-[11px] text-zinc-700 dark:text-zinc-300">Name, YYYY-MM-DD, category, region</code>.
          Categories: national, regional, company, optional, restricted. Duplicates (same name + date + region) are rejected safely.
        </p>
        <Textarea rows={8} className="font-mono text-xs" placeholder={"Founder Day, 2026-06-15, company, Company\nOnam, 2026-08-27, regional, Karnataka"} value={text} onChange={(e) => setText(e.target.value)} />
        {result && <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/[0.07] px-3 py-2 text-xs text-emerald-600 dark:text-emerald-400">{result}</div>}
        <div className="flex justify-end gap-2">
          <Button variant="subtle" onClick={onClose}>Close</Button>
          <Button onClick={run} loading={busy} disabled={!text.trim()}><Upload className="size-3.5" /> Import {text.split("\n").filter(Boolean).length} row(s)</Button>
        </div>
      </div>
    </Modal>
  );
}
