"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { GitBranchIcon, RefreshCw, Plus, Unplug, ExternalLink, GitCommitHorizontal, GitPullRequest, GitMerge, Eye, CircleDot } from "lucide-react";
import { api } from "@/lib/client";
import { Badge, Button, Card, CardHeader, Empty, Field, Input, Modal, PageHeader, Select, Skeleton, Tag, Confirm } from "@/components/ui";
import { WeekBars } from "@/components/charts";
import { humanize } from "@/lib/dates";
import { label } from "@/lib/domain";

type Activity = { id: string; activityDate: string; type: string; title: string; repo: string | null; url: string | null; count: number; manual: boolean };
type Resp = {
  connection: { username: string | null; status: string; lastSyncAt: string | null; hasToken: boolean } | null;
  stats: Record<string, number>;
  byRepo: { name: string; value: number }[];
  commitTrend: { week: string; value: number }[];
  recent: Activity[];
  note: string;
};

const TYPE_ICON: Record<string, React.ElementType> = {
  commit: GitCommitHorizontal, pr_opened: GitPullRequest, pr_merged: GitMerge, pr_review: Eye, issue: CircleDot,
};

export default function ActivityPage() {
  const [d, setD] = useState<Resp | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [unplugOpen, setUnplugOpen] = useState(false);

  const load = useCallback(async () => setD(await api.get<Resp>("/api/github")), []);
  useEffect(() => { load().catch((e) => toast.error(e.message)); }, [load]);

  const sync = async () => {
    setSyncing(true);
    try {
      const r = await api.post<{ imported: number; totalEvents: number }>("/api/github", { op: "sync" });
      toast.success(`Synced — ${r.imported} new item(s) from GitHub`);
      load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Sync failed"); }
    finally { setSyncing(false); }
  };

  const connected = !!d?.connection?.username && d.connection.status !== "disconnected";

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader
        title="Developer Activity"
        subtitle="GitHub signals — optional, read-only, and never interpreted as performance scoring"
        actions={
          <>
            {connected && <Button size="sm" variant="outline" onClick={sync} loading={syncing}><RefreshCw className="size-3.5" /> Sync GitHub</Button>}
            <Button size="sm" variant="outline" onClick={() => setManualOpen(true)}><Plus className="size-3.5" /> Manual entry</Button>
            {connected
              ? <Button size="sm" variant="ghost" onClick={() => setUnplugOpen(true)}><Unplug className="size-3.5 text-red-400" /> Disconnect</Button>
              : <Button size="sm" onClick={() => setConnectOpen(true)}><GitBranchIcon className="size-3.5" /> Connect GitHub</Button>}
          </>
        }
      />

      {/* stats */}
      {!d ? (
        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {[
            ["Commits (7d)", d.stats.commitsThisWeek], ["Commits (30d)", d.stats.commitsThisMonth],
            ["PRs opened", d.stats.prsOpened], ["PRs merged", d.stats.prsMerged],
            ["Reviews", d.stats.reviews], ["Issues", d.stats.issuesInteracted],
          ].map(([labelS, v]) => (
            <Card key={labelS as string} className="p-3.5">
              <p className="text-[11px] text-zinc-400">{labelS}</p>
              <p className="mt-1 font-mono text-2xl font-bold">{v}</p>
            </Card>
          ))}
        </div>
      )}

      {d && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title="Weekly commits" subtitle="Push events imported from GitHub + manual entries" />
            <div className="p-4">
              {d.commitTrend.length ? <WeekBars data={d.commitTrend} color="#8b5cf6" /> : (
                <Empty title="No commit history yet" icon={<GitCommitHorizontal className="size-5" />}
                  hint={connected ? "Hit Sync GitHub to import your recent public events." : "Connect GitHub or add manual entries for work that isn't in GitHub."}
                  action={connected ? undefined : <Button size="sm" onClick={() => setConnectOpen(true)}><GitBranchIcon className="size-3.5" /> Connect GitHub</Button>} />
              )}
            </div>
          </Card>
          <Card>
            <CardHeader title="Repository activity" subtitle="All-time in this workspace" />
            <div className="space-y-2.5 p-4">
              {d.byRepo.map((r) => (
                <div key={r.name}>
                  <div className="mb-1 flex justify-between text-[11.5px]"><span className="font-mono">{r.name}</span><span className="font-mono text-zinc-400">{r.value}</span></div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-white/[0.06]">
                    <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500" style={{ width: `${Math.min(100, r.value * 6)}%` }} />
                  </div>
                </div>
              ))}
              {!d.byRepo.length && <p className="text-xs text-zinc-400">No repository data yet.</p>}
            </div>
          </Card>

          <Card className="lg:col-span-3">
            <CardHeader title="Activity feed" subtitle={`${d.recent.length} records${d.stats.manualCount ? ` · ${d.stats.manualCount} manual` : ""}`} />
            <div className="max-h-[420px] divide-y divide-zinc-100 overflow-y-auto dark:divide-white/[0.05]">
              {d.recent.map((a) => {
                const Icon = TYPE_ICON[a.type] ?? GitCommitHorizontal;
                return (
                  <div key={a.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-zinc-100 dark:bg-white/[0.05]">
                      <Icon className="size-3.5 text-zinc-500 dark:text-zinc-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-medium">{a.title}</p>
                      <p className="text-[10.5px] text-zinc-400">{humanize(a.activityDate)}{a.repo ? ` · ${a.repo}` : ""}</p>
                    </div>
                    {a.count > 1 && <span className="font-mono text-[11px] text-zinc-400">×{a.count}</span>}
                    {a.manual && <Tag>manual</Tag>}
                    {a.url && <a href={a.url} target="_blank" rel="noreferrer"><ExternalLink className="size-3.5 text-zinc-400 hover:text-indigo-500" /></a>}
                  </div>
                );
              })}
              {!d.recent.length && <p className="px-4 py-10 text-center text-xs text-zinc-400">Empty — connect GitHub or add your first manual entry.</p>}
            </div>
          </Card>
        </div>
      )}

      {/* Connect modal */}
      <Modal open={connectOpen} onClose={() => setConnectOpen(false)} title="Connect GitHub">
        <ConnectForm onSaved={() => { setConnectOpen(false); load(); }} />
      </Modal>

      {/* Manual entry */}
      <Modal open={manualOpen} onClose={() => setManualOpen(false)} title="Manual activity entry">
        <ManualForm onSaved={() => { setManualOpen(false); load(); }} />
      </Modal>

      <Confirm open={unplugOpen} title="Disconnect GitHub?" message="Your token is discarded server-side. Imported history is kept (delete individual rows later if needed)." danger
        onCancel={() => setUnplugOpen(false)}
        onConfirm={async () => {
          try { await api.del("/api/github"); toast.success("Disconnected"); setUnplugOpen(false); load(); }
          catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
        }} />

      {d?.connection?.status === "pending" && (
        <p className="text-[11px] text-amber-500">Profile saved but could not be verified online yet — sync will retry against the network.</p>
      )}
      {connected && d?.connection?.lastSyncAt && (
        <p className="text-[11px] text-zinc-400">Connected as @{d.connection.username}{d.connection.hasToken ? " (PAT stored server-side)" : " (public feed only)"} · last sync {new Date(d.connection.lastSyncAt).toLocaleString("en-GB", { timeZone: "Asia/Kolkata" })}</p>
      )}
    </div>
  );
}

