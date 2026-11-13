"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { Plus, FolderGit2, ArrowUpRight, Trash2, ExternalLink, Target } from "lucide-react";
import { api } from "@/lib/client";
import { Badge, Button, Card, CardHeader, Confirm, Empty, Field, Input, Modal, PageHeader, Select, Skeleton, Tag, Textarea } from "@/components/ui";
import { humanize, daysUntil } from "@/lib/dates";
import { cn } from "@/lib/utils";

type Project = {
  id: string; name: string; key: string; description: string | null; repoUrl: string | null;
  owner: string | null; status: string; startDate: string | null; targetDate: string | null;
  technologies: string[] | null; notes: string | null;
  issueTotal: number; issueOpen: number; taskTotal: number; taskDone: number;
};

export default function ProjectsPage() {
  return <Suspense fallback={<Skeleton className="h-96" />}><Projects /></Suspense>;
}

function Projects() {
  const params = useSearchParams();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [modal, setModal] = useState<{ project?: Project } | null>(null);
  const [detail, setDetail] = useState<string | null>(params.get("open"));
  const [delId, setDelId] = useState<string | null>(null);

  const load = useCallback(async () => setProjects(await api.get<Project[]>("/api/projects")), []);
  useEffect(() => { load().catch((e) => toast.error(e.message)); }, [load]);

  const save = async (form: Record<string, unknown>, id?: string) => {
    try {
      if (id) await api.patch(`/api/projects/${id}`, form);
      else await api.post("/api/projects", form);
      toast.success(id ? "Project updated" : "Project created");
      setModal(null); load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader title="Projects" subtitle="Repository-linked workstreams with live issue and task rollups"
        actions={
          <>
            <Button size="sm" variant="outline" onClick={() => window.open("/api/reports?type=projects&format=csv")}>Export CSV</Button>
            <Button size="sm" onClick={() => setModal({})}><Plus className="size-3.5" /> New project</Button>
          </>
        }
      />

      {!projects && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-44" />)}</div>}

      {projects && !projects.length && (
        <Empty title="No projects yet" icon={<FolderGit2 className="size-5" />} hint="Create a project to group issues, tasks and repositories."
          action={<Button size="sm" onClick={() => setModal({})}><Plus className="size-3.5" /> New project</Button>} />
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {projects?.map((p) => {
          const doneRatio = p.issueTotal + p.taskTotal === 0 ? 0 : Math.round(((p.issueTotal - p.issueOpen) + p.taskDone) / (p.issueTotal + p.taskTotal) * 100);
          return (
            <Card key={p.id} className="group cursor-pointer transition-all hover:-translate-y-0.5 hover:border-indigo-500/30 hover:shadow-lg" onClick={() => setDetail(p.id)}>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="grid size-9 place-items-center rounded-lg bg-indigo-600/10 font-mono text-[10.5px] font-bold text-indigo-500">{p.key}</div>
                    <div>
                      <p className="text-[13.5px] font-semibold leading-tight">{p.name}</p>
                      <p className="text-[11px] text-zinc-400">{p.owner ?? "Unassigned owner"}</p>
                    </div>
                  </div>
                  <Badge value={p.status} />
                </div>
                <p className="mt-3 line-clamp-2 min-h-[32px] text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">{p.description ?? "No description"}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(p.technologies ?? []).slice(0, 4).map((t) => <Tag key={t} tone="indigo">{t}</Tag>)}
                </div>
                <div className="mt-4">
                  <div className="mb-1 flex justify-between text-[11px] text-zinc-400">
                    <span>{p.issueOpen} open issue(s)</span><span>{doneRatio}% items closed</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-white/[0.06]">
                    <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400" style={{ width: `${doneRatio}%` }} />
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between text-[11px] text-zinc-400">
                  {p.targetDate ? <span className={cn("font-mono", daysUntil(p.targetDate) < 14 && p.status === "active" && "text-amber-500")}>
                    <Target className="mb-0.5 mr-1 inline size-3" />{humanize(p.targetDate)} · {daysUntil(p.targetDate)}d
                  </span> : <span />}
                  <ArrowUpRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {modal && (
        <ProjectForm project={modal.project} onClose={() => setModal(null)} onSubmit={save} />
      )}
      {detail && <ProjectDetail id={detail} onClose={() => setDetail(null)} onDelete={(id) => setDelId(id)} />}
      <Confirm open={!!delId} title="Delete project?" message="The project will be soft-deleted. Linked issues keep their history." danger onCancel={() => setDelId(null)}
        onConfirm={async () => { try { await api.del(`/api/projects/${delId}`); toast.success("Project deleted"); setDelId(null); load(); } catch (e) { toast.error(e instanceof Error ? e.message : "Delete failed"); } }} />
    </div>
  );
}

function ProjectDetail({ id, onClose, onDelete }: { id: string; onClose: () => void; onDelete: (id: string) => void }) {
  const [d, setD] = useState<{ project: Project; issues: { id: string; key: string; title: string; status: string; priority: string }[]; tasks: { id: string; title: string; status: string; dueDate: string | null }[]; repositories: { name: string; url: string }[] } | null>(null);
  useEffect(() => { api.get<typeof d>(`/api/projects/${id}`).then((r) => setD(r)).catch((e) => toast.error(e.message)); }, [id]);

  return (
    <Modal open onClose={onClose} title={d ? d.project.name : "Project"} wide>
      {!d ? <div className="space-y-2"><Skeleton className="h-8 w-1/2" /><Skeleton className="h-40" /></div> : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge value={d.project.status} />
            {d.project.repoUrl && (
              <a href={d.project.repoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11.5px] text-indigo-500 hover:underline">
                <ExternalLink className="size-3" /> {d.project.repoUrl.replace("https://", "")}
              </a>
            )}
            <Button size="xs" variant="danger" className="ml-auto" onClick={() => { onDelete(d.project.id); onClose(); }}><Trash2 className="size-3" /> Delete</Button>
          </div>
          <p className="text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300">{d.project.description}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400">Issues ({d.issues.length})</p>
              <div className="space-y-1">
                {d.issues.slice(0, 6).map((i) => (
                  <Link key={i.id} href={`/issues/${i.id}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] hover:bg-zinc-50 dark:hover:bg-white/[0.04]">
                    <span className="font-mono text-[10.5px] text-zinc-400">{i.key}</span>
                    <span className="min-w-0 flex-1 truncate">{i.title}</span>
                    <Badge value={i.status} />
                  </Link>
                ))}
                {!d.issues.length && <p className="text-xs text-zinc-400">No issues linked.</p>}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400">Tasks ({d.tasks.length})</p>
              <div className="space-y-1">
                {d.tasks.slice(0, 6).map((t) => (
                  <div key={t.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12px]">
                    <Badge value={t.status} />
                    <span className="min-w-0 flex-1 truncate">{t.title}</span>
                    <span className="font-mono text-[10.5px] text-zinc-400">{humanize(t.dueDate)}</span>
                  </div>
                ))}
                {!d.tasks.length && <p className="text-xs text-zinc-400">No tasks linked.</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

function ProjectForm({ project, onClose, onSubmit }: { project?: Project; onClose: () => void; onSubmit: (f: Record<string, unknown>, id?: string) => void }) {
  const [f, setF] = useState<Record<string, unknown>>(project ?? { status: "active" });
  const [tech, setTech] = useState((project?.technologies ?? []).join(", "));
  const set = (k: string, v: unknown) => setF((p) => ({ ...p, [k]: v }));

  return (
    <Modal open onClose={onClose} title={project ? "Edit project" : "New project"} wide>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Project name">
          <Input autoFocus value={(f.name as string) ?? ""} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="Key">
          <Input value={(f.key as string) ?? ""} onChange={(e) => set("key", e.target.value.toUpperCase())} maxLength={6} placeholder="ORN" />
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <Textarea rows={3} value={(f.description as string) ?? ""} onChange={(e) => set("description", e.target.value)} />
        </Field>
        <Field label="Repository URL">
          <Input value={(f.repoUrl as string) ?? ""} onChange={(e) => set("repoUrl", e.target.value)} placeholder="https://github.com/org/repo" />
        </Field>
        <Field label="Owner">
          <Input value={(f.owner as string) ?? ""} onChange={(e) => set("owner", e.target.value)} />
        </Field>
        <Field label="Status">
          <Select value={(f.status as string) ?? "active"} onChange={(e) => set("status", e.target.value)}>
            {["active", "on_hold", "completed", "archived"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
          </Select>
        </Field>
        <Field label="Technologies (comma separated)">
          <Input value={tech} onChange={(e) => setTech(e.target.value)} placeholder="Go, PostgreSQL" />
        </Field>
        <Field label="Start date">
          <Input type="date" value={(f.startDate as string) ?? ""} onChange={(e) => set("startDate", e.target.value)} />
        </Field>
        <Field label="Target completion">
          <Input type="date" value={(f.targetDate as string) ?? ""} onChange={(e) => set("targetDate", e.target.value)} />
        </Field>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="subtle" onClick={onClose}>Cancel</Button>
        <Button onClick={() => onSubmit({ ...f, technologies: tech.split(",").map((t) => t.trim()).filter(Boolean) }, project?.id)}>
          {project ? "Save" : "Create project"}
        </Button>
      </div>
    </Modal>
  );
}
