"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  ArrowLeft, CalendarDays, Clock3, ExternalLink, MessageSquarePlus, Pencil,
  AlertTriangle, Trash2, GitCommitHorizontal, History, Link2,
} from "lucide-react";
import { api } from "@/lib/client";
import { Badge, Button, Card, CardHeader, Empty, Skeleton, Spinner, Tag, Modal, Field, Input, Select, Textarea, Confirm } from "@/components/ui";
import { ISSUE_STATUSES, label } from "@/lib/domain";
import { humanize, inTz, isPastYMD, parseYMD } from "@/lib/dates";
import { differenceInHours, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

type Detail = {
  issue: {
    id: string; key: string; title: string; description: string | null; status: string; priority: string;
    type: string; assignee: string | null; reporter: string | null; startDate: string | null; dueDate: string | null;
    estimatedHours: string | null; actualHours: string | null; tags: string[] | null; externalUrl: string | null;
    repository: string | null; createdAt: string; updatedAt: string; resolvedAt: string | null; projectId: string | null;
  };
  comments: { id: string; author: string; body: string; createdAt: string }[];
  history: { id: string; fromStatus: string; toStatus: string; changedBy: string | null; changedAt: string }[];
  attachments: unknown[];
  workLogs: { id: string; workDate: string; hours: string; note: string | null }[];
  project: { id: string; name: string } | null;
  related: { id: string; key: string; title: string; status: string }[];
};

const TZ = "Asia/Kolkata";

export default function IssueDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [logNote, setLogNote] = useState("");
  const [logHours, setLogHours] = useState("");

  const load = useCallback(async () => {
    try { setD(await api.get<Detail>(`/api/issues/${id}`)); }
    catch (e) { setError(e instanceof Error ? e.message : "Not found"); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const timeline = useMemo(() => {
    if (!d) return [];
    const items = [
      ...d.comments.map((c) => ({ kind: "comment" as const, at: c.createdAt, c })),
      ...d.history.map((h) => ({ kind: "history" as const, at: h.changedAt, h })),
    ];
    return items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [d]);

  const setStatus = async (status: string) => {
    try {
      await api.patch(`/api/issues/${id}`, { status });
      toast.success(`Status → ${label(status)}`);
      load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  const addComment = async () => {
    if (!comment.trim()) return;
    setBusy(true);
    try {
      await api.post(`/api/issues/${id}/comments`, { body: comment });
      setComment(""); load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };

  const doDelete = async () => {
    try {
      await api.del(`/api/issues/${id}`);
      toast.success("Issue deleted");
      router.push("/issues");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  if (error) return <Empty title="Issue not found" hint={error} icon={<AlertTriangle className="size-5" />} action={<Link href="/issues"><Button size="sm">Back to issues</Button></Link>} />;
  if (!d) return <div className="space-y-3"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-56" /><Skeleton className="h-40" /></div>;

  const { issue } = d;
  const overdue = issue.dueDate && isPastYMD(issue.dueDate) && !["resolved", "closed"].includes(issue.status);
  const resolutionHours = issue.resolvedAt ? differenceInHours(new Date(issue.resolvedAt), new Date(issue.createdAt)) : null;

  return (
    <div className="space-y-4 animate-fade-in">
      {/* header */}
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/issues"><IconBtnLink><ArrowLeft className="size-4" /></IconBtnLink></Link>
        <span className="font-mono text-xs text-zinc-400">{issue.key}</span>
        <Badge value={issue.type} />
        <Badge value={issue.priority} />
        {overdue && <Tag tone="red"><AlertTriangle className="mr-1 inline size-3" />Overdue</Tag>}
        <div className="ml-auto flex items-center gap-2">
          {issue.externalUrl && (
            <a href={issue.externalUrl} target="_blank" rel="noreferrer">
              <Button size="sm" variant="outline"><ExternalLink className="size-3.5" /> External ticket</Button>
            </a>
          )}
          <Link href="/issues"><Button size="sm" variant="outline"><Pencil className="size-3.5" /> Edit in list</Button></Link>
          <Button size="sm" variant="danger" onClick={() => setConfirmDel(true)}><Trash2 className="size-3.5" /></Button>
        </div>
      </div>

      <h1 className="text-xl font-semibold tracking-tight">{issue.title}</h1>
      <p className="-mt-2 text-xs text-zinc-500">
        Opened {formatDistanceToNow(new Date(issue.createdAt), { addSuffix: true })} · Updated {inTz(issue.updatedAt, TZ)}
        {resolutionHours !== null && ` · Resolved in ${resolutionHours}h`}
      </p>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* main column */}
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="Description" />
            <div className="px-4 py-3 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300 whitespace-pre-wrap">
              {issue.description || <span className="text-zinc-400">No description provided.</span>}
            </div>
            {(issue.tags?.length ?? 0) > 0 && (
              <div className="flex gap-1.5 border-t border-zinc-100 px-4 py-3 dark:border-white/[0.06]">
                {issue.tags!.map((t) => <Tag key={t}>{t}</Tag>)}
              </div>
            )}
          </Card>

          {/* status transition */}
          <Card>
            <CardHeader title="Move status" subtitle="Changes persist immediately and are written to status history" />
            <div className="flex flex-wrap gap-1.5 p-3">
              {ISSUE_STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  disabled={s === issue.status}
                  className={cn(
                    "rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition-all",
                    s === issue.status
                      ? "border-indigo-500/40 bg-indigo-600/10 text-indigo-600 dark:text-indigo-300"
                      : "border-zinc-200 text-zinc-500 hover:border-indigo-400 hover:text-zinc-800 dark:border-white/[0.08] dark:hover:text-zinc-100",
                  )}
                >
                  {label(s)}
                </button>
              ))}
            </div>
          </Card>

          {/* timeline */}
          <Card>
            <CardHeader title="Activity & comments" subtitle={`${timeline.length} event(s)`} />
            <div className="divide-y divide-zinc-100 dark:divide-white/[0.05]">
              {timeline.map((t) => (
                <div key={t.at + t.kind + (t.kind === "comment" ? t.c.id : t.h.id)} className="flex gap-3 px-4 py-3">
                  <div className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-full",
                    t.kind === "comment" ? "bg-indigo-600/10 text-indigo-500" : "bg-zinc-100 text-zinc-500 dark:bg-white/[0.06] dark:text-zinc-400")}>
                    {t.kind === "comment" ? <MessageSquarePlus className="size-3.5" /> : <History className="size-3.5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    {t.kind === "comment" ? (
                      <>
                        <p className="text-[12px]"><span className="font-medium">{t.c.author}</span> <span className="text-zinc-400">· {inTz(t.c.createdAt, TZ)}</span></p>
                        <p className="mt-1 whitespace-pre-wrap text-[12.5px] leading-relaxed text-zinc-600 dark:text-zinc-300">{t.c.body}</p>
                      </>
                    ) : (
                      <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
                        <span className="font-medium text-zinc-700 dark:text-zinc-200">{t.h.changedBy ?? "Someone"}</span> moved status
                        {" "}{t.h.fromStatus === "none" ? "— created as" : `${label(t.h.fromStatus)} →`} <Badge value={t.h.toStatus} className="align-middle" />
                        <span className="ml-2 text-[10.5px]">{inTz(t.h.changedAt, TZ)}</span>
                      </p>
                    )}
                  </div>
                </div>
              ))}
              {!timeline.length && <p className="px-4 py-8 text-center text-xs text-zinc-400">No activity yet.</p>}
            </div>
            <div className="border-t border-zinc-100 p-3 dark:border-white/[0.06]">
              <Textarea rows={2} placeholder="Add a comment… (persisted)" value={comment} onChange={(e) => setComment(e.target.value)} />
              <div className="mt-2 flex justify-end">
                <Button size="sm" onClick={addComment} loading={busy}><MessageSquarePlus className="size-3.5" /> Comment</Button>
              </div>
            </div>
          </Card>
        </div>

        {/* sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader title="Details" />
            <dl className="space-y-2.5 px-4 py-3 text-[12.5px]">
              {[
                ["Status", <Badge key="s" value={issue.status} />],
                ["Project", d.project?.name ?? "—"],
                ["Repository", issue.repository ?? "—"],
                ["Assignee", issue.assignee ?? "—"],
                ["Reporter", issue.reporter ?? "—"],
                ["Start date", humanize(issue.startDate)],
                ["Due date", humanize(issue.dueDate)],
                ["Resolved", issue.resolvedAt ? inTz(issue.resolvedAt, TZ, { hour: undefined, minute: undefined }) : "—"],
              ].map(([k, v]) => (
                <div key={k as string} className="flex items-center justify-between gap-2">
                  <dt className="text-zinc-400">{k}</dt>
                  <dd className="text-right font-medium text-zinc-700 dark:text-zinc-200">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card>
            <CardHeader title="Time tracking" subtitle={`${issue.actualHours ?? "0"}h logged of ${issue.estimatedHours ?? "—"}h estimated`} />
            <div className="px-4 py-3">
              <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-white/[0.06]">
                <div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.min(100, (Number(issue.actualHours ?? 0) / Number(issue.estimatedHours || 1)) * 100)}%` }} />
              </div>
              <div className="space-y-1.5">
                {d.workLogs.map((w) => (
                  <div key={w.id} className="flex items-center justify-between text-[12px]">
                    <span className="text-zinc-500">{humanize(w.workDate)} · {w.note ?? ""}</span>
                    <span className="font-mono">{w.hours}h</span>
                  </div>
                ))}
                {!d.workLogs.length && <p className="text-xs text-zinc-400">No work logs — hours roll up from journals.</p>}
              </div>
              <div className="mt-3 flex gap-1.5">
                <Input className="h-8 w-20 text-xs" placeholder="hrs" value={logHours} onChange={(e) => setLogHours(e.target.value)} />
                <Input className="h-8 text-xs" placeholder="note" value={logNote} onChange={(e) => setLogNote(e.target.value)} />
                <Button size="sm" onClick={async () => {
                  const next = (Number(issue.actualHours ?? 0) + Number(logHours || 0)).toFixed(2);
                  await api.patch(`/api/issues/${id}`, { actualHours: next });
                  toast.success(`Logged ${logHours}h`);
                  setLogHours(""); setLogNote(""); load();
                }} disabled={!logHours.trim()}><Clock3 className="size-3.5" /></Button>
              </div>
            </div>
          </Card>

          {d.related.length > 0 && (
            <Card>
              <CardHeader title="Related issues" subtitle="Same project" />
              <div className="divide-y divide-zinc-100 dark:divide-white/[0.05]">
                {d.related.map((r) => (
                  <Link key={r.id} href={`/issues/${r.id}`} className="flex items-center gap-2 px-4 py-2 hover:bg-zinc-50 dark:hover:bg-white/[0.03]">
                    <span className="font-mono text-[10.5px] text-zinc-400">{r.key}</span>
                    <span className="min-w-0 flex-1 truncate text-[12px]">{r.title}</span>
                    <Badge value={r.status} />
                  </Link>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>

      <Confirm open={confirmDel} title="Delete this issue?" message={`${issue.key} will be soft-deleted. History is kept for audit.`} danger onCancel={() => setConfirmDel(false)} onConfirm={doDelete} />
    </div>
  );
}

function IconBtnLink({ children }: { children: React.ReactNode }) {
  return <span className="grid size-8 place-items-center rounded-lg border border-zinc-200 text-zinc-500 hover:bg-zinc-50 dark:border-white/[0.08] dark:hover:bg-white/[0.05]">{children}</span>;
}