function ConnectForm({ onSaved }: { onSaved: () => void }) {
  const [username, setUsername] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-4">
      <Field label="GitHub username"><Input autoFocus value={username} onChange={(e) => setUsername(e.target.value)} placeholder="aarav-sharma" /></Field>
      <Field label="Personal access token (optional)" hint="Read-only scopes recommended (read:user, public_repo). Stored server-side only, never sent to the browser.">
        <Input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="ghp_…" />
      </Field>
      <p className="rounded-lg bg-zinc-50 p-3 text-[11.5px] leading-relaxed text-zinc-500 dark:bg-white/[0.04]">
        Integration is <b>read-only</b>: Employee 360 imports public event feeds (pushes, PRs, reviews) and never writes to your repositories.
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="subtle" onClick={onSaved}>Cancel</Button>
        <Button loading={busy} disabled={!username.trim()} onClick={async () => {
          setBusy(true);
          try {
            const r = await api.put<{ verified: boolean; message: string }>("/api/github", { username, token: token || undefined });
            toast.success(r.verified ? "GitHub connected" : r.message, { duration: 4000 });
            onSaved();
          } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
          finally { setBusy(false); }
        }}><GitBranchIcon className="size-3.5" /> Connect</Button>
      </div>
    </div>
  );
}

function ManualForm({ onSaved }: { onSaved: () => void }) {
  const [f, setF] = useState({ type: "commit", title: "", repo: "", activityDate: new Date().toISOString().slice(0, 10), count: "1", url: "" });
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-4">
      <p className="text-[11.5px] text-zinc-500">Record activity that GitHub can't see: internal mirrors, code reviews on other tools, design work…</p>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Type">
          <Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
            {["commit", "pr_opened", "pr_merged", "pr_review", "issue"].map((t) => <option key={t} value={t}>{label(t)}</option>)}
          </Select>
        </Field>
        <Field label="Date"><Input type="date" value={f.activityDate} onChange={(e) => setF({ ...f, activityDate: e.target.value })} /></Field>
      </div>
      <Field label="Title"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Reviewed billing migration PR on GitLab" /></Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Repository / project"><Input value={f.repo} onChange={(e) => setF({ ...f, repo: e.target.value })} placeholder="acme/nova-billing" /></Field>
        <Field label="Count"><Input type="number" min="1" value={f.count} onChange={(e) => setF({ ...f, count: e.target.value })} /></Field>
      </div>
      <Field label="Link (optional)"><Input value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://…" /></Field>
      <div className="flex justify-end gap-2">
        <Button variant="subtle" onClick={onSaved}>Cancel</Button>
        <Button loading={busy} disabled={!f.title.trim()} onClick={async () => {
          setBusy(true);
          try { await api.post("/api/github", { op: "manual", ...f }); toast.success("Entry recorded"); onSaved(); }
          catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
          finally { setBusy(false); }
        }}>Add entry</Button>
      </div>
    </div>
  );
}
