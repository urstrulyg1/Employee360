"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  Cloud, CloudOff, RefreshCw, Database, ShieldCheck, HardDriveDownload,
  History, AlertTriangle, CheckCircle2, Laptop, Save, Undo2,
} from "lucide-react";
import { api } from "@/lib/client";
import { Button, Card, CardHeader, Confirm, Empty, Input, PageHeader, Skeleton, Tag } from "@/components/ui";
import { inTz } from "@/lib/dates";
import { cn } from "@/lib/utils";

type Device = { id: string; deviceId: string; deviceLabel: string | null; lastSyncAt: string | null; status: string; pendingOps: number; conflictCount: number; lastError: string | null };
type Backup = { id: string; label: string; recordCount: number; sizeBytes: number; checksum: string; verifiedAt: string | null; verifyResult: string | null; createdAt: string };
type SyncResp = {
  state: Device | null;
  devices: Device[];
  changes: { issues: number; tasks: number; knowledge: number; meetings: number; total: number };
  syncedTables: string[];
  backups: Backup[];
  serverTime: string;
};

const DEVICE_ID_KEY = "e360-device-id";
const CACHE_KEY = "e360-offline-cache";

function deviceId() {
  if (typeof window === "undefined") return "web-default";
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) { id = "web-" + Math.random().toString(36).slice(2, 10); localStorage.setItem(DEVICE_ID_KEY, id); }
  return id;
}

