"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  Plus, Users, Search, CheckSquare, Trash2, Pencil, ListTodo, CalendarClock,
  Link2, MessageSquareQuote, Flag, ArrowUpRight,
} from "lucide-react";
import { api } from "@/lib/client";
import { Badge, Button, Card, CardHeader, Confirm, Empty, Field, IconButton, Input, Modal, PageHeader, Select, Skeleton, Tabs, Tag, Textarea } from "@/components/ui";
import { humanize, todayYMD } from "@/lib/dates";
import { label } from "@/lib/domain";
import { cn } from "@/lib/utils";

type ActionItem = { id: string; description: string; owner: string | null; dueDate: string | null; status: string; taskId: string | null; meetingTitle?: string; meetingDate?: string };
type Meeting = {
  id: string; title: string; type: string; meetingDate: string; startTime: string | null; durationMinutes: number;
  attendees: string[] | null; manager: string | null; agenda: string | null; notes: string | null;
  discussionTopics: string[] | null; feedback: string | null; decisions: string | null;
  managerCommitments: string | null; followUpDate: string | null; version: number;
  projectId: string | null; issueId: string | null; careerGoalId: string | null;
  projectName: string | null; issueKey: string | null; goalTitle: string | null;
  actionItems: ActionItem[];
};
type Resp = { data: Meeting[]; stats: { total: number; upcoming: number; followUps: number; openActionItems: number } };

const TYPES = ["one_on_one", "team", "review", "retro", "standup", "skip_level", "external"];
const TYPE_LABEL: Record<string, string> = {
  one_on_one: "1:1", team: "Team", review: "Review", retro: "Retro", standup: "Standup", skip_level: "Skip-level", external: "External",
};

