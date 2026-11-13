"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  Plus, Search, Star, Trash2, Pencil, Download, Upload, BookOpen, Code2,
  Terminal, Wrench, Network, FileText, Save, Eye, Link2,
} from "lucide-react";
import { api } from "@/lib/client";
import { Badge, Button, Card, CardHeader, Confirm, Empty, Field, IconButton, Input, Modal, PageHeader, Select, Skeleton, Tag, Textarea } from "@/components/ui";
import { inTz } from "@/lib/dates";
import { cn } from "@/lib/utils";

type DocSummary = {
  id: string; title: string; docType: string; category: string | null; tags: string[] | null;
  isFavorite: boolean; language: string | null; projectId: string | null; projectName: string | null;
  viewCount: number; version: number; updatedAt: string; excerpt: string;
};
type FullDoc = DocSummary & { body: string; relatedDocIds: string[] | null };
type Resp = {
  data: DocSummary[];
  facets: { total: number; favorites: number };
  categories: { category: string | null; n: number }[];
  tags: { tag: string; n: number }[];
};

const TYPES = ["note", "snippet", "command", "runbook", "architecture", "troubleshooting"];
const TYPE_META: Record<string, { label: string; icon: React.ElementType; tone: string }> = {
  note: { label: "Note", icon: FileText, tone: "text-sky-400" },
  snippet: { label: "Code Snippet", icon: Code2, tone: "text-violet-400" },
  command: { label: "Shell Command", icon: Terminal, tone: "text-emerald-400" },
  runbook: { label: "Runbook", icon: Wrench, tone: "text-amber-400" },
  architecture: { label: "Architecture", icon: Network, tone: "text-indigo-400" },
  troubleshooting: { label: "Troubleshooting", icon: Wrench, tone: "text-rose-400" },
};

