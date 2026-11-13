"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  LayoutDashboard, CircleDot, FolderKanban, ListChecks, NotebookPen, CalendarDays,
  CalendarClock, PartyPopper, Compass, GitBranch, Trophy, BarChart3, Bell, Settings,
  Search, ChevronsLeft, ChevronsRight, Sun, Moon, PanelsTopLeft, Command,
  ArrowRight, CircleUser, Sparkles, Gauge, Users, BookOpen, Zap, Cloud, CloudOff,
} from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { api } from "@/lib/client";
import { Badge, Button, IconButton, Kbd, Skeleton } from "@/components/ui";

type NavItem = { href: string; label: string; icon: React.ElementType };

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "Workspace",
    items: [
      { href: "/", label: "Overview", icon: LayoutDashboard },
      { href: "/issues", label: "My Issues", icon: CircleDot },
      { href: "/projects", label: "Projects", icon: FolderKanban },
      { href: "/tasks", label: "My Tasks", icon: ListChecks },
      { href: "/journal", label: "Work Journal", icon: NotebookPen },
      { href: "/calendar", label: "Work Calendar", icon: CalendarDays },
      { href: "/workload", label: "Workload", icon: Gauge },
      { href: "/meetings", label: "Meetings", icon: Users },
    ],
  },
  {
    group: "Time Off",
    items: [
      { href: "/leaves", label: "Leave Management", icon: CalendarClock },
      { href: "/holidays", label: "Holiday Calendar", icon: PartyPopper },
      { href: "/planner", label: "Leave Planner", icon: Compass },
    ],
  },
  {
    group: "Intelligence",
    items: [
      { href: "/assistant", label: "AI Assistant", icon: Sparkles },
      { href: "/knowledge", label: "Knowledge Base", icon: BookOpen },
    ],
  },
  {
    group: "Growth",
    items: [
      { href: "/activity", label: "Developer Activity", icon: GitBranch },
      { href: "/career", label: "Performance", icon: Trophy },
      { href: "/analytics", label: "Analytics & Reports", icon: BarChart3 },
    ],
  },
  {
    group: "System",
    items: [
      { href: "/notifications", label: "Notifications", icon: Bell },
      { href: "/automations", label: "Automations", icon: Zap },
      { href: "/sync", label: "Cloud Sync", icon: Cloud },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

type SearchResults = {
  issues: { id: string; key: string; title: string; status: string; priority: string }[];
  tasks: { id: string; title: string; status: string }[];
  projects: { id: string; name: string; status: string }[];
  journals: { id: string; journalDate: string; summary: string | null }[];
  holidays: { id: string; name: string; holidayDate: string; category: string }[];
};

export function Shell({ user, children }: {
  user: { name: string; email: string; avatarColor: string; designation?: string | null };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    setCollapsed(localStorage.getItem("e360-sidebar") === "collapsed");
    api.get<{ unread: number }>("/api/notifications").then((r) => setUnread(r.unread)).catch(() => {});
  }, []);

  // mark notifications read when visiting the page
  useEffect(() => {
    if (pathname === "/notifications") setUnread(0);
  }, [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggleTheme = useCallback(() => {
    const html = document.documentElement;
    const dark = html.classList.toggle("dark");
    localStorage.setItem("e360-theme", dark ? "dark" : "light");
  }, []);

  const toggleCollapse = useCallback(() => {
    setCollapsed((c) => {
      localStorage.setItem("e360-sidebar", c ? "expanded" : "collapsed");
      return !c;
    });
  }, []);

  const sidebar = (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div className={cn("flex h-14 items-center gap-2.5 border-b border-zinc-200/70 px-4 dark:border-white/[0.06]", collapsed && "justify-center px-2")}>
        <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-950/30">
          <PanelsTopLeft className="size-4" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold tracking-tight text-zinc-900 dark:text-white">Employee 360</p>
            <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-400 dark:text-zinc-500">Work OS</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-4 overflow-y-auto px-2.5 py-3">
        {NAV.map((g) => (
          <div key={g.group}>
            {!collapsed && (
              <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-600">{g.group}</p>
            )}
            <div className="space-y-0.5">
              {g.items.map((item) => {
                const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] font-medium transition-colors",
                      collapsed && "justify-center px-0",
                      active
                        ? "bg-indigo-600/[0.09] text-indigo-600 dark:bg-indigo-400/[0.1] dark:text-indigo-300"
                        : "text-zinc-600 hover:bg-zinc-900/[0.045] hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/[0.05] dark:hover:text-zinc-100",
                    )}
                  >
                    {active && <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-indigo-500" />}
                    <Icon className={cn("size-[16px] shrink-0", active ? "text-indigo-500 dark:text-indigo-400" : "text-zinc-400 group-hover:text-zinc-600 dark:text-zinc-500 dark:group-hover:text-zinc-300")} />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                    {!collapsed && item.href === "/notifications" && unread > 0 && (
                      <span className="ml-auto grid min-w-5 place-items-center rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{unread > 99 ? "99+" : unread}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className={cn("border-t border-zinc-200/70 p-2.5 dark:border-white/[0.06]", collapsed && "flex justify-center")}>
        <button
          onClick={() => setProfileOpen((v) => !v)}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-zinc-900/[0.045] dark:hover:bg-white/[0.05]",
            collapsed && "w-auto",
          )}
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white" style={{ background: user.avatarColor }}>
            {initials(user.name)}
          </span>
          {!collapsed && (
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium text-zinc-800 dark:text-zinc-100">{user.name}</span>
              <span className="block truncate text-[11px] text-zinc-500 dark:text-zinc-500">{user.designation ?? "Employee"}</span>
            </span>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden border-r border-zinc-200/80 bg-white/85 backdrop-blur-xl transition-[width] duration-200 md:block",
          "dark:border-white/[0.06] dark:bg-[#0e0e11]/90",
          collapsed ? "w-[64px]" : "w-[228px]",
        )}
      >
        {sidebar}
      </aside>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-zinc-950/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[250px] border-r border-zinc-200 bg-white dark:border-white/[0.06] dark:bg-[#0e0e11] animate-slide-up">
            {sidebar}
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className={cn("flex min-h-screen flex-1 flex-col transition-[margin] duration-200", collapsed ? "md:ml-[64px]" : "md:ml-[228px]")}>
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-zinc-200/70 bg-white/80 px-4 backdrop-blur-xl dark:border-white/[0.06] dark:bg-[#0a0a0c]/80">
          <IconButton className="md:hidden" onClick={() => setMobileOpen(true)}><LayoutDashboard className="size-4" /></IconButton>

          <button
            onClick={() => setPaletteOpen(true)}
            className="flex h-8 w-full max-w-sm items-center gap-2 rounded-lg border border-zinc-200/80 bg-zinc-50 px-3 text-[13px] text-zinc-400 transition-colors hover:border-zinc-300 hover:text-zinc-500 dark:border-white/[0.07] dark:bg-white/[0.04] dark:hover:border-white/[0.15]"
          >
            <Search className="size-3.5" />
            <span className="flex-1 text-left">Search anything…</span>
            <span className="hidden items-center gap-0.5 sm:flex"><Kbd><Command className="inline size-2.5" /></Kbd><Kbd>K</Kbd></span>
          </button>

          <div className="ml-auto flex items-center gap-1">
            <IconButton onClick={toggleCollapse} className="hidden md:inline-flex" title="Toggle sidebar">
              {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
            </IconButton>
            <SyncIndicator />
            <IconButton onClick={toggleTheme} title="Toggle theme"><Sun className="hidden size-4 dark:block" /><Moon className="size-4 dark:hidden" /></IconButton>
            <div className="relative">
              <IconButton onClick={() => setNotifOpen((v) => !v)} title="Notifications">
                <Bell className="size-4" />
                {unread > 0 && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-[#0a0a0c]" />}
              </IconButton>
              {notifOpen && <NotificationsPopover onClose={() => setNotifOpen(false)} onUnread={setUnread} />}
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6">{children}</main>

        <footer className="border-t border-zinc-200/60 px-6 py-3 text-[11px] text-zinc-400 dark:border-white/[0.05] dark:text-zinc-600">
          Employee 360 · All times in Asia/Kolkata · Data persisted to PostgreSQL
        </footer>
      </div>

      {/* Profile menu */}
      {profileOpen && (
        <div className="fixed left-3 bottom-16 z-50 w-64 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-xl animate-scale-in dark:border-white/10 dark:bg-[#151518] md:left-auto md:ml-3">
          <div className="border-b border-zinc-100 px-3 py-2.5 dark:border-white/[0.06]">
            <p className="text-[13px] font-semibold">{user.name}</p>
            <p className="text-[11px] text-zinc-500">{user.email}</p>
          </div>
          <Link href="/settings" onClick={() => setProfileOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/[0.06]">
            <CircleUser className="size-4" /> Profile settings
          </Link>
        </div>
      )}

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} router={router} />
    </div>
  );
}

/* ------------------------------------------------------- Search palette */
function CommandPalette({ open, onClose, router }: { open: boolean; onClose: () => void; router: ReturnType<typeof useRouter> }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => { if (open) { setQ(""); setResults(null); setSel(0); setTimeout(() => inputRef.current?.focus(), 30); } }, [open]);

  useEffect(() => {
    if (!open || q.trim().length < 2) { setResults(null); return; }
    setLoading(true);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await api.get<SearchResults>(`/api/search?q=${encodeURIComponent(q)}`);
        setResults(r);
      } finally { setLoading(false); }
    }, 180);
    return () => clearTimeout(debounceRef.current);
  }, [q, open]);

  const flat = useMemo(() => {
    if (!results) return [];
    const out: { label: string; sub?: string; href: string; icon: React.ElementType }[] = [];
    results.issues?.forEach((i) => out.push({ label: `${i.key} · ${i.title}`, sub: i.status, href: `/issues/${i.id}`, icon: CircleDot }));
    results.tasks?.forEach((t) => out.push({ label: t.title, sub: t.status, href: `/tasks`, icon: ListChecks }));
    results.projects?.forEach((p) => out.push({ label: p.name, sub: p.status, href: `/projects?open=${p.id}`, icon: FolderKanban }));
    results.holidays?.forEach((h) => out.push({ label: h.name, sub: h.holidayDate, href: `/holidays`, icon: PartyPopper }));
    results.journals?.forEach((j) => out.push({ label: `Journal · ${j.journalDate}`, sub: j.summary?.slice(0, 60) ?? "", href: `/journal?date=${j.journalDate}`, icon: NotebookPen }));
    return out.slice(0, 12);
  }, [results]);

  if (!open) return null;

  const go = (href: string) => { router.push(href); onClose(); };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center p-4 pt-[12vh]" role="dialog">
      <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl animate-scale-in dark:border-white/10 dark:bg-[#151518]">
        <div className="flex items-center gap-2.5 border-b border-zinc-100 px-4 dark:border-white/[0.06]">
          <Search className="size-4 text-zinc-400" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(flat.length - 1, s + 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
              if (e.key === "Enter" && flat[sel]) go(flat[sel].href);
              if (e.key === "Escape") onClose();
            }}
            placeholder="Search issues, tasks, projects, journals, holidays…"
            className="h-12 flex-1 bg-transparent text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none dark:text-zinc-100"
          />
          <Kbd>esc</Kbd>
        </div>
        <div className="max-h-[46vh] overflow-y-auto p-1.5">
          {!flat.length && !loading && q.length >= 2 && (
            <p className="px-3 py-8 text-center text-[13px] text-zinc-400">No results for “{q}”</p>
          )}
          {!flat.length && q.length < 2 && (
            <div className="space-y-1 px-3 py-4">
              <p className="text-[11px] font-medium uppercase tracking-widest text-zinc-400">Quick actions</p>
              {["Create issue|/issues?new=1", "Log today's journal|/journal?new=1", "Apply for leave|/leaves?new=1", "Add task|/tasks?new=1"].map((s) => {
                const [label, href] = s.split("|");
                return (
                  <button key={href} onClick={() => go(href)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/[0.06]">
                    <ArrowRight className="size-3.5 text-zinc-400" /> {label}
                  </button>
                );
              })}
            </div>
          )}
          {flat.map((r, i) => (
            <button
              key={r.href + i}
              onClick={() => go(r.href)}
              onMouseEnter={() => setSel(i)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left",
                sel === i ? "bg-indigo-600/[0.08] dark:bg-indigo-400/[0.1]" : "",
              )}
            >
              <r.icon className="size-4 shrink-0 text-zinc-400" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-zinc-800 dark:text-zinc-100">{r.label}</span>
                {r.sub && <span className="block truncate text-[11px] text-zinc-400">{r.sub.replace(/_/g, " ")}</span>}
              </span>
              <ArrowRight className="size-3.5 text-zinc-300" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------ Notifications popover */
function NotificationsPopover({ onClose, onUnread }: { onClose: () => void; onUnread: (n: number) => void }) {
  const [items, setItems] = useState<{ id: string; title: string; message: string; category: string; isRead: boolean; createdAt: string }[] | null>(null);
  const router = useRouter();

  const load = useCallback(async () => {
    try {
      const r = await api.get<{ data: { id: string; title: string; message: string; category: string; isRead: boolean; createdAt: string }[]; unread: number }>("/api/notifications");
      setItems(r.data.slice(0, 8));
      onUnread(r.unread);
    } catch { setItems([]); }
  }, [onUnread]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="absolute right-0 top-10 z-50 w-[340px] rounded-xl border border-zinc-200 bg-white shadow-xl animate-scale-in dark:border-white/10 dark:bg-[#151518]">
      <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-2.5 dark:border-white/[0.06]">
        <span className="text-[13px] font-semibold">Notifications</span>
        <Button size="xs" variant="ghost" onClick={() => { onClose(); router.push("/notifications"); }}>View all</Button>
      </div>
      <div className="max-h-[360px] overflow-y-auto p-1.5">
        {items === null && <div className="space-y-2 p-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-11" />)}</div>}
        {items?.length === 0 && <p className="px-3 py-8 text-center text-xs text-zinc-400">You're all caught up.</p>}
        {items?.map((n) => (
          <div key={n.id} className={cn("rounded-lg px-3 py-2.5 transition-colors hover:bg-zinc-50 dark:hover:bg-white/[0.04]", !n.isRead && "bg-indigo-600/[0.04] dark:bg-indigo-400/[0.05]")}>
            <div className="flex items-center gap-2">
              <Badge value={n.category} />
              <span className="text-[12px] font-medium text-zinc-800 dark:text-zinc-200">{n.title}</span>
            </div>
            <p className="mt-1 line-clamp-2 text-[11.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">{n.message}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------- Sync status indicator */
function SyncIndicator() {
  const [online, setOnline] = useState(true);
  const [lastSync, setLastSync] = useState<string | null>(null);

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    const read = () => {
      try {
        const raw = localStorage.getItem("e360-offline-cache");
        if (raw) setLastSync(JSON.parse(raw).pulledAt ?? null);
      } catch { /* ignore */ }
    };
    read();
    const t = setInterval(read, 30000);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); clearInterval(t); };
  }, []);

  return (
    <Link
      href="/sync"
      title={online ? (lastSync ? `Last cached ${new Date(lastSync).toLocaleString("en-GB", { timeZone: "Asia/Kolkata" })}` : "Online — not cached yet") : "Offline — using local cache"}
      className={cn(
        "hidden items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-medium transition-colors sm:inline-flex",
        online ? "text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400" : "text-amber-600 hover:bg-amber-500/10 dark:text-amber-400",
      )}
    >
      {online ? <Cloud className="size-3.5" /> : <CloudOff className="size-3.5" />}
      <span className="hidden lg:inline">{online ? "Synced" : "Offline"}</span>
    </Link>
  );
}
