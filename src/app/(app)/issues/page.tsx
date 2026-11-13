"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import {
  Plus, Download, Search, ListTodo, Kanban, Trash2, ExternalLink, AlertTriangle,
  GripVertical, ChevronLeft, ChevronRight,
} from "lucide-react";
import { api } from "@/lib/client";
import {
  Badge, Button, Card, Confirm, Empty, Field, IconButton, Input, Modal, PageHeader,
  Select, Skeleton, Tabs, Textarea,
} from "@/components/ui";
import { ISSUE_STATUSES, ISSUE_TYPES, PRIORITIES, label } from "@/lib/domain";
import { humanize, isPastYMD, todayYMD } from "@/lib/dates";
import { cn } from "@/lib/utils";

export type Issue = {
  id: string; key: string; title: string; description: string | null;
  projectId: string | null; projectName?: string | null; projectKey?: string | null;
  repository: string | null; type: string; priority: string; status: string;
  assignee: string | null; reporter: string | null;
  startDate: string | null; dueDate: string | null;
  estimatedHours: string | null; actualHours: string | null;
  tags: string[] | null; externalUrl: string | null;
  createdAt: string; updatedAt: string;
};
type Project = { id: string; name: string; key: string };

export default function IssuesPage() {
  return <Suspense fallback={<Skeleton className="h-96" />}><IssuesInner /></Suspense>;
}

function IssuesInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [view, setView] = useState<"list" | "board">("list");
  const [data, setData] = useState<{ data: Issue[]; total: number; page: number; pageSize: number } | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [filters, setFilters] = useState({
    q: "", status: params.get("status") ?? "", priority: "", projectId: "", sort: "dueDate", page: 1,
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<{ mode: "new" } | { mode: "edit"; issue: Issue } | null>(null);
  const [deleteIds, setDeleteIds] = useState<string[] | null>(null);
  const [dragging, setDragging] = useState<Issue | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);

  const load = useCallback(async () => {
    const q = new URLSearchParams({ page: String(filters.page), pageSize: "60", sort: filters.sort });
    for (const k of ["q", "status", "priority", "projectId"] as const) if (filters[k]) q.set(k, filters[k]);
    const r = await api.get<{ data: Issue[]; total: number; page: number; pageSize: number }>(`/api/issues?${q}`);
    setData(r);
  }, [filters]);

  useEffect(() => { load().catch((e) => toast.error(e.message)); }, [load]);
  useEffect(() => { api.get<Project[]>("/api/projects").then(setProjects).catch(() => {}); }, []);
  useEffect(() => { if (params.get("new") === "1") setModal({ mode: "new" }); }, [params]);

  const setF = (k: string, v: string | number) => setFilters((f) => ({ ...f, [k]: v, page: 1 }));

  const createOrUpdate = async (form: Partial<Issue>, mode: "new" | "edit", id?: string) => {
    try {
      if (mode === "new") { await api.post("/api/issues", form); toast.success("Issue created"); }
      else { await api.patch(`/api/issues/${id}`, form); toast.success("Issue updated"); }
      setModal(null);
      load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); }
  };

  const bulk = async (field: "status" | "priority", value: string) => {
    try {
      await Promise.all([...selected].map((id) => api.patch(`/api/issues/${id}`, { [field]: value })));
      toast.success(`Updated ${selected.size} issue(s)`);
      setSelected(new Set());
      load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Bulk update failed"); }
  };

  const doDelete = async () => {
    try {
      await Promise.all((deleteIds ?? []).map((id) => api.del(`/api/issues/${id}`)));
      toast.success(`${deleteIds?.length} issue(s) deleted`);
      setDeleteIds(null); setSelected(new Set()); load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Delete failed"); }
  };

  const dropOn = async (status: string) => {
    setOverCol(null);
    if (!dragging || dragging.status === status) return;
    try {
      await api.patch(`/api/issues/${dragging.id}`, { status });
      setData((d) => d && { ...d, data: d.data.map((i) => i.id === dragging.id ? { ...i, status } : i) });
      toast.success(`${dragging.key} → ${label(status)}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Update failed"); }
    setDragging(null);
  };

  const isOverdue = (i: Issue) => i.dueDate && isPastYMD(i.dueDate) && !["resolved", "closed"].includes(i.status);

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader
        title="My Issues"
        subtitle="Personal issue tracker — list, filters, Kanban, time & history"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => window.open("/api/reports?type=issues&format=csv")}><Download className="size-3.5" /> Export</Button>
            <Button size="sm" onClick={() => setModal({ mode: "new" })}><Plus className="size-3.5" /> New issue</Button>
          </>
        }
      />

      {/* Filters */}
      <Card className="flex flex-wrap items-center gap-2 p-2.5">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-zinc-400" />
          <Input className="h-8 pl-8 text-xs" placeholder="Search title or ID…" value={filters.q}
            onChange={(e) => setF("q", e.target.value)} />
        </div>
        <Select className="h-8 w-auto text-xs" value={filters.status} onChange={(e) => setF("status", e.target.value)}>
          <option value="">All statuses</option>
          {ISSUE_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </Select>
        <Select className="h-8 w-auto text-xs" value={filters.priority} onChange={(e) => setF("priority", e.target.value)}>
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{label(p)}</option>)}
        </Select>
        <Select className="h-8 w-auto text-xs" value={filters.projectId} onChange={(e) => setF("projectId", e.target.value)}>
          <option value="">All projects</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
        <Select className="h-8 w-auto text-xs" value={filters.sort} onChange={(e) => setF("sort", e.target.value)}>
          <option value="dueDate">Sort: Due date</option>
          <option value="createdAt">Sort: Newest</option>
          <option value="priority">Sort: Priority</option>
        </Select>
        <div className="ml-auto">
          <Tabs tabs={[{ key: "list", label: <span className="inline-flex items-center gap-1.5"><ListTodo className="size-3.5" />List</span> }, { key: "board", label: <span className="inline-flex items-center gap-1.5"><Kanban className="size-3.5" />Board</span> }]}
            active={view} onChange={(v) => setView(v as "list" | "board")} />
        </div>
      </Card>

      {/* Bulk bar */}
      {selected.size > 0 && (
        <Card className="flex flex-wrap items-center gap-2 border-indigo-500/30 bg-indigo-600/[0.05] p-2.5 dark:bg-indigo-400/[0.06] animate-slide-up">
          <span className="text-xs font-medium text-indigo-600 dark:text-indigo-300">{selected.size} selected</span>
          <Select className="h-8 w-auto text-xs" onChange={(e) => e.target.value && bulk("status", e.target.value)} value="">
            <option value="">Set status…</option>
            {ISSUE_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
          </Select>
          <Select className="h-8 w-auto text-xs" onChange={(e) => e.target.value && bulk("priority", e.target.value)} value="">
            <option value="">Set priority…</option>
            {PRIORITIES.map((p) => <option key={p} value={p}>{label(p)}</option>)}
          </Select>
          <Button size="xs" variant="danger" onClick={() => setDeleteIds([...selected])}><Trash2 className="size-3" /> Delete</Button>
          <Button size="xs" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
        </Card>
      )}

      {!data && <div className="space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>}

      {/* LIST VIEW */}
      {data && view === "list" && (
        <Card className="overflow-hidden">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-zinc-100 text-[11px] uppercase tracking-wider text-zinc-400 dark:border-white/[0.06]">
                <th className="w-8 px-3 py-2.5"></th>
                <th className="px-2 py-2.5 font-medium">ID</th>
                <th className="px-2 py-2.5 font-medium">Title</th>
                <th className="hidden px-2 py-2.5 font-medium md:table-cell">Project</th>
                <th className="px-2 py-2.5 font-medium">Priority</th>
                <th className="px-2 py-2.5 font-medium">Status</th>
                <th className="hidden px-2 py-2.5 font-medium lg:table-cell">Due</th>
                <th className="hidden w-10 px-2 py-2.5 lg:table-cell"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.05]">
              {data.data.map((i) => (
                <tr key={i.id} className="group transition-colors hover:bg-zinc-50 dark:hover:bg-white/[0.025]">
                  <td className="px-3 py-2">
                    <input type="checkbox" className="size-3.5 accent-indigo-600" checked={selected.has(i.id)}
                      onChange={(e) => setSelected((s) => { const n = new Set(s); e.target.checked ? n.add(i.id) : n.delete(i.id); return n; })} />
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 font-mono text-[11.5px] text-zinc-500">{i.key}</td>
                  <td className="max-w-0 px-2 py-2">
                    <button onClick={() => router.push(`/issues/${i.id}`)} className="flex w-full items-center gap-2 text-left">
                      <span className="truncate font-medium text-zinc-800 group-hover:text-indigo-600 dark:text-zinc-100 dark:group-hover:text-indigo-400">
                        {isOverdue(i) && <AlertTriangle className="mb-0.5 mr-1 inline size-3.5 text-red-500" />}
                        {i.title}
                      </span>
                      {(i.tags ?? []).slice(0, 2).map((t) => <span key={t} className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:bg-white/[0.06]">{t}</span>)}
                    </button>
                  </td>
                  <td className="hidden whitespace-nowrap px-2 py-2 text-xs text-zinc-500 md:table-cell">{i.projectName ?? "—"}</td>
                  <td className="px-2 py-2"><Badge value={i.priority} /></td>
                  <td className="px-2 py-2"><Badge value={i.status} /></td>
                  <td className={cn("hidden whitespace-nowrap px-2 py-2 font-mono text-[11.5px] lg:table-cell", isOverdue(i) ? "text-red-500" : "text-zinc-500")}>
                    {humanize(i.dueDate)}
                  </td>
                  <td className="hidden px-2 py-2 text-right lg:table-cell">
                    <IconButton className="size-7 opacity-0 group-hover:opacity-100" onClick={() => router.push(`/issues/${i.id}`)}><ChevronRight className="size-3.5" /></IconButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.data.length && <div className="p-6"><Empty title="No issues found" hint="Adjust filters or create a new issue." action={<Button size="sm" onClick={() => setModal({ mode: "new" })}><Plus className="size-3.5" /> New issue</Button>} /></div>}
          <div className="flex items-center justify-between border-t border-zinc-100 px-3 py-2 text-xs text-zinc-500 dark:border-white/[0.06]">
            <span>{data.total} issue(s)</span>
            <div className="flex items-center gap-1">
              <IconButton className="size-7" disabled={filters.page <= 1} onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}><ChevronLeft className="size-3.5" /></IconButton>
              <span className="font-mono text-[11px]">p{filters.page}</span>
              <IconButton className="size-7" disabled={filters.page * 60 >= data.total} onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}><ChevronRight className="size-3.5" /></IconButton>
            </div>
          </div>
        </Card>
      )}

      {/* BOARD VIEW */}
      {data && view === "board" && (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {ISSUE_STATUSES.map((status) => {
            const items = data.data.filter((i) => i.status === status);
            return (
              <div
                key={status}
                onDragOver={(e) => { e.preventDefault(); setOverCol(status); }}
                onDragLeave={() => setOverCol((c) => (c === status ? null : c))}
                onDrop={() => dropOn(status)}
                className={cn(
                  "flex w-[264px] shrink-0 flex-col rounded-xl border border-zinc-200/80 bg-zinc-50/60 transition-all dark:border-white/[0.06] dark:bg-white/[0.02]",
                  overCol === status && "drag-over-col",
                )}
              >
                <div className="flex items-center justify-between px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <Badge value={status} />
                    <span className="font-mono text-[11px] text-zinc-400">{items.length}</span>
                  </div>
                  <IconButton className="size-6" onClick={() => setModal({ mode: "new" })}><Plus className="size-3.5" /></IconButton>
                </div>
                <div className="min-h-[120px] flex-1 space-y-2 p-2">
                  {items.map((i) => (
                    <div
                      key={i.id}
                      draggable
                      onDragStart={() => setDragging(i)}
                      onDragEnd={() => setDragging(null)}
                      onClick={() => router.push(`/issues/${i.id}`)}
                      className={cn(
                        "cursor-grab rounded-lg border border-zinc-200/80 bg-white p-2.5 shadow-sm transition-all hover:border-indigo-400/50 active:cursor-grabbing dark:border-white/[0.07] dark:bg-[#151518]",
                        dragging?.id === i.id && "dragging-card",
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        <GripVertical className="size-3 text-zinc-300" />
                        <span className="font-mono text-[10px] text-zinc-400">{i.key}</span>
                        <span className="ml-auto"><Badge value={i.priority} /></span>
                      </div>
                      <p className="mt-1.5 line-clamp-2 text-[12.5px] font-medium leading-snug">{i.title}</p>
                      <div className="mt-2 flex items-center gap-2 text-[10.5px] text-zinc-400">
                        {i.projectKey && <span>{i.projectKey}</span>}
                        {i.dueDate && <span className={cn("font-mono", isOverdue(i) && "text-red-500")}>{humanize(i.dueDate)}</span>}
                      </div>
                    </div>
                  ))}
                  {!items.length && (
                    <div className="rounded-lg border border-dashed border-zinc-200 py-6 text-center text-[11px] text-zinc-400 dark:border-white/[0.08]">
                      Drop here
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / edit modal */}
      {modal && (
        <IssueForm
          issue={modal.mode === "edit" ? modal.issue : undefined}
          projects={projects}
          onClose={() => setModal(null)}
          onSubmit={(form) => createOrUpdate(form, modal.mode, modal.mode === "edit" ? modal.issue.id : undefined)}
        />
      )}

      <Confirm
        open={!!deleteIds}
        title="Delete issue(s)?"
        message={`${deleteIds?.length ?? 0} issue(s) will be soft-deleted. Status history and comments remain in the database for audit.`}
        danger
        onCancel={() => setDeleteIds(null)}
        onConfirm={doDelete}
      />
    </div>
  );
}

/* ---------------------------------------------------------- Issue form */
export function IssueForm({ issue, projects, onClose, onSubmit }: {
  issue?: Issue; projects: Project[]; onClose: () => void; onSubmit: (f: Partial<Issue>) => void;
}) {
  const [f, setF] = useState<Partial<Issue>>(issue ?? {
    type: "bug", priority: "medium", status: "open", tags: [],
  });
  const [tagsText, setTagsText] = useState((issue?.tags ?? []).join(", "));
  const set = (k: keyof Issue, v: unknown) => setF((p) => ({ ...p, [k]: v }));

  return (
    <Modal open onClose={onClose} title={issue ? `Edit ${issue.key}` : "New issue"} wide>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" className="sm:col-span-2">
          <Input autoFocus value={f.title ?? ""} onChange={(e) => set("title", e.target.value)} placeholder="Short issue summary" />
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <Textarea rows={4} value={f.description ?? ""} onChange={(e) => set("description", e.target.value)} placeholder="Details, repro steps, acceptance criteria…" />
        </Field>
        <Field label="Project">
          <Select value={f.projectId ?? ""} onChange={(e) => set("projectId", e.target.value || null)}>
            <option value="">None</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Field label="Repository">
          <Input value={f.repository ?? ""} onChange={(e) => set("repository", e.target.value)} placeholder="org/repo" />
        </Field>
        <Field label="Type">
          <Select value={f.type} onChange={(e) => set("type", e.target.value)}>
            {ISSUE_TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
          </Select>
        </Field>
        <Field label="Priority">
          <Select value={f.priority} onChange={(e) => set("priority", e.target.value)}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{label(p)}</option>)}
          </Select>
        </Field>
        <Field label="Status">
          <Select value={f.status} onChange={(e) => set("status", e.target.value)}>
            {ISSUE_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
          </Select>
        </Field>
        <Field label="Assignee">
          <Input value={f.assignee ?? ""} onChange={(e) => set("assignee", e.target.value)} placeholder="Aarav Sharma" />
        </Field>
        <Field label="Start date">
          <Input type="date" value={f.startDate ?? ""} onChange={(e) => set("startDate", e.target.value)} />
        </Field>
        <Field label="Due date">
          <Input type="date" value={f.dueDate ?? todayYMD()} onChange={(e) => set("dueDate", e.target.value)} />
        </Field>
        <Field label="Estimated hours">
          <Input type="number" min="0" step="0.5" value={f.estimatedHours ?? ""} onChange={(e) => set("estimatedHours", e.target.value)} />
        </Field>
        <Field label="Actual hours">
          <Input type="number" min="0" step="0.5" value={f.actualHours ?? ""} onChange={(e) => set("actualHours", e.target.value)} />
        </Field>
        <Field label="Tags (comma separated)" className="sm:col-span-2">
          <Input value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="incident, p1" />
        </Field>
        <Field label="External ticket URL" className="sm:col-span-2">
          <Input value={f.externalUrl ?? ""} onChange={(e) => set("externalUrl", e.target.value)} placeholder="https://jira.acme.com/browse/…" />
        </Field>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="subtle" onClick={onClose}>Cancel</Button>
        <Button onClick={() => onSubmit({ ...f, tags: tagsText.split(",").map((t) => t.trim()).filter(Boolean) })}>
          {issue ? "Save changes" : "Create issue"}
        </Button>
      </div>
      {issue?.externalUrl && (
        <Link href={issue.externalUrl} target="_blank" className="mt-3 inline-flex items-center gap-1 text-[11px] text-indigo-500 hover:underline">
          <ExternalLink className="size-3" /> Open external ticket
        </Link>
      )}
    </Modal>
  );
}