export default function KnowledgePage() {
  const [d, setD] = useState<Resp | null>(null);
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [favOnly, setFavOnly] = useState(false);
  const [editor, setEditor] = useState<{ doc?: FullDoc } | null>(null);
  const [viewing, setViewing] = useState<FullDoc | null>(null);
  const [delId, setDelId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);

  const load = useCallback(async () => {
    const qs = new URLSearchParams();
    if (q) qs.set("q", q);
    if (typeFilter) qs.set("docType", typeFilter);
    if (tagFilter) qs.set("tag", tagFilter);
    if (favOnly) qs.set("favorites", "1");
    setD(await api.get<Resp>(`/api/knowledge?${qs}`));
  }, [q, typeFilter, tagFilter, favOnly]);

  useEffect(() => { const t = setTimeout(() => load().catch((e) => toast.error(e.message)), 200); return () => clearTimeout(t); }, [load]);
  useEffect(() => { api.get<{ id: string; name: string }[]>("/api/projects").then(setProjects).catch(() => {}); }, []);

  const openDoc = async (id: string) => {
    try {
      const r = await api.get<{ doc: FullDoc }>(`/api/knowledge?id=${id}`);
      setViewing(r.doc);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  const toggleFav = async (doc: DocSummary) => {
    setD((s) => s && { ...s, data: s.data.map((x) => x.id === doc.id ? { ...x, isFavorite: !x.isFavorite } : x) });
    try { await api.patch("/api/knowledge", { id: doc.id, isFavorite: !doc.isFavorite }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); load(); }
  };

  const exportAll = () => {
    if (!d?.data.length) { toast.error("Nothing to export"); return; }
    window.open("/api/reports?type=knowledge&format=csv");
  };

  const exportMarkdown = async (doc: FullDoc) => {
    const front = `---\ntitle: ${doc.title}\ntype: ${doc.docType}\ncategory: ${doc.category ?? ""}\ntags: ${(doc.tags ?? []).join(", ")}\n---\n\n`;
    const blob = new Blob([front + doc.body], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${doc.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.md`;
    a.click();
    toast.success("Markdown exported");
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader title="Knowledge Base" subtitle="Searchable technical notes, snippets, commands, runbooks and architecture docs"
        actions={
          <>
            <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}><Upload className="size-3.5" /> Import MD</Button>
            <Button size="sm" variant="outline" onClick={exportAll}><Download className="size-3.5" /> Export all</Button>
            <Button size="sm" onClick={() => setEditor({})}><Plus className="size-3.5" /> New document</Button>
          </>
        }
      />

      <Card className="flex flex-wrap items-center gap-2 p-2.5">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-zinc-400" />
          <Input className="h-8 pl-8 text-xs" placeholder="Full-text search title & body…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select className="h-8 w-auto text-xs" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">All types</option>
          {TYPES.map((t) => <option key={t} value={t}>{TYPE_META[t].label}</option>)}
        </Select>
        <Button size="sm" variant={favOnly ? "subtle" : "ghost"} onClick={() => setFavOnly((v) => !v)}>
          <Star className={cn("size-3.5", favOnly && "fill-amber-400 text-amber-400")} /> Favorites {d ? `(${d.facets.favorites})` : ""}
        </Button>
        {tagFilter && <Button size="xs" variant="outline" onClick={() => setTagFilter("")}>tag: {tagFilter} ✕</Button>}
        <span className="ml-auto text-[11px] text-zinc-400">{d?.facets.total ?? 0} document(s)</span>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[210px_1fr]">
        {/* facets */}
        <Card className="h-fit lg:sticky lg:top-[4.5rem]">
          <CardHeader title="Browse" />
          <div className="space-y-3 p-3">
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Categories</p>
              <div className="space-y-0.5">
                {d?.categories.map((c) => (
                  <button key={c.category} onClick={() => setQ(c.category ?? "")}
                    className="flex w-full items-center justify-between rounded px-1.5 py-1 text-[12px] text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/[0.05]">
                    <span className="truncate">{c.category}</span><span className="font-mono text-[10px] text-zinc-400">{c.n}</span>
                  </button>
                ))}
                {!d?.categories.length && <p className="text-[11px] text-zinc-400">No categories yet</p>}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Tags</p>
              <div className="flex flex-wrap gap-1">
                {d?.tags.map((t) => (
                  <button key={t.tag} onClick={() => setTagFilter(t.tag === tagFilter ? "" : t.tag)}
                    className={cn("rounded-md px-1.5 py-0.5 text-[10.5px] ring-1 ring-inset transition-colors",
                      tagFilter === t.tag ? "bg-indigo-600/15 text-indigo-600 ring-indigo-500/30 dark:text-indigo-300" : "bg-zinc-100 text-zinc-500 ring-transparent hover:text-zinc-800 dark:bg-white/[0.06] dark:text-zinc-400")}>
                    {t.tag} <span className="opacity-50">{t.n}</span>
                  </button>
                ))}
                {!d?.tags.length && <p className="text-[11px] text-zinc-400">No tags yet</p>}
              </div>
            </div>
          </div>
        </Card>

        {/* docs */}
        <div className="space-y-2">
          {!d && [...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
          {d && !d.data.length && (
            <Empty title="No documents" icon={<BookOpen className="size-5" />} hint="Capture a troubleshooting guide, shell command or architecture note."
              action={<Button size="sm" onClick={() => setEditor({})}><Plus className="size-3.5" /> New document</Button>} />
          )}
          {d?.data.map((doc) => {
            const meta = TYPE_META[doc.docType] ?? TYPE_META.note;
            const Icon = meta.icon;
            return (
              <Card key={doc.id} className="group p-3.5 transition-colors hover:border-indigo-500/30">
                <div className="flex items-start gap-3">
                  <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-zinc-100 dark:bg-white/[0.05]"><Icon className={cn("size-4", meta.tone)} /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <button onClick={() => openDoc(doc.id)} className="text-[13px] font-semibold hover:text-indigo-600 dark:hover:text-indigo-400">{doc.title}</button>
                      <Tag tone="zinc">{meta.label}</Tag>
                      {doc.category && <span className="text-[10.5px] text-zinc-400">{doc.category}</span>}
                      {doc.language && <Tag tone="violet">{doc.language}</Tag>}
                    </div>
                    <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-[11.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">{doc.excerpt}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {(doc.tags ?? []).map((t) => <span key={t} className="rounded bg-zinc-100 px-1.5 text-[10px] text-zinc-500 dark:bg-white/[0.06]">{t}</span>)}
                      {doc.projectName && <span className="inline-flex items-center gap-1 text-[10px] text-zinc-400"><Link2 className="size-2.5" />{doc.projectName}</span>}
                      <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-zinc-400"><Eye className="size-2.5" />{doc.viewCount} · v{doc.version} · {inTz(doc.updatedAt, "Asia/Kolkata", { hour: undefined, minute: undefined })}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    <IconButton className="size-7" onClick={() => toggleFav(doc)}>
                      <Star className={cn("size-3.5", doc.isFavorite && "fill-amber-400 text-amber-400")} />
                    </IconButton>
                    <IconButton className="size-7 opacity-0 group-hover:opacity-100" onClick={() => openDoc(doc.id).then(() => {})}><Eye className="size-3.5" /></IconButton>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* viewer */}
      {viewing && (
        <Modal open onClose={() => setViewing(null)} title={viewing.title} wide>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Tag tone="indigo">{TYPE_META[viewing.docType]?.label ?? viewing.docType}</Tag>
              {viewing.category && <Tag>{viewing.category}</Tag>}
              {(viewing.tags ?? []).map((t) => <Tag key={t} tone="zinc">{t}</Tag>)}
              <div className="ml-auto flex gap-1.5">
                <Button size="xs" variant="outline" onClick={() => exportMarkdown(viewing)}><Download className="size-3" /> .md</Button>
                <Button size="xs" variant="outline" onClick={() => { navigator.clipboard?.writeText(viewing.body); toast.success("Copied"); }}>Copy</Button>
                <Button size="xs" onClick={() => { setEditor({ doc: viewing }); setViewing(null); }}><Pencil className="size-3" /> Edit</Button>
                <Button size="xs" variant="danger" onClick={() => { setDelId(viewing.id); setViewing(null); }}><Trash2 className="size-3" /></Button>
              </div>
            </div>
            <pre className={cn("max-h-[55vh] overflow-auto whitespace-pre-wrap rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-[12px] leading-relaxed dark:border-white/[0.07] dark:bg-white/[0.03]",
              ["snippet", "command"].includes(viewing.docType) ? "font-mono" : "font-sans")}>
              {viewing.body || "(empty document)"}
            </pre>
            <p className="text-[10.5px] text-zinc-400">Version {viewing.version} · updated {inTz(viewing.updatedAt, "Asia/Kolkata")} · {viewing.viewCount} view(s)</p>
          </div>
        </Modal>
      )}

      {editor && <DocEditor doc={editor.doc} projects={projects} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); load(); }} />}
      {importOpen && <ImportModal onClose={() => setImportOpen(false)} onSaved={() => { setImportOpen(false); load(); }} />}
      <Confirm open={!!delId} title="Delete document?" message="The document will be soft-deleted and can be recovered from a backup snapshot." danger
        onCancel={() => setDelId(null)}
        onConfirm={async () => { try { await api.del("/api/knowledge", { id: delId }); toast.success("Deleted"); setDelId(null); load(); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } }} />
    </div>
  );
}

function DocEditor({ doc, projects, onClose, onSaved }: {
  doc?: FullDoc; projects: { id: string; name: string }[]; onClose: () => void; onSaved: () => void;
}) {
  const [f, setF] = useState<Record<string, unknown>>(doc ?? { docType: "note", body: "", category: "" });
  const [tags, setTags] = useState((doc?.tags ?? []).join(", "));
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: unknown) => setF((p) => ({ ...p, [k]: v }));
  const isCode = ["snippet", "command"].includes(String(f.docType));

  const save = async () => {
    setBusy(true);
    try {
      const payload = { ...f, tags: tags.split(",").map((t) => t.trim()).filter(Boolean) };
      if (doc) await api.patch("/api/knowledge", { id: doc.id, version: doc.version, ...payload });
      else await api.post("/api/knowledge", payload);
      toast.success(doc ? "Document saved" : "Document created");
      onSaved();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Save failed";
      toast.error(msg, { duration: msg.includes("Conflict") ? 6000 : 3000 });
    } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title={doc ? `Edit — v${doc.version}` : "New knowledge document"} wide>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" className="sm:col-span-2"><Input autoFocus value={(f.title as string) ?? ""} onChange={(e) => set("title", e.target.value)} /></Field>
        <Field label="Type">
          <Select value={(f.docType as string) ?? "note"} onChange={(e) => set("docType", e.target.value)}>
            {TYPES.map((t) => <option key={t} value={t}>{TYPE_META[t].label}</option>)}
          </Select>
        </Field>
        <Field label="Category"><Input value={(f.category as string) ?? ""} onChange={(e) => set("category", e.target.value)} placeholder="Databases, Kubernetes…" /></Field>
        {isCode && <Field label="Language"><Input value={(f.language as string) ?? ""} onChange={(e) => set("language", e.target.value)} placeholder="bash, go, sql" /></Field>}
        <Field label="Link to project" className={isCode ? "" : "sm:col-span-1"}>
          <Select value={(f.projectId as string) ?? ""} onChange={(e) => set("projectId", e.target.value || null)}>
            <option value="">None</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Field label="Tags (comma separated)" className="sm:col-span-2"><Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="postgres, performance" /></Field>
        <Field label={isCode ? "Code / command" : "Content (Markdown supported)"} className="sm:col-span-2">
          <Textarea rows={14} className={isCode ? "font-mono text-[12px]" : "text-[12.5px]"} value={(f.body as string) ?? ""} onChange={(e) => set("body", e.target.value)}
            placeholder={isCode ? "$ kubectl get pods -n prod" : "## Problem\n\n## Root cause\n\n## Fix"} />
        </Field>
      </div>
      <div className="mt-4 flex items-center justify-end gap-2">
        {doc && <span className="mr-auto text-[11px] text-zinc-400">Optimistic concurrency: saving from version {doc.version}</span>}
        <Button variant="subtle" onClick={onClose}>Cancel</Button>
        <Button loading={busy} disabled={!(f.title as string)?.trim()} onClick={save}><Save className="size-3.5" /> {doc ? "Save" : "Create"}</Button>
      </div>
    </Modal>
  );
}

function ImportModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  /** Splits a bundle on `# Heading` or `---` separators into individual docs. */
  const parse = () => {
    const chunks = text.split(/\n(?=# )/g).map((c) => c.trim()).filter(Boolean);
    return chunks.map((chunk) => {
      const lines = chunk.split("\n");
      const titleLine = lines[0].startsWith("# ") ? lines.shift()!.slice(2) : "Imported note";
      return { title: titleLine.trim(), body: lines.join("\n").trim(), docType: "note", category: "Imported", tags: ["imported"] };
    });
  };

  return (
    <Modal open onClose={onClose} title="Import Markdown documents" wide>
      <div className="space-y-3">
        <p className="text-xs text-zinc-500">
          Paste one or more Markdown documents. Each top-level <code className="font-mono">#&nbsp;Heading</code> starts a new document.
          Everything is stored in PostgreSQL and becomes searchable immediately.
        </p>
        <Textarea rows={12} className="font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)}
          placeholder={"# Postgres index bloat\n\nCheck with pgstattuple…\n\n# Kubectl cheatsheet\n\nkubectl get pods -A"} />
        <div className="flex items-center justify-end gap-2">
          <span className="mr-auto text-[11px] text-zinc-400">{parse().length} document(s) detected</span>
          <Button variant="subtle" onClick={onClose}>Cancel</Button>
          <Button loading={busy} disabled={!parse().length} onClick={async () => {
            setBusy(true);
            try {
              const r = await api.post<{ imported: number }>("/api/knowledge", { import: parse() });
              toast.success(`${r.imported} document(s) imported`);
              onSaved();
            } catch (e) { toast.error(e instanceof Error ? e.message : "Import failed"); }
            finally { setBusy(false); }
          }}><Upload className="size-3.5" /> Import</Button>
        </div>
      </div>
    </Modal>
  );
}