export default function SyncPage() {
  const [d, setD] = useState<SyncResp | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [cacheInfo, setCacheInfo] = useState<{ at: string; counts: Record<string, number> } | null>(null);
  const [label, setLabel] = useState("");
  const [restoreId, setRestoreId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setD(await api.get<SyncResp>(`/api/sync?deviceId=${deviceId()}`));
  }, []);

  useEffect(() => {
    load().catch((e) => toast.error(e.message));
    setOnline(navigator.onLine);
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) { const c = JSON.parse(raw); setCacheInfo({ at: c.pulledAt, counts: c.counts }); }
    } catch { /* ignore malformed cache */ }
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, [load]);

  // background sync every 60s while the tab is open and online
  useEffect(() => {
    const t = setInterval(() => { if (navigator.onLine) load().catch(() => {}); }, 60000);
    return () => clearInterval(t);
  }, [load]);

  const pull = async () => {
    setBusy("pull");
    try {
      const r = await api.post<{ pulledAt: string; counts: Record<string, number>; checksum: string; data: unknown }>("/api/sync", { op: "pull", deviceId: deviceId() });
      localStorage.setItem(CACHE_KEY, JSON.stringify({ pulledAt: r.pulledAt, counts: r.counts, checksum: r.checksum, data: r.data }));
      setCacheInfo({ at: r.pulledAt, counts: r.counts });
      toast.success(`Cached ${Object.values(r.counts).reduce((a, b) => a + b, 0)} record(s) for offline use`);
      load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Sync failed"); }
    finally { setBusy(null); }
  };

  const backup = async () => {
    setBusy("backup");
    try {
      const r = await api.post<{ backup: Backup }>("/api/sync", { op: "backup", label: label || undefined });
      toast.success(`Backup created — ${r.backup.recordCount} records, checksum verified`);
      setLabel(""); load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Backup failed"); }
    finally { setBusy(null); }
  };

  const verify = async (id: string) => {
    setBusy(id);
    try {
      const r = await api.post<{ verified: boolean }>("/api/sync", { op: "verify", backupId: id });
      r.verified ? toast.success("Checksum matches — backup is intact") : toast.error("Checksum mismatch — backup is corrupt");
      load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Verify failed"); }
    finally { setBusy(null); }
  };

  const restore = async () => {
    if (!restoreId) return;
    setBusy(restoreId);
    try {
      const r = await api.post<{ restored: number; scanned: number }>("/api/sync", { op: "restore", backupId: restoreId });
      toast.success(`Restore complete — ${r.restored} of ${r.scanned} document(s) recovered`);
      setRestoreId(null); load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Restore failed"); }
    finally { setBusy(null); }
  };

  /** Demonstrates conflict detection: pushes a deliberately stale version. */
  const testConflict = async () => {
    setBusy("conflict");
    try {
      const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || "null") as { data?: { knowledgeDocs?: { id: string; version: number; title: string }[] } } | null;
      const doc = cache?.data?.knowledgeDocs?.[0];
      if (!doc) { toast.error("Pull to cache first, then retry."); return; }
      const res = await fetch("/api/sync", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "push", deviceId: deviceId(), changes: [{ table: "knowledge_docs", id: doc.id, version: 0, fields: { title: doc.title } }] }),
      });
      const json = await res.json();
      if (res.status === 409) toast.success(`Conflict correctly detected: server v${json.conflicts?.[0]?.serverVersion} vs client v0 — write rejected`, { duration: 6000 });
      else toast(`Push applied ${json.applied} change(s)`);
      load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(null); }
  };

  const statusTone = !online ? "amber" : d?.state?.status === "conflict" ? "red" : "emerald";

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader
        title="Cloud Sync & Backup"
        subtitle="PostgreSQL is the authoritative replica — clients sync with optimistic concurrency"
        actions={
          <>
            <Button size="sm" variant="outline" onClick={pull} loading={busy === "pull"}><RefreshCw className="size-3.5" /> Sync now</Button>
            <Button size="sm" onClick={backup} loading={busy === "backup"}><Save className="size-3.5" /> Create backup</Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-zinc-400">Connection</p>
            {online ? <Cloud className="size-3.5 text-emerald-400" /> : <CloudOff className="size-3.5 text-amber-400" />}
          </div>
          <p className={cn("mt-1 text-lg font-semibold", online ? "text-emerald-500" : "text-amber-500")}>{online ? "Online" : "Offline"}</p>
          <p className="text-[10.5px] text-zinc-500">{online ? "Background sync every 60s" : "Working from local cache"}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between"><p className="text-[11px] text-zinc-400">Sync status</p><RefreshCw className="size-3.5 text-indigo-400" /></div>
          <p className="mt-1 text-lg font-semibold capitalize">{d?.state?.status ?? "—"}</p>
          <p className="text-[10.5px] text-zinc-500">{d?.state?.lastSyncAt ? `Last: ${inTz(d.state.lastSyncAt, "Asia/Kolkata")}` : "Never synced from this device"}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between"><p className="text-[11px] text-zinc-400">Server changes</p><Database className="size-3.5 text-violet-400" /></div>
          <p className="mt-1 font-mono text-xl font-bold">{d?.changes.total ?? 0}</p>
          <p className="text-[10.5px] text-zinc-500">since last cursor</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-zinc-400">Conflicts</p>
            <AlertTriangle className={cn("size-3.5", (d?.state?.conflictCount ?? 0) > 0 ? "text-red-500" : "text-zinc-400")} />
          </div>
          <p className={cn("mt-1 font-mono text-xl font-bold", (d?.state?.conflictCount ?? 0) > 0 && "text-red-500")}>{d?.state?.conflictCount ?? 0}</p>
          <p className="text-[10.5px] text-zinc-500">{d?.state?.lastError ?? "No unresolved conflicts"}</p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Offline cache" subtitle="Secure local snapshot used when the network is unavailable" />
          <div className="space-y-3 p-4">
            {cacheInfo ? (
              <>
                <div className="flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.07] px-3 py-2">
                  <CheckCircle2 className="size-4 text-emerald-500" />
                  <span className="text-[12.5px] text-emerald-700 dark:text-emerald-400">
                    Cached {Object.values(cacheInfo.counts).reduce((a, b) => a + b, 0)} record(s) at {inTz(cacheInfo.at, "Asia/Kolkata")}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {Object.entries(cacheInfo.counts).map(([k, v]) => (
                    <div key={k} className="rounded-lg bg-zinc-50 p-2 text-center dark:bg-white/[0.04]">
                      <p className="font-mono text-sm font-bold">{v}</p><p className="text-[10px] capitalize text-zinc-400">{k}</p>
                    </div>
                  ))}
                </div>
              </>
            ) : <Empty title="No local cache" hint="Run “Sync now” to download your records for offline access." />}
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={pull} loading={busy === "pull"}><HardDriveDownload className="size-3.5" /> Refresh cache</Button>
              <Button size="sm" variant="ghost" onClick={() => { localStorage.removeItem(CACHE_KEY); setCacheInfo(null); toast.success("Local cache cleared"); }}>Clear cache</Button>
            </div>
            <p className="text-[11px] leading-relaxed text-zinc-400">
              Synced tables: {d?.syncedTables.join(", ")}. Each record carries a <code className="font-mono">version</code>;
              pushing a stale version returns HTTP 409 instead of overwriting newer server data.
            </p>
            <Button size="xs" variant="outline" onClick={testConflict} loading={busy === "conflict"}>
              <AlertTriangle className="size-3" /> Test conflict detection
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader title="Devices" subtitle="Sync state per client" />
          <div className="divide-y divide-zinc-100 dark:divide-white/[0.05]">
            {d?.devices.map((dev) => (
              <div key={dev.id} className="flex items-center gap-3 px-4 py-2.5">
                <Laptop className="size-4 shrink-0 text-zinc-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-medium">{dev.deviceLabel ?? dev.deviceId}{dev.deviceId === deviceId() && <span className="ml-1.5 text-[10px] text-indigo-500">(this device)</span>}</p>
                  <p className="text-[10.5px] text-zinc-400">{dev.lastSyncAt ? inTz(dev.lastSyncAt, "Asia/Kolkata") : "never"}</p>
                </div>
                <Tag tone={dev.status === "conflict" ? "red" : dev.status === "error" ? "orange" : "emerald"}>{dev.status}</Tag>
              </div>
            ))}
            {!d?.devices.length && <p className="px-4 py-8 text-center text-xs text-zinc-400">No devices registered yet.</p>}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Backups"
          subtitle="Checksum-verified snapshots (SHA-256). Restore is non-destructive."
          action={<Input className="h-8 w-48 text-xs" placeholder="Backup label…" value={label} onChange={(e) => setLabel(e.target.value)} />}
        />
        {d?.backups.length ? (
          <div className="divide-y divide-zinc-100 dark:divide-white/[0.05]">
            {d.backups.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <ShieldCheck className={cn("size-4 shrink-0", b.verifyResult === "verified" ? "text-emerald-500" : b.verifyResult === "corrupt" ? "text-red-500" : "text-zinc-400")} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-medium">{b.label}</p>
                  <p className="text-[10.5px] text-zinc-400">
                    {b.recordCount} records · {(b.sizeBytes / 1024).toFixed(1)} KB · sha256 {b.checksum.slice(0, 12)}… · {inTz(b.createdAt, "Asia/Kolkata")}
                  </p>
                </div>
                <Tag tone={b.verifyResult === "verified" ? "emerald" : b.verifyResult === "corrupt" ? "red" : "zinc"}>{b.verifyResult ?? "unverified"}</Tag>
                <Button size="xs" variant="outline" loading={busy === b.id} onClick={() => verify(b.id)}><ShieldCheck className="size-3" /> Verify</Button>
                <Button size="xs" variant="outline" onClick={() => setRestoreId(b.id)}><Undo2 className="size-3" /> Restore</Button>
              </div>
            ))}
          </div>
        ) : <div className="p-4"><Empty title="No backups yet" icon={<History className="size-5" />} hint="Create a verified snapshot of your workspace data." /></div>}
      </Card>

      <Confirm
        open={!!restoreId}
        title="Restore from this backup?"
        message="The checksum is verified first. Restore is non-destructive: it only re-creates knowledge documents that are missing or were deleted. Existing records are never overwritten."
        onCancel={() => setRestoreId(null)}
        onConfirm={restore}
      />
    </div>
  );
}
