"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { Plus, Search, ListTodo, Kanban, Trash2, ChevronDown, ChevronRight, CalendarDays, AlertTriangle } from "lucide-react";
import { api } from "@/lib/client";
import { Badge, Button, Card, Confirm, Empty, Field, IconButton, Input, Modal, PageHeader, Progress, Select, Skeleton, Tabs, Tag, Textarea } from "@/components/ui";
import { PRIORITIES, TASK_STATUSES, label } from "@/lib/domain";
import { humanize, isPastYMD } from "@/lib/dates";
import { cn } from "@/lib/utils";

type Task = {
  id: string; title: string; description: string | null; projectId: string | null;
  projectName?: string | null; projectKey?: string | null;
  status: string; priority: string; dueDate: string | null; progress: number;
  estimatedHours: string | null; actualHours: string | null; completedAt: string | null;
  subtasks: { id: string; title: string; done: boolean }[];
};

export default function TasksPage() {
  return <Suspense fallback={<Skeleton className="h-96" />}><TasksInner /></Suspense>;
}

function TasksInner() {
  const params = useSearchParams();
  const [view, setView] = useState<"list" | "board">("list");
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [modal, setModal] = useState<{ task?: Task } | null>(null);
  const [delId, setDelId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dragging, setDragging] = useState<Task | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);

  const load = useCallback(async () => {
    const qs = new URLSearchParams();
    if (q) qs.set("q", q);
    if (statusFilter) qs.set("status", statusFilter);
    setTasks(await api.get<Task[]>(`/api/tasks?${qs}`));
  }, [q, statusFilter]);

  useEffect(() => { const t = setTimeout(() => load().catch((e) => toast.error(e.message)), 200); return () => clearTimeout(t); }, [load]);
  useEffect(() => { api.get<{ id: string; name: string }[]>("/api/projects").then(setProjects).catch(() => {}); }, []);
  useEffect(() => { if (params.get("new") === "1") setModal({}); }, [params]);

  const save = async (form: Record<string, unknown>, id?: string) => {
    try {
      if (id) await api.patch(`/api/tasks/${id}`, form);
      else await api.post("/api/tasks", form);
      toast.success(id ? "Task updated" : "Task created");
      setModal(null); load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); }
  };

  const toggleSub = async (task: Task, subId: string, done: boolean) => {
    const subs = task.subtasks.map((s) => s.id === subId ? { ...s, done } : s);
    setTasks((t) => t?.map((x) => x.id === task.id ? { ...x, subtasks: subs } : x) ?? null);
    await api.patch(`/api/tasks/${task.id}`, { subtasks: subs }).catch((e) => toast.error(e.message));
  };

  const setStatus = async (task: Task, status: string) => {
    setTasks((t) => t?.map((x) => x.id === task.id ? { ...x, status } : x) ?? null);
    try { await api.patch(`/api/tasks/${task.id}`, { status }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); load(); }
  };

  const overdue = (t: Task) => t.dueDate && t.status !== "done" && isPastYMD(t.dueDate);
  const todo = (t: Task) => t.subtasks.filter((s) => s.done).length;

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader title="My Tasks" subtitle="Personal task board with subtasks, progress and due dates"
        actions={<Button size="sm" onClick={() => setModal({})}><Plus className="size-3.5" /> New task</Button>} />

      <Card className="flex flex-wrap items-center gap-2 p-2.5">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-zinc-400" />
          <Input className="h-8 pl-8 text-xs" placeholder="Search tasks…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select className="h-8 w-auto text-xs" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {TASK_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </Select>
        <Button variant="outline" size="sm" onClick={() => window.open("/api/reports?type=tasks&format=csv")}>Export CSV</Button>
        <div className="ml-auto">
          <Tabs tabs={[{ key: "list", label: <span className="inline-flex items-center gap-1.5"><ListTodo className="size-3.5" />List</span> }, { key: "board", label: <span className="inline-flex items-center gap-1.5"><Kanban className="size-3.5" />Board</span> }]} active={view} onChange={(v) => setView(v as "list" | "board")} />
        </div>
      </Card>

      {!tasks && <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14" />)}</div>}

      {tasks && view === "list" && (
        <Card className="overflow-hidden">
          <div className="divide-y divide-zinc-100 dark:divide-white/[0.05]">
            {tasks.map((t) => (
              <div key={t.id} className="group flex items-start gap-3 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-white/[0.02]">
                <input
                  type="checkbox"
                  checked={t.status === "done"}
                  onChange={(e) => setStatus(t, e.target.checked ? "done" : "todo")}
                  className="mt-1 size-4 accent-emerald-600"
                />
                <div className="min-w-0 flex-1">
                  <button onClick={() => setModal({ task: t })} className={cn("text-left text-[13px] font-medium", t.status === "done" && "text-zinc-400 line-through")}>
                    {overdue(t) && <AlertTriangle className="mb-0.5 mr-1 inline size-3.5 text-red-500" />}
                    {t.title}
                  </button>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
                    {t.projectKey && <span className="font-mono">{t.projectKey}</span>}
                    {t.dueDate && <span className={cn("font-mono", overdue(t) && "text-red-500")}><CalendarDays className="mb-0.5 mr-0.5 inline size-3" />{humanize(t.dueDate)}</span>}
                    {t.subtasks.length > 0 && <span>{todo(t)}/{t.subtasks.length} subtasks</span>}
                    {t.progress > 0 && t.status !== "done" && <span>{t.progress}%</span>}
                  </div>
                  {t.subtasks.length > 0 && expanded.has(t.id) && (
                    <div className="mt-2 space-y-1">
                      {t.subtasks.map((s) => (
                        <label key={s.id} className="flex items-center gap-2 text-[12px] text-zinc-500 dark:text-zinc-400">
                          <input type="checkbox" className="size-3.5 accent-indigo-600" checked={s.done} onChange={(e) => toggleSub(t, s.id, e.target.checked)} />
                          <span className={cn(s.done && "line-through opacity-60")}>{s.title}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Badge value={t.priority} />
                  <Badge value={t.status} />
                  {t.subtasks.length > 0 && (
                    <IconButton className="size-7" onClick={() => setExpanded((s) => { const n = new Set(s); n.has(t.id) ? n.delete(t.id) : n.add(t.id); return n; })}>
                      {expanded.has(t.id) ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                    </IconButton>
                  )}
                  <IconButton className="size-7 opacity-0 group-hover:opacity-100" onClick={() => setDelId(t.id)}><Trash2 className="size-3.5" /></IconButton>
                </div>
              </div>
            ))}
            {!tasks.length && <div className="p-6"><Empty title="No tasks" hint="Create your first task or adjust the filter." action={<Button size="sm" onClick={() => setModal({})}><Plus className="size-3.5" /> New task</Button>} /></div>}
          </div>
        </Card>
      )}

      {tasks && view === "board" && (
        <div className="grid gap-3 md:grid-cols-4">
          {TASK_STATUSES.map((status) => {
            const items = tasks.filter((t) => t.status === status);
            return (
              <div key={status}
                onDragOver={(e) => { e.preventDefault(); setOverCol(status); }}
                onDragLeave={() => setOverCol((c) => c === status ? null : c)}
                onDrop={() => { if (dragging) { setStatus(dragging, status); setDragging(null); } setOverCol(null); }}
                className={cn("flex min-h-[200px] flex-col rounded-xl border border-zinc-200/80 bg-zinc-50/60 p-2 dark:border-white/[0.06] dark:bg-white/[0.02]", overCol === status && "drag-over-col")}
              >
                <div className="flex items-center gap-2 px-1.5 py-2">
                  <Badge value={status} />
                  <span className="font-mono text-[11px] text-zinc-400">{items.length}</span>
                </div>
                <div className="flex-1 space-y-2">
                  {items.map((t) => (
                    <div key={t.id} draggable
                      onDragStart={() => setDragging(t)} onDragEnd={() => setDragging(null)}
                      onClick={() => setModal({ task: t })}
                      className={cn("cursor-grab rounded-lg border border-zinc-200/80 bg-white p-2.5 shadow-sm dark:border-white/[0.07] dark:bg-[#151518] active:cursor-grabbing", dragging?.id === t.id && "dragging-card")}
                    >
                      <p className={cn("text-[12.5px] font-medium leading-snug", t.status === "done" && "line-through opacity-60")}>{t.title}</p>
                      <div className="mt-2 flex items-center justify-between">
                        <Badge value={t.priority} />
                        {t.dueDate && <span className={cn("font-mono text-[10.5px]", overdue(t) ? "text-red-500" : "text-zinc-400")}>{humanize(t.dueDate)}</span>}
                      </div>
                      {t.progress > 0 && <Progress className="mt-2" value={t.progress} tone={t.status === "done" ? "emerald" : "indigo"} />}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && <TaskForm task={modal.task} projects={projects} onClose={() => setModal(null)} onSubmit={save} />}
      <Confirm open={!!delId} title="Delete task?" message="The task and its subtasks will be removed." danger onCancel={() => setDelId(null)}
        onConfirm={async () => { try { await api.del(`/api/tasks/${delId}`); toast.success("Task deleted"); setDelId(null); load(); } catch (e) { toast.error(e instanceof Error ? e.message : "Delete failed"); } }} />
    </div>
  );
}

function TaskForm({ task, projects, onClose, onSubmit }: {
  task?: Task; projects: { id: string; name: string }[]; onClose: () => void; onSubmit: (f: Record<string, unknown>, id?: string) => void;
}) {
  const [f, setF] = useState<Record<string, unknown>>(task ?? { status: "todo", priority: "medium", progress: 0 });
  const [subs, setSubs] = useState<string>(task ? task.subtasks.filter((s) => !s.done).map((s) => s.title).join("\n") : "");
  const set = (k: string, v: unknown) => setF((p) => ({ ...p, [k]: v }));

  return (
    <Modal open onClose={onClose} title={task ? "Edit task" : "New task"} wide>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" className="sm:col-span-2">
          <Input autoFocus value={(f.title as string) ?? ""} onChange={(e) => set("title", e.target.value)} />
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <Textarea rows={3} value={(f.description as string) ?? ""} onChange={(e) => set("description", e.target.value)} />
        </Field>
        <Field label="Project">
          <Select value={(f.projectId as string) ?? ""} onChange={(e) => set("projectId", e.target.value || null)}>
            <option value="">None</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Field label="Status">
          <Select value={(f.status as string) ?? "todo"} onChange={(e) => set("status", e.target.value)}>
            {TASK_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
          </Select>
        </Field>
        <Field label="Priority">
          <Select value={(f.priority as string) ?? "medium"} onChange={(e) => set("priority", e.target.value)}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{label(p)}</option>)}
          </Select>
        </Field>
        <Field label="Due date">
          <Input type="date" value={(f.dueDate as string) ?? ""} onChange={(e) => set("dueDate", e.target.value)} />
        </Field>
        <Field label={`Progress — ${f.progress ?? 0}%`}>
          <input type="range" min={0} max={100} step={5} value={Number(f.progress ?? 0)} onChange={(e) => set("progress", Number(e.target.value))} className="w-full accent-indigo-600" />
        </Field>
        <Field label="Estimated hours">
          <Input type="number" min="0" step="0.5" value={(f.estimatedHours as string) ?? ""} onChange={(e) => set("estimatedHours", e.target.value)} />
        </Field>
        {!task && (
          <Field label="Subtasks (one per line)" className="sm:col-span-2">
            <Textarea rows={3} value={subs} onChange={(e) => setSubs(e.target.value)} placeholder={"Draft proposal\nReview with team"} />
          </Field>
        )}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="subtle" onClick={onClose}>Cancel</Button>
        <Button onClick={() => onSubmit({ ...f, subtasks: subs.split("\n").map((s) => s.trim()).filter(Boolean) }, task?.id)}>
          {task ? "Save" : "Create task"}
        </Button>
      </div>
    </Modal>
  );
}
