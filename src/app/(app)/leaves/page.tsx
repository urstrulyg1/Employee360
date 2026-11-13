"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { CalendarPlus, Download, Palmtree, Check, X, Ban, RefreshCcw, SlidersHorizontal } from "lucide-react";
import { api } from "@/lib/client";
import { Badge, Button, Card, CardHeader, Confirm, Empty, Field, IconButton, Input, Modal, PageHeader, Progress, Select, Skeleton, Textarea, Tag } from "@/components/ui";
import { humanize } from "@/lib/dates";
import { label } from "@/lib/domain";
import { cn } from "@/lib/utils";

type Balance = { typeId: string; key: string; name: string; color: string; opening: number; accrued: number; carryForward: number; adjustments: number; taken: number; pending: number; planned: number; remaining: number; unlimited: boolean };
type Entry = {
  id: string; status: string; startDate: string; endDate: string; halfDay: boolean; days: string;
  reason: string | null; notes: string | null; approver: string | null; planName: string | null; typeName: string; typeKey: string; typeColor: string; leaveTypeId: string; createdAt: string;
};

export default function LeavesPage() {
  return <Suspense fallback={<Skeleton className="h-96" />}><LeavesInner /></Suspense>;
}

function LeavesInner() {
  const params = useSearchParams();
  const year = new Date().getFullYear();
  const [balances, setBalances] = useState<Balance[] | null>(null);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [types, setTypes] = useState<{ id: string; name: string; key: string; color: string }[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [applyOpen, setApplyOpen] = useState(params.get("new") === "1");
  const [adjustFor, setAdjustFor] = useState<Balance | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [reservePending, setReservePending] = useState(false);

  const load = useCallback(async () => {
    const qs = statusFilter ? `?status=${statusFilter}` : "";
    const [b, e, t] = await Promise.all([
      api.get<{ data: Balance[]; reservePending: boolean }>(`/api/leaves/balances?year=${year}`),
      api.get<Entry[]>(`/api/leaves${qs}`),
      api.get<{ id: string; name: string; key: string; color: string }[]>("/api/leaves/types"),
    ]);
    setBalances(b.data); setReservePending(b.reservePending); setEntries(e); setTypes(t);
  }, [statusFilter]);

  useEffect(() => { load().catch((e) => toast.error(e.message)); }, [load]);

  const transition = async (id: string, status: string) => {
    try {
      await api.patch(`/api/leaves/${id}`, { status });
      toast.success(`Leave ${label(status.toLowerCase())}`);
      load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  const upcoming = useMemo(() => (entries ?? []).filter((e) => e.startDate >= new Date().toISOString().slice(0, 10) && !["cancelled", "rejected"].includes(e.status)), [entries]);

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader title="Leave Management" subtitle={`${year} balances, requests and policies — weekends & holidays excluded automatically`}
        actions={
          <>
            <Button size="sm" variant="outline" onClick={() => window.open(`/api/reports?type=leave-history&format=csv`)}><Download className="size-3.5" /> History CSV</Button>
            <Button size="sm" variant="outline" onClick={() => window.open(`/api/reports?type=leave-balance&format=xlsx&year=${year}`)}><Download className="size-3.5" /> Balance XLSX</Button>
            <Button size="sm" onClick={() => setApplyOpen(true)}><CalendarPlus className="size-3.5" /> Apply / Plan</Button>
          </>
        }
      />

      {/* Balance dashboard */}
      {!balances ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-36" />)}</div>
      ) : (
        <>
          <div className="flex items-center justify-between text-[11px] text-zinc-500">
            <span>Pending approvals {reservePending ? "are reserved from" : "do not reduce"} your available balance (company policy{reservePending ? "" : " default"}).</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {balances.map((b) => {
              const total = Math.max(0, b.opening + b.accrued + b.carryForward + b.adjustments);
              const usedPct = total > 0 ? Math.min(100, (b.taken / total) * 100) : (b.taken > 0 ? 100 : 0);
              return (
                <Card key={b.typeId} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="size-2.5 rounded-full" style={{ background: b.color }} />
                      <span className="text-[12.5px] font-semibold">{b.name}</span>
                    </div>
                    <IconButton className="size-7" title="Adjust balance" onClick={() => setAdjustFor(b)}><SlidersHorizontal className="size-3.5" /></IconButton>
                  </div>
                  <div className="mt-3 flex items-baseline gap-1.5">
                    <span className="font-mono text-2xl font-bold tracking-tight">{b.unlimited ? "∞" : b.remaining}</span>
                    <span className="text-[11px] text-zinc-400">{b.unlimited ? "no cap" : `of ${total} days left`}</span>
                  </div>
                  <Progress className="mt-2.5" value={usedPct} tone={b.remaining <= 2 && total > 0 ? "red" : usedPct > 60 ? "amber" : "emerald"} />
                  <div className="mt-3 grid grid-cols-3 gap-1 text-[10.5px] text-zinc-500">
                    <span>Opening <b className="font-mono text-zinc-700 dark:text-zinc-300">{b.opening}</b></span>
                    <span>CF <b className="font-mono text-zinc-700 dark:text-zinc-300">{b.carryForward}</b></span>
                    <span>Adj <b className="font-mono text-zinc-700 dark:text-zinc-300">{b.adjustments}</b></span>
                    <span>Taken <b className="font-mono text-emerald-600">{b.taken}</b></span>
                    <span>Pending <b className="font-mono text-amber-500">{b.pending}</b></span>
                    <span>Planned <b className="font-mono text-violet-500">{b.planned}</b></span>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {/* Entries */}
      <Card>
        <CardHeader
          title={`Leave entries (${entries?.length ?? 0})`}
          subtitle="Planned leaves stay visible but never consume balance"
          action={
            <Select className="h-8 w-40 text-xs" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              {["planned", "pending", "approved", "rejected", "cancelled"].map((s) => <option key={s} value={s}>{label(s)}</option>)}
            </Select>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-zinc-100 text-[11px] uppercase tracking-wider text-zinc-400 dark:border-white/[0.06]">
                {["Type", "Dates", "Days", "Reason", "Status", "Approver", "Plan", ""].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.05]">
            {!entries && [...Array(4)].map((_, i) => <tr key={i}><td colSpan={8} className="px-4 py-2"><Skeleton className="h-8" /></td></tr>)}
            {entries?.map((e) => (
              <tr key={e.id} className="hover:bg-zinc-50 dark:hover:bg-white/[0.02]">
                <td className="px-4 py-2.5">
                  <span className="inline-flex items-center gap-2">
                    <span className="size-2 rounded-full" style={{ background: e.typeColor }} />
                    <span className="font-medium">{e.typeName}</span>
                    {e.halfDay && <Tag>½</Tag>}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[11.5px] text-zinc-500">{humanize(e.startDate)} → {humanize(e.endDate)}</td>
                <td className="px-4 py-2.5 font-mono text-[12px]">{e.days}</td>
                <td className="max-w-[220px] truncate px-4 py-2.5 text-zinc-500">{e.reason ?? "—"}</td>
                <td className="px-4 py-2.5"><Badge value={e.status} /></td>
                <td className="px-4 py-2.5 text-xs text-zinc-500">{e.approver ?? "—"}</td>
                <td className="px-4 py-2.5 text-xs text-zinc-400">{e.planName ?? "—"}</td>
                <td className="px-4 py-2.5 text-right">
                  <div className="flex justify-end gap-1">
                    {e.status === "pending" && (
                      <>
                        <IconButton className="size-7 hover:!text-emerald-500" title="Approve" onClick={() => transition(e.id, "approved")}><Check className="size-3.5" /></IconButton>
                        <IconButton className="size-7 hover:!text-red-500" title="Reject" onClick={() => transition(e.id, "rejected")}><X className="size-3.5" /></IconButton>
                      </>
                    )}
                    {e.status === "planned" && (
                      <Button size="xs" variant="outline" onClick={() => transition(e.id, "pending")}>Submit</Button>
                    )}
                    {["pending", "approved", "planned"].includes(e.status) && (
                      <IconButton className="size-7" title="Cancel leave" onClick={() => setCancelId(e.id)}><Ban className="size-3.5 text-zinc-400" /></IconButton>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {entries?.length === 0 && <div className="p-6"><Empty title="No leave entries" icon={<Palmtree className="size-5" />} hint="Apply for leave or save a plan from the Leave Planner." action={<Button size="sm" onClick={() => setApplyOpen(true)}><CalendarPlus className="size-3.5" /> Apply</Button>} /></div>}
      </Card>

      {applyOpen && <ApplyLeaveModal types={types} onClose={() => setApplyOpen(false)} onSaved={() => { setApplyOpen(false); load(); }} />}
      {adjustFor && <AdjustModal balance={adjustFor} year={year} onClose={() => setAdjustFor(null)} onSaved={() => { setAdjustFor(null); load(); }} />}
      <Confirm open={!!cancelId} title="Cancel this leave?" message="Status becomes 'Cancelled' and any associated deduction is released (audit preserved)." danger
        onCancel={() => setCancelId(null)}
        onConfirm={async () => { try { await api.del(`/api/leaves/${cancelId}`); toast.success("Leave cancelled"); setCancelId(null); load(); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } }} />
    </div>
  );
}

function ApplyLeaveModal({ types, onClose, onSaved }: { types: { id: string; name: string; key: string }[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ leaveTypeId: types[0]?.id ?? "", startDate: "", endDate: "", halfDay: false, status: "pending", reason: "", approver: "Priya Nair", planName: "" });
  const [preview, setPreview] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const compute = useCallback(async () => {
    if (!f.startDate) { setPreview(null); return; }
    try {
      const r = await api.put<{ days: number }>("/api/leaves", { startDate: f.startDate, endDate: f.endDate || f.startDate, halfDay: f.halfDay });
      setPreview(r.days);
    } catch { setPreview(null); }
  }, [f.startDate, f.endDate, f.halfDay]);
  useEffect(() => { const t = setTimeout(compute, 200); return () => clearTimeout(t); }, [compute]);

  const save = async () => {
    setBusy(true);
    try {
      await api.post("/api/leaves", { ...f, endDate: f.endDate || f.startDate, planName: f.planName || null });
      toast.success(f.status === "planned" ? "Leave plan saved" : "Leave request submitted");
      onSaved();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); }
    finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title="Apply for leave">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Leave type">
            <Select value={f.leaveTypeId} onChange={(e) => setF({ ...f, leaveTypeId: e.target.value })}>
              {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
              <option value="planned">Planned (does not use balance)</option>
              <option value="pending">Pending approval</option>
            </Select>
          </Field>
          <Field label="Start date"><Input type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></Field>
          <Field label="End date"><Input type="date" value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} /></Field>
          <Field label="Approver">
            <Input value={f.approver} onChange={(e) => setF({ ...f, approver: e.target.value })} />
          </Field>
          <Field label="Half day">
            <div className="pt-2">
              <label className="flex items-center gap-2 text-[13px] text-zinc-600 dark:text-zinc-300">
                <input type="checkbox" className="size-4 accent-indigo-600" checked={f.halfDay} disabled={!!f.endDate && f.endDate !== f.startDate}
                  onChange={(e) => setF({ ...f, halfDay: e.target.checked })} />
                Half-day (0.5)
              </label>
            </div>
          </Field>
        </div>
        <Field label="Reason"><Textarea rows={2} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
        {f.status === "planned" && <Field label="Plan name (optional — links planner batches)"><Input value={f.planName} onChange={(e) => setF({ ...f, planName: e.target.value })} placeholder="e.g. Diwali Bridge 2026" /></Field>}

        <div className={cn("rounded-lg border px-3 py-2.5 text-[13px]",
          preview !== null && preview > 0 ? "border-emerald-500/25 bg-emerald-500/[0.07] text-emerald-600 dark:text-emerald-400" : "border-zinc-200 text-zinc-500 dark:border-white/[0.08]",
        )}>
          {preview === null ? "Select dates to compute duration…" :
            preview <= 0 ? "Selected range has no working days (weekends/holidays excluded)." :
            <span><b>{preview}</b> working day(s) — weekends & public/company holidays excluded.</span>}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="subtle" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={busy} disabled={!f.startDate || preview === null || preview <= 0}>
            <RefreshCcw className="hidden" />{f.status === "planned" ? "Save plan" : "Submit request"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function AdjustModal({ balance, year, onClose, onSaved }: { balance: Balance; year: number; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title={`Adjust ${balance.name} balance (${year})`}>
      <div className="space-y-4">
        <p className="text-xs text-zinc-500">Manual adjustments are stored in the audit log. Negative amounts reduce the entitlement (never the taken column).</p>
        <Field label="Amount (days, e.g. 1.5 or -1)"><Input type="number" step="0.5" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Reason"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Carry-forward correction post migration" /></Field>
        <div className="flex justify-end gap-2">
          <Button variant="subtle" onClick={onClose}>Cancel</Button>
          <Button loading={busy} disabled={!amount || !reason.trim()} onClick={async () => {
            setBusy(true);
            try {
              await api.post("/api/leaves/balances", { leaveTypeId: balance.typeId, year, amount: Number(amount), reason });
              toast.success("Adjustment recorded");
              onSaved();
            } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
            finally { setBusy(false); }
          }}>Record adjustment</Button>
        </div>
      </div>
    </Modal>
  );
}
