"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  addDays, addMonths, endOfMonth, endOfWeek, format, isSameMonth, isSameDay, isWeekend as isWke,
  startOfMonth, startOfWeek, subMonths,
} from "date-fns";
import { CalendarPlus, ChevronLeft, ChevronRight, Download, GripVertical, Pencil, Trash2 } from "lucide-react";
import { api } from "@/lib/client";
import { Badge, Button, Card, CardHeader, Empty, Field, IconButton, Input, Modal, PageHeader, Select, Skeleton, Textarea } from "@/components/ui";
import { toneClasses, toneOf, label } from "@/lib/domain";
import { humanize, todayYMD } from "@/lib/dates";
import { cn } from "@/lib/utils";

type CalEvent = {
  id: string; title: string; category: string; date: string; endDate?: string | null;
  startTime?: string | null; allDay: boolean; source: "synced" | "manual"; sourceRef?: string | null;
  meta?: Record<string, string | null>;
};

const CATEGORIES = ["issue", "task", "leave", "holiday", "milestone", "meeting", "reminder"] as const;

export default function CalendarPage() {
  const [cursor, setCursor] = useState(() => new Date());
  const [view, setView] = useState<"month" | "week" | "agenda">("month");
  const [events, setEvents] = useState<CalEvent[] | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [dayOpen, setDayOpen] = useState<string | null>(null);
  const [newFor, setNewFor] = useState<string | null>(null);
  const [editing, setEditing] = useState<CalEvent | null>(null);
  const [dragEvt, setDragEvt] = useState<CalEvent | null>(null);
  const [overDay, setOverDay] = useState<string | null>(null);

  const range = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(addMonths(cursor, 1)), { weekStartsOn: 1 });
    return { from: format(start, "yyyy-MM-dd"), to: format(end, "yyyy-MM-dd") };
  }, [cursor]);

  const load = useCallback(async () => {
    const r = await api.get<{ events: CalEvent[] }>(`/api/calendar?from=${range.from}&to=${range.to}`);
    setEvents(r.events);
  }, [range]);
  useEffect(() => { setEvents(null); load().catch((e) => toast.error(e.message)); }, [load]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    for (const ev of events ?? []) {
      if (hidden.has(ev.category)) continue;
      const start = ev.date;
      const end = ev.endDate ?? ev.date;
      let d = new Date(start + "T00:00:00");
      const e = new Date(end + "T00:00:00");
      let guard = 0;
      while (d <= e && guard < 31) {
        const key = format(d, "yyyy-MM-dd");
        map.set(key, [...(map.get(key) ?? []), ev]);
        d = addDays(d, 1);
        guard++;
      }
    }
    return map;
  }, [events, hidden]);

  const days = useMemo(() => {
    const out: Date[] = [];
    let d = new Date(range.from + "T00:00:00");
    const end = new Date(range.to + "T00:00:00");
    while (d <= end) { out.push(d); d = addDays(d, 1); }
    return out;
  }, [range]);

  const weekDays = useMemo(() => {
    const s = startOfWeek(cursor, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => addDays(s, i));
  }, [cursor]);

  const agenda = useMemo(() => {
    const from = new Date();
    return [...byDay.entries()]
      .filter(([date]) => date >= format(from, "yyyy-MM-dd"))
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(0, 14);
  }, [byDay]);

  const dropTo = async (date: string) => {
    setOverDay(null);
    if (!dragEvt) return;
    if (dragEvt.source !== "manual") { toast("Synced events follow their source record — edit it in its module."); setDragEvt(null); return; }
    if (dragEvt.date === date) { setDragEvt(null); return; }
    try {
      await api.patch("/api/calendar", { id: dragEvt.id, eventDate: date, endDate: dragEvt.endDate ? date : dragEvt.endDate });
      toast.success("Event rescheduled");
      load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Reschedule failed"); }
    setDragEvt(null);
  };

  const exportIcs = () => {
    if (!events?.length) { toast.error("Nothing to export"); return; }
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Employee360//EN"];
    for (const ev of events) {
      lines.push("BEGIN:VEVENT");
      lines.push(`UID:${ev.id}@employee360`);
      lines.push(`DTSTART;VALUE=DATE:${ev.date.replaceAll("-", "")}`);
      if (ev.endDate) lines.push(`DTEND;VALUE=DATE:${addDays(new Date(ev.endDate + "T00:00:00"), 1).toISOString().slice(0, 10).replaceAll("-", "")}`);
      lines.push(`SUMMARY:${ev.title.replaceAll(",", "\\,")}`);
      lines.push(`CATEGORIES:${ev.category.toUpperCase()}`);
      lines.push("END:VEVENT");
    }
    lines.push("END:VCALENDAR");
    const blob = new Blob([lines.join("\r\n")], { type: "text/calendar" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `employee360-calendar-${todayYMD()}.ics`;
    a.click();
    toast.success("ICS exported");
  };

  const exportCsv = () => {
    if (!events?.length) { toast.error("Nothing to export"); return; }
    const head = "date,end,title,category,startTime,source";
    const rows = events.map((e) => [e.date, e.endDate ?? "", `"${e.title.replaceAll('"', '""')}"`, e.category, e.startTime ?? "", e.source].join(","));
    const blob = new Blob([head + "\n" + rows.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `employee360-calendar-${todayYMD()}.csv`;
    a.click();
  };

  const CatPill = ({ cat }: { cat: string }) => (
    <button
      onClick={() => setHidden((h) => { const n = new Set(h); n.has(cat) ? n.delete(cat) : n.add(cat); return n; })}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all",
        hidden.has(cat)
          ? "border-zinc-200 text-zinc-400 opacity-50 dark:border-white/[0.08]"
          : "border-zinc-200 text-zinc-600 hover:border-zinc-300 dark:border-white/[0.08] dark:text-zinc-300",
      )}
    >
      <span className={cn("size-2 rounded-full", toneClasses[toneOf(cat)].dot)} />{label(cat)}
    </button>
  );

  const EventChip = ({ ev, compact }: { ev: CalEvent; compact?: boolean }) => (
    <div
      draggable={ev.source === "manual"}
      onDragStart={() => setDragEvt(ev)}
      onDragEnd={() => setDragEvt(null)}
      onClick={(e) => { e.stopPropagation(); ev.sourceRef ? window.location.href = ev.sourceRef : setEditing(ev); }}
      title={ev.title}
      className={cn(
        "group flex cursor-pointer items-center gap-1 truncate rounded px-1.5 py-0.5 text-[10.5px] font-medium ring-1 ring-inset transition-transform hover:scale-[1.02]",
        toneClasses[toneOf(ev.category)].chip,
        dragEvt?.id === ev.id && "dragging-card",
      )}
    >
      {ev.source === "manual" && <GripVertical className="size-2.5 opacity-40" />}
      {!compact && ev.startTime && <span className="font-mono opacity-70">{ev.startTime}</span>}
      <span className="truncate">{ev.title}</span>
    </div>
  );

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader
        title="Work Calendar"
        subtitle="Issues, tasks, leaves, holidays, milestones, meetings and reminders — one surface"
        actions={
          <>
            <Button size="sm" variant="outline" onClick={exportCsv}><Download className="size-3.5" /> CSV</Button>
            <Button size="sm" variant="outline" onClick={exportIcs}><Download className="size-3.5" /> ICS</Button>
            <Button size="sm" onClick={() => setNewFor(format(cursor, "yyyy-MM-dd"))}><CalendarPlus className="size-3.5" /> New event</Button>
          </>
        }
      />

      <Card className="flex flex-wrap items-center gap-2 p-2.5">
        <div className="flex items-center gap-1">
          <IconButton onClick={() => setCursor((c) => view === "month" ? subMonths(c, 1) : addDays(c, -7))}><ChevronLeft className="size-4" /></IconButton>
          <span className="w-32 text-center text-[13px] font-semibold">{format(cursor, view === "month" ? "MMMM yyyy" : "d MMM yyyy")}</span>
          <IconButton onClick={() => setCursor((c) => view === "month" ? addMonths(c, 1) : addDays(c, 7))}><ChevronRight className="size-4" /></IconButton>
          <Button size="sm" variant="ghost" onClick={() => setCursor(new Date())}>Today</Button>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {CATEGORIES.map((c) => <CatPill key={c} cat={c} />)}
          <div className="mx-1 h-4 w-px bg-zinc-200 dark:bg-white/[0.08]" />
          {(["month", "week", "agenda"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)}
              className={cn("rounded-lg px-2.5 py-1.5 text-[12px] font-medium capitalize transition-colors",
                view === v ? "bg-indigo-600/10 text-indigo-600 dark:bg-indigo-400/10 dark:text-indigo-300" : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200")}>
              {v}
            </button>
          ))}
        </div>
      </Card>

      {!events && <Skeleton className="h-[560px]" />}

      {events && view === "month" && (
        <Card className="overflow-hidden">
          <div className="grid grid-cols-7 border-b border-zinc-100 text-center text-[10.5px] font-semibold uppercase tracking-wider text-zinc-400 dark:border-white/[0.06]">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="py-2">{d}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const dayEvents = byDay.get(key) ?? [];
              const isToday = key === todayYMD();
              return (
                <div
                  key={key}
                  onClick={() => setDayOpen(key)}
                  onDragOver={(e) => { e.preventDefault(); setOverDay(key); }}
                  onDragLeave={() => setOverDay((d) => d === key ? null : d)}
                  onDrop={() => dropTo(key)}
                  className={cn(
                    "cal-day cursor-pointer border-b border-r border-zinc-100/80 p-1.5 transition-colors dark:border-white/[0.05]",
                    !isSameMonth(day, cursor) && "bg-zinc-50/50 dark:bg-transparent",
                    isWke(day) && "bg-zinc-50/80 dark:bg-white/[0.015]",
                    overDay === key && "drag-over-col",
                    "hover:bg-indigo-50/50 dark:hover:bg-indigo-400/[0.04]",
                  )}
                >
                  <span className={cn(
                    "grid size-6 place-items-center rounded-full font-mono text-[11px]",
                    isToday ? "bg-indigo-600 font-bold text-white" : isSameMonth(day, cursor) ? "text-zinc-600 dark:text-zinc-300" : "text-zinc-300 dark:text-zinc-600",
                  )}>
                    {format(day, "d")}
                  </span>
                  <div className="mt-1 space-y-0.5">
                    {dayEvents.slice(0, 3).map((ev) => <EventChip key={ev.id + key} ev={ev} />)}
                    {dayEvents.length > 3 && <p className="px-1 text-[10px] text-zinc-400">+{dayEvents.length - 3} more</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {events && view === "week" && (
        <div className="grid gap-3 lg:grid-cols-7">
          {weekDays.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const dayEvents = byDay.get(key) ?? [];
            return (
              <Card key={key} className={cn("min-h-[200px]", key === todayYMD() && "border-indigo-500/40 dark:border-indigo-400/30")}>
                <div className="border-b border-zinc-100 px-3 py-2 dark:border-white/[0.06]">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-400">{format(day, "EEE")}</p>
                  <p className="font-mono text-[15px] font-semibold">{format(day, "d")}</p>
                </div>
                <div className="space-y-1 p-2">
                  {dayEvents.map((ev) => <EventChip key={ev.id} ev={ev} />)}
                  {!dayEvents.length && <p className="px-1.5 py-2 text-[10.5px] text-zinc-300 dark:text-zinc-600">—</p>}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {events && view === "agenda" && (
        <Card>
          <CardHeader title="Agenda" subtitle="Next 14 days" />
          <div className="divide-y divide-zinc-100 dark:divide-white/[0.05]">
            {agenda.map(([date, evs]) => (
              <div key={date} className="flex gap-4 px-4 py-3">
                <div className="w-16 shrink-0 text-right">
                  <p className="font-mono text-[15px] font-semibold">{date.slice(8, 10)}</p>
                  <p className="text-[10px] uppercase text-zinc-400">{new Date(date + "T00:00:00").toLocaleDateString("en-GB", { month: "short", weekday: "short" })}</p>
                </div>
                <div className="flex-1 space-y-1">
                  {evs.map((ev) => <EventChip key={ev.id} ev={ev} />)}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Day detail modal */}
      <Modal open={!!dayOpen} onClose={() => setDayOpen(null)} title={dayOpen ? new Date(dayOpen + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }) : ""}>
        <div className="space-y-2">
          {(byDay.get(dayOpen ?? "") ?? []).map((ev) => (
            <div key={ev.id} className="flex items-center gap-2 rounded-lg border border-zinc-100 px-3 py-2 dark:border-white/[0.06]">
              <span className={cn("size-2 rounded-full shrink-0", toneClasses[toneOf(ev.category)].dot)} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">{ev.title}</p>
                <p className="text-[11px] text-zinc-400">{label(ev.category)}{ev.startTime ? ` · ${ev.startTime}` : ""}{ev.source === "synced" ? " · synced" : ""}</p>
              </div>
              {ev.source === "manual" && (
                <>
                  <IconButton className="size-7" onClick={() => { setDayOpen(null); setEditing(ev); }}><Pencil className="size-3.5" /></IconButton>
                  <IconButton className="size-7" onClick={async () => {
                    await api.del("/api/calendar", { id: ev.id }).catch((e) => toast.error(e.message));
                    toast.success("Event removed"); load();
                  }}><Trash2 className="size-3.5 text-red-500" /></IconButton>
                </>
              )}
              {ev.sourceRef && <Button size="xs" variant="ghost" onClick={() => window.location.href = ev.sourceRef!}>Open</Button>}
            </div>
          ))}
          {!(byDay.get(dayOpen ?? "") ?? []).length && <p className="py-6 text-center text-xs text-zinc-400">Nothing scheduled.</p>}
          <Button variant="subtle" className="w-full" onClick={() => { setNewFor(dayOpen); setDayOpen(null); }}>
            <CalendarPlus className="size-3.5" /> Add event on this day
          </Button>
        </div>
      </Modal>

      {/* New / edit event modal */}
      <EventForm
        key={editing?.id ?? newFor ?? "none"}
        open={!!newFor || !!editing}
        date={newFor}
        event={editing}
        onClose={() => { setNewFor(null); setEditing(null); }}
        onSaved={() => { setNewFor(null); setEditing(null); load(); }}
      />
    </div>
  );
}

function EventForm({ open, date, event, onClose, onSaved }: {
  open: boolean; date: string | null; event: CalEvent | null; onClose: () => void; onSaved: () => void;
}) {
  const [f, setF] = useState({
    title: event?.title ?? "", eventDate: event?.date ?? date ?? todayYMD(),
    startTime: event?.startTime ?? "", category: event?.category && ["meeting", "reminder", "milestone"].includes(event.category) ? event.category : "meeting",
    description: "", recurrence: event?.meta?.recurrence ?? "none",
  });
  const save = async () => {
    try {
      const payload = { ...f, recurrence: f.recurrence === "none" ? null : f.recurrence, startTime: f.startTime || null };
      if (event) await api.patch("/api/calendar", { id: event.id, ...payload });
      else await api.post("/api/calendar", payload);
      toast.success(event ? "Event updated" : "Event created");
      onSaved();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); }
  };
  return (
    <Modal open={open} onClose={onClose} title={event ? "Edit event" : "New calendar event"}>
      <div className="space-y-4">
        <Field label="Title"><Input autoFocus value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Date"><Input type="date" value={f.eventDate} onChange={(e) => setF({ ...f, eventDate: e.target.value })} /></Field>
          <Field label="Start time (optional)"><Input type="time" value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} /></Field>
          <Field label="Category">
            <Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
              <option value="meeting">Meeting</option>
              <option value="reminder">Reminder</option>
              <option value="milestone">Milestone</option>
            </Select>
          </Field>
          <Field label="Recurrence">
            <Select value={f.recurrence} onChange={(e) => setF({ ...f, recurrence: e.target.value })}>
              <option value="none">None</option>
              <option value="weekly">Weekly</option>
              <option value="daily">Daily</option>
            </Select>
          </Field>
        </div>
        <Field label="Description"><Textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <div className="flex justify-end gap-2">
          <Button variant="subtle" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={!f.title.trim()}>{event ? "Save" : "Create event"}</Button>
        </div>
      </div>
    </Modal>
  );
}