export default function MeetingsPage() {
  const [d, setD] = useState<Resp | null>(null);
  const [actions, setActions] = useState<ActionItem[] | null>(null);
  const [tab, setTab] = useState<"meetings" | "actions">("meetings");
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [modal, setModal] = useState<{ meeting?: Meeting } | null>(null);
  const [detail, setDetail] = useState<Meeting | null>(null);
  const [delId, setDelId] = useState<string | null>(null);
  const [opts, setOpts] = useState<{ projects: { id: string; name: string }[]; goals: { id: string; title: string }[] }>({ projects: [], goals: [] });

  const load = useCallback(async () => {
    const qs = new URLSearchParams();
    if (q) qs.set("q", q);
    if (typeFilter) qs.set("type", typeFilter);
    const [m, a] = await Promise.all([
      api.get<Resp>(`/api/meetings?${qs}`),
      api.get<ActionItem[]>("/api/meetings/actions"),
    ]);
    setD(m); setActions(a);
  }, [q, typeFilter]);

  useEffect(() => { const t = setTimeout(() => load().catch((e) => toast.error(e.message)), 200); return () => clearTimeout(t); }, [load]);
  useEffect(() => {
    Promise.all([
      api.get<{ id: string; name: string }[]>("/api/projects"),
      api.get<{ goals: { id: string; title: string }[] }>("/api/career"),
    ]).then(([p, c]) => setOpts({ projects: p, goals: c.goals })).catch(() => {});
  }, []);

  const save = async (form: Record<string, unknown>, id?: string) => {
    try {
      if (id) await api.patch("/api/meetings", { id, ...form });
      else await api.post("/api/meetings", form);
      toast.success(id ? "Meeting updated" : "Meeting logged");
      setModal(null); load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); }
  };

  const setItemStatus = async (item: ActionItem, status: string) => {
    try {
      await api.patch("/api/meetings/actions", { id: item.id, status });
      load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  const promote = async (item: ActionItem) => {
    try {
      await api.patch("/api/meetings/actions", { id: item.id, promoteToTask: true });
      toast.success("Action item promoted to a task");
      load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  const openActions = useMemo(() => (actions ?? []).filter((a) => a.status === "open" || a.status === "in_progress"), [actions]);

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader title="Meetings & Manager Tracker" subtitle="1:1 notes, feedback, decisions, commitments and follow-ups"
        actions={
          <>
            <Button size="sm" variant="outline" onClick={() => window.open("/api/reports?type=meetings&format=xlsx")}>Export</Button>
            <Button size="sm" onClick={() => setModal({})}><Plus className="size-3.5" /> Log meeting</Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: "Meetings logged", value: d?.stats.total ?? 0, icon: Users, tone: "text-indigo-400" },
          { label: "Upcoming", value: d?.stats.upcoming ?? 0, icon: CalendarClock, tone: "text-sky-400" },
          { label: "Follow-ups scheduled", value: d?.stats.followUps ?? 0, icon: Flag, tone: "text-violet-400" },
          { label: "Open action items", value: openActions.length, icon: CheckSquare, tone: "text-amber-400" },
        ].map((s) => (
          <Card key={s.label} className="flex items-center gap-3 p-4">
            <div className="grid size-9 place-items-center rounded-xl bg-zinc-100 dark:bg-white/[0.05]"><s.icon className={cn("size-4", s.tone)} /></div>
            <div><p className="font-mono text-xl font-bold">{s.value}</p><p className="text-[11px] text-zinc-400">{s.label}</p></div>
          </Card>
        ))}
      </div>

      <Card className="flex flex-wrap items-center gap-2 p-2.5">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-zinc-400" />
          <Input className="h-8 pl-8 text-xs" placeholder="Search title, notes, feedback…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select className="h-8 w-auto text-xs" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">All types</option>
          {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
        </Select>
        <div className="ml-auto">
          <Tabs tabs={[{ key: "meetings", label: "Meetings" }, { key: "actions", label: `Action items (${openActions.length})` }]} active={tab} onChange={(v) => setTab(v as typeof tab)} />
        </div>
      </Card>

      {!d && <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20" />)}</div>}

      {d && tab === "meetings" && (
        d.data.length === 0 ? (
          <Empty title="No meetings logged" icon={<Users className="size-5" />} hint="Capture 1:1 notes, feedback, decisions and commitments."
            action={<Button size="sm" onClick={() => setModal({})}><Plus className="size-3.5" /> Log meeting</Button>} />
        ) : (
          <div className="space-y-2">
            {d.data.map((m) => {
              const open = m.actionItems.filter((a) => a.status === "open" || a.status === "in_progress").length;
              return (
                <Card key={m.id} className="group p-4 transition-colors hover:border-indigo-500/30">
                  <div className="flex items-start gap-3">
                    <div className="w-12 shrink-0 text-center">
                      <p className="font-mono text-[15px] font-semibold leading-none">{m.meetingDate.slice(8, 10)}</p>
                      <p className="text-[9.5px] uppercase text-zinc-400">{new Date(m.meetingDate + "T00:00:00").toLocaleDateString("en-GB", { month: "short" })}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <button onClick={() => setDetail(m)} className="text-[13.5px] font-semibold hover:text-indigo-600 dark:hover:text-indigo-400">{m.title}</button>
                        <Tag tone="indigo">{TYPE_LABEL[m.type] ?? m.type}</Tag>
                        {m.manager && <span className="text-[11px] text-zinc-400">with {m.manager}</span>}
                        {open > 0 && <Tag tone="amber">{open} open action(s)</Tag>}
                        {m.followUpDate && <Tag tone="violet">follow-up {humanize(m.followUpDate)}</Tag>}
                      </div>
                      {m.notes && <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">{m.notes}</p>}
                      <div className="mt-1.5 flex flex-wrap gap-2 text-[10.5px] text-zinc-400">
                        {m.startTime && <span>{m.startTime} · {m.durationMinutes}min</span>}
                        {m.projectName && <span className="inline-flex items-center gap-1"><Link2 className="size-3" />{m.projectName}</span>}
                        {m.issueKey && <span className="inline-flex items-center gap-1"><Link2 className="size-3" />{m.issueKey}</span>}
                        {m.goalTitle && <span className="inline-flex items-center gap-1"><Link2 className="size-3" />{m.goalTitle}</span>}
                      </div>
                    </div>
                    <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <IconButton className="size-7" onClick={() => setModal({ meeting: m })}><Pencil className="size-3.5" /></IconButton>
                      <IconButton className="size-7" onClick={() => setDelId(m.id)}><Trash2 className="size-3.5 text-red-500" /></IconButton>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )
      )}

      {d && tab === "actions" && (
        <Card>
          <CardHeader title="Action item inbox" subtitle="Across all meetings — mark done or promote into your task board" />
          {!actions?.length ? <div className="p-4"><Empty title="No action items" icon={<CheckSquare className="size-5" />} hint="Action items added to meetings appear here." /></div> : (
            <div className="divide-y divide-zinc-100 dark:divide-white/[0.05]">
              {actions.map((a) => (
                <div key={a.id} className="flex items-center gap-3 px-4 py-2.5">
                  <input type="checkbox" className="size-4 accent-emerald-600" checked={a.status === "done"}
                    onChange={(e) => setItemStatus(a, e.target.checked ? "done" : "open")} />
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-[12.5px]", a.status === "done" && "text-zinc-400 line-through")}>{a.description}</p>
                    <p className="text-[10.5px] text-zinc-400">
                      {a.owner ?? "me"}{a.dueDate ? ` · due ${humanize(a.dueDate)}` : ""}{a.meetingTitle ? ` · from “${a.meetingTitle}”` : ""}
                    </p>
                  </div>
                  <Badge value={a.status === "in_progress" ? "in_progress" : a.status === "done" ? "resolved" : a.status === "dropped" ? "cancelled" : "open"} />
                  {!a.taskId && a.status !== "done" && (
                    <Button size="xs" variant="outline" onClick={() => promote(a)}><ListTodo className="size-3" /> To task</Button>
                  )}
                  {a.taskId && <Tag tone="emerald">task created</Tag>}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {modal && <MeetingForm meeting={modal.meeting} opts={opts} onClose={() => setModal(null)} onSubmit={save} />}
      {detail && <MeetingDetail meeting={detail} onClose={() => setDetail(null)} onChanged={load} />}
      <Confirm open={!!delId} title="Delete meeting?" message="The meeting and its action items will be removed from your tracker." danger
        onCancel={() => setDelId(null)}
        onConfirm={async () => { try { await api.del("/api/meetings", { id: delId }); toast.success("Meeting deleted"); setDelId(null); load(); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } }} />
    </div>
  );
}

function MeetingDetail({ meeting, onClose, onChanged }: { meeting: Meeting; onClose: () => void; onChanged: () => void }) {
  const [newItem, setNewItem] = useState("");
  const [due, setDue] = useState("");
  const sections = [
    ["Agenda", meeting.agenda], ["Notes", meeting.notes], ["Feedback received", meeting.feedback],
    ["Decisions", meeting.decisions], ["Manager commitments", meeting.managerCommitments],
  ] as [string, string | null][];

  return (
    <Modal open onClose={onClose} title={meeting.title} wide>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Tag tone="indigo">{TYPE_LABEL[meeting.type] ?? meeting.type}</Tag>
          <span className="text-[12px] text-zinc-500">{humanize(meeting.meetingDate)}{meeting.startTime ? ` · ${meeting.startTime}` : ""} · {meeting.durationMinutes}min</span>
          {meeting.manager && <span className="text-[12px] text-zinc-500">· with {meeting.manager}</span>}
        </div>
        {(meeting.attendees?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-1.5">{meeting.attendees!.map((a) => <Tag key={a}>{a}</Tag>)}</div>
        )}
        {(meeting.discussionTopics?.length ?? 0) > 0 && (
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Discussion topics</p>
            <ul className="space-y-0.5">{meeting.discussionTopics!.map((t) => <li key={t} className="text-[12.5px] text-zinc-600 dark:text-zinc-300">• {t}</li>)}</ul>
          </div>
        )}
        {sections.filter(([, v]) => v).map(([k, v]) => (
          <div key={k}>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{k}</p>
            <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-zinc-600 dark:text-zinc-300">{v}</p>
          </div>
        ))}

        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Action items ({meeting.actionItems.length})</p>
          <div className="space-y-1">
            {meeting.actionItems.map((a) => (
              <div key={a.id} className="flex items-center gap-2 rounded-lg border border-zinc-100 px-2.5 py-1.5 dark:border-white/[0.06]">
                <span className={cn("text-[12px]", a.status === "done" && "line-through opacity-60")}>{a.description}</span>
                <span className="ml-auto text-[10.5px] text-zinc-400">{a.owner}{a.dueDate ? ` · ${humanize(a.dueDate)}` : ""}</span>
                <Badge value={a.status === "done" ? "resolved" : "open"} />
              </div>
            ))}
            {!meeting.actionItems.length && <p className="text-xs text-zinc-400">None recorded.</p>}
          </div>
          <div className="mt-2 flex gap-1.5">
            <Input className="h-8 text-xs" placeholder="New action item…" value={newItem} onChange={(e) => setNewItem(e.target.value)} />
            <Input className="h-8 w-36 text-xs" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            <Button size="sm" disabled={!newItem.trim()} onClick={async () => {
              try {
                await api.post("/api/meetings/actions", { meetingId: meeting.id, description: newItem, dueDate: due || null });
                setNewItem(""); setDue(""); toast.success("Action item added"); onChanged(); onClose();
              } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
            }}><Plus className="size-3.5" /></Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function MeetingForm({ meeting, opts, onClose, onSubmit }: {
  meeting?: Meeting;
  opts: { projects: { id: string; name: string }[]; goals: { id: string; title: string }[] };
  onClose: () => void;
  onSubmit: (f: Record<string, unknown>, id?: string) => void;
}) {
  const [f, setF] = useState<Record<string, unknown>>(meeting ?? { type: "one_on_one", meetingDate: todayYMD(), durationMinutes: 30 });
  const [attendees, setAttendees] = useState((meeting?.attendees ?? []).join(", "));
  const [topics, setTopics] = useState((meeting?.discussionTopics ?? []).join("\n"));
  const [items, setItems] = useState("");
  const set = (k: string, v: unknown) => setF((p) => ({ ...p, [k]: v }));

  return (
    <Modal open onClose={onClose} title={meeting ? "Edit meeting" : "Log a meeting"} wide>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" className="sm:col-span-2"><Input autoFocus value={(f.title as string) ?? ""} onChange={(e) => set("title", e.target.value)} placeholder="Weekly 1:1 with Priya" /></Field>
        <Field label="Type">
          <Select value={(f.type as string) ?? "one_on_one"} onChange={(e) => set("type", e.target.value)}>
            {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </Select>
        </Field>
        <Field label="Manager / counterpart"><Input value={(f.manager as string) ?? ""} onChange={(e) => set("manager", e.target.value)} /></Field>
        <Field label="Date"><Input type="date" value={(f.meetingDate as string) ?? ""} onChange={(e) => set("meetingDate", e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start time"><Input type="time" value={(f.startTime as string) ?? ""} onChange={(e) => set("startTime", e.target.value)} /></Field>
          <Field label="Duration (min)"><Input type="number" min={5} step={5} value={(f.durationMinutes as number) ?? 30} onChange={(e) => set("durationMinutes", Number(e.target.value))} /></Field>
        </div>
        <Field label="Attendees (comma separated)" className="sm:col-span-2"><Input value={attendees} onChange={(e) => setAttendees(e.target.value)} /></Field>
        <Field label="Agenda" className="sm:col-span-2"><Textarea rows={2} value={(f.agenda as string) ?? ""} onChange={(e) => set("agenda", e.target.value)} /></Field>
        <Field label="Discussion topics (one per line)" className="sm:col-span-2"><Textarea rows={2} value={topics} onChange={(e) => setTopics(e.target.value)} /></Field>
        <Field label="Notes" className="sm:col-span-2"><Textarea rows={3} value={(f.notes as string) ?? ""} onChange={(e) => set("notes", e.target.value)} /></Field>
        <Field label="Feedback received"><Textarea rows={2} value={(f.feedback as string) ?? ""} onChange={(e) => set("feedback", e.target.value)} /></Field>
        <Field label="Decisions"><Textarea rows={2} value={(f.decisions as string) ?? ""} onChange={(e) => set("decisions", e.target.value)} /></Field>
        <Field label="Manager commitments" className="sm:col-span-2"><Textarea rows={2} value={(f.managerCommitments as string) ?? ""} onChange={(e) => set("managerCommitments", e.target.value)} placeholder="What your manager committed to follow up on" /></Field>
        <Field label="Follow-up date"><Input type="date" value={(f.followUpDate as string) ?? ""} onChange={(e) => set("followUpDate", e.target.value || null)} /></Field>
        <Field label="Link to project">
          <Select value={(f.projectId as string) ?? ""} onChange={(e) => set("projectId", e.target.value || null)}>
            <option value="">None</option>
            {opts.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Field label="Link to career goal" className="sm:col-span-2">
          <Select value={(f.careerGoalId as string) ?? ""} onChange={(e) => set("careerGoalId", e.target.value || null)}>
            <option value="">None</option>
            {opts.goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
          </Select>
        </Field>
        {!meeting && (
          <Field label="Action items (one per line)" className="sm:col-span-2">
            <Textarea rows={2} value={items} onChange={(e) => setItems(e.target.value)} placeholder={"Share design doc with team\nBook arch review slot"} />
          </Field>
        )}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="subtle" onClick={onClose}>Cancel</Button>
        <Button onClick={() => onSubmit({
          ...f,
          attendees: attendees.split(",").map((a) => a.trim()).filter(Boolean),
          discussionTopics: topics.split("\n").map((t) => t.trim()).filter(Boolean),
          actionItems: items.split("\n").map((t) => t.trim()).filter(Boolean).map((description) => ({ description })),
          version: meeting?.version,
        }, meeting?.id)}>{meeting ? "Save changes" : "Log meeting"}</Button>
      </div>
    </Modal>
  );
}
