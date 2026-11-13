"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { BellRing, CheckCheck, Eraser, BellOff } from "lucide-react";
import { api } from "@/lib/client";
import { Badge, Button, Card, Empty, PageHeader, Skeleton } from "@/components/ui";
import { inTz } from "@/lib/dates";
import { cn } from "@/lib/utils";

type Notif = { id: string; title: string; message: string; category: string; isRead: boolean; createdAt: string };

export default function NotificationsPage() {
  const [items, setItems] = useState<Notif[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const load = useCallback(async () => {
    const r = await api.get<{ data: Notif[]; unread: number }>("/api/notifications");
    setItems(r.data); setUnread(r.unread);
  }, []);
  useEffect(() => { load().catch((e) => toast.error(e.message)); }, [load]);

  const markRead = async (ids?: string[]) => {
    try {
      await api.patch("/api/notifications", { action: "read", ids, all: !ids });
      setItems((i) => i?.map((n) => (!ids || ids.includes(n.id) ? { ...n, isRead: true } : n)) ?? null);
      setUnread((u) => (ids ? Math.max(0, u - ids.length) : 0));
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  const clearAll = async () => {
    try {
      await api.patch("/api/notifications", { action: "clear", all: true });
      setItems([]); setUnread(0);
      toast.success("Notification history cleared");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  const shown = useMemo(() => (items ?? []).filter((n) => filter === "all" || !n.isRead), [items, filter]);

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader
        title="Notifications"
        subtitle={`Rule-based, timezone-aware signals from your live data — ${unread} unread`}
        actions={
          <>
            <Button size="sm" variant={filter === "unread" ? "subtle" : "ghost"} onClick={() => setFilter(filter === "all" ? "unread" : "all")}>
              <BellRing className="size-3.5" /> {filter === "all" ? "Unread only" : "Show all"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => markRead()} disabled={!unread}><CheckCheck className="size-3.5" /> Mark all read</Button>
            <Button size="sm" variant="outline" onClick={clearAll} disabled={!items?.length}><Eraser className="size-3.5" /> Clear</Button>
          </>
        }
      />

      {!items && <div className="space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-16" />)}</div>}

      {items && !shown.length && (
        <Empty title="No notifications" icon={<BellOff className="size-5" />}
          hint={filter === "unread" ? "Everything is read. Signals regenerate whenever deadlines, holidays or approvals change." : "Signals appear automatically for deadlines, blocked issues, holidays, leaves and goals."} />
      )}

      <div className="space-y-2">
        {shown.map((n) => (
          <Card key={n.id} className={cn("flex items-start gap-3 p-3.5 transition-colors", !n.isRead && "border-indigo-500/25 bg-indigo-600/[0.03] dark:bg-indigo-400/[0.04]")}>
            <div className={cn("mt-1 size-2 shrink-0 rounded-full", n.isRead ? "bg-zinc-300 dark:bg-zinc-700" : "bg-indigo-500")} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-semibold">{n.title}</span>
                <Badge value={n.category} />
                <span className="text-[10.5px] text-zinc-400">{inTz(n.createdAt, "Asia/Kolkata")}</span>
              </div>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">{n.message}</p>
            </div>
            {!n.isRead && (
              <Button size="xs" variant="ghost" onClick={() => markRead([n.id])}>Mark read</Button>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
