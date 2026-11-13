"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { User, Bell, GitBranch, Globe2, Save } from "lucide-react";
import { api } from "@/lib/client";
import { Button, Card, CardHeader, Field, Input, Select, Toggle, PageHeader, Skeleton } from "@/components/ui";

type ProfileResp = {
  user: { id: string; name: string; email: string; timezone: string };
  profile: { employeeId: string; designation: string; department: string; manager: string | null; joiningDate: string | null; location: string | null; employmentStatus: string; avatarColor: string } | null;
  preferences: {
    workStartHour: number; workEndHour: number; weekendDays: number[]; country: string; state: string; city: string;
    financialYearStart: string; reservePendingLeave: boolean;
    notifyIssueDeadlines: boolean; notifyHolidays: boolean; notifyLeaves: boolean; notifyGoals: boolean; reminderIntervalHours: number;
  } | null;
};

const TIMEZONES = ["Asia/Kolkata", "UTC", "America/New_York", "America/Los_Angeles", "Europe/London", "Europe/Berlin", "Asia/Singapore", "Australia/Sydney"];

export default function SettingsPage() {
  const [d, setD] = useState<ProfileResp | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => setD(await api.get<ProfileResp>("/api/profile")), []);
  useEffect(() => { load().catch((e) => toast.error(e.message)); }, [load]);

  const save = async (part: string, payload: Record<string, unknown>) => {
    setBusy(part);
    try {
      await api.patch("/api/profile", payload);
      toast.success("Saved");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); }
    finally { setBusy(null); }
  };

  if (!d) return <div className="space-y-4"><PageHeader title="Settings" /><div className="grid gap-4 lg:grid-cols-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-64" />)}</div></div>;

  const p = d.profile!;
  const prefs = d.preferences!;

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader title="Settings" subtitle="Profile, working calendar, notification rules and integrations" />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Profile */}
        <Card>
          <CardHeader title="Employee profile" subtitle={`ID ${p.employeeId} · joined ${p.joiningDate ?? "—"}`} />
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <Field label="Full name"><Input defaultValue={d.user.name} id="set-name" /></Field>
            <Field label="Designation"><Input defaultValue={p.designation} id="set-desg" /></Field>
            <Field label="Department"><Input defaultValue={p.department} id="set-dept" /></Field>
            <Field label="Manager"><Input defaultValue={p.manager ?? ""} id="set-mgr" /></Field>
            <Field label="Location"><Input defaultValue={p.location ?? ""} id="set-loc" /></Field>
            <Field label="Employment status">
              <Select defaultValue={p.employmentStatus} id="set-emp">
                {["active", "probation", "notice", "contractor"].map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </Field>
            <Field label="Timezone">
              <Select defaultValue={d.user.timezone} id="set-tz">
                {TIMEZONES.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
            </Field>
            <Field label="Joining date"><Input type="date" defaultValue={p.joiningDate ?? ""} id="set-join" /></Field>
          </div>
          <div className="flex justify-end border-t border-zinc-100 px-4 py-3 dark:border-white/[0.06]">
            <Button size="sm" loading={busy === "profile"} onClick={() => {
              const g = (id: string) => (document.getElementById(id) as HTMLInputElement)?.value;
              save("profile", {
                name: g("set-name"), timezone: g("set-tz"),
                profile: { designation: g("set-desg"), department: g("set-dept"), manager: g("set-mgr"), location: g("set-loc"), employmentStatus: g("set-emp"), joiningDate: g("set-join") },
              });
            }}><Save className="size-3.5" /> Save profile</Button>
          </div>
        </Card>

        {/* Working calendar */}
        <Card>
          <CardHeader title="Working calendar" subtitle="Drives leave day calculations & planner bridges" />
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <Field label="Work start hour"><Input type="number" min={0} max={23} defaultValue={prefs.workStartHour} id="set-ws" /></Field>
            <Field label="Work end hour"><Input type="number" min={0} max={23} defaultValue={prefs.workEndHour} id="set-we" /></Field>
            <Field label="Country"><Input defaultValue={prefs.country} id="set-country" /></Field>
            <Field label="State"><Input defaultValue={prefs.state} id="set-state" /></Field>
            <Field label="City"><Input defaultValue={prefs.city} id="set-city" /></Field>
            <Field label="Financial year start"><Input defaultValue={prefs.financialYearStart} id="set-fy" placeholder="04-01" /></Field>
          </div>
          <div className="px-4 pb-2">
            <p className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">Weekend days</p>
            <div className="flex flex-wrap gap-2">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((dName, i) => (
                <button key={dName}
                  onClick={() => {
                    const cur = prefs.weekendDays.includes(i)
                      ? prefs.weekendDays.filter((x) => x !== i)
                      : [...prefs.weekendDays, i];
                    setD((s) => s && { ...s, preferences: { ...prefs, weekendDays: cur } });
                  }}
                  className={`rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition-colors ${prefs.weekendDays.includes(i) ? "border-indigo-500/50 bg-indigo-600/10 text-indigo-600 dark:text-indigo-300" : "border-zinc-200 text-zinc-500 dark:border-white/[0.1]"}`}
                >
                  {dName}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-zinc-100 px-4 py-3 dark:border-white/[0.06]">
            <Button size="sm" loading={busy === "cal"} onClick={() => {
              const g = (id: string) => (document.getElementById(id) as HTMLInputElement)?.value;
              save("cal", {
                preferences: {
                  workStartHour: Number(g("set-ws")), workEndHour: Number(g("set-we")),
                  country: g("set-country"), state: g("set-state"), city: g("set-city"),
                  financialYearStart: g("set-fy"), weekendDays: d.preferences!.weekendDays,
                },
              });
            }}><Save className="size-3.5" /> Save calendar</Button>
          </div>
        </Card>

        {/* Notifications */}
        <Card>
          <CardHeader title="Notification rules" subtitle="Which signals the notification center generates" action={<Bell className="size-4 text-zinc-400" />} />
          <div className="space-y-4 p-4">
            {(
              [
                ["notifyIssueDeadlines", "Issue deadlines & overdue items"],
                ["notifyHolidays", "Upcoming holidays"],
                ["notifyLeaves", "Leave approvals & plans"],
                ["notifyGoals", "Goal & milestone deadlines"],
              ] as const
            ).map(([k, l]) => (
              <Toggle key={k} label={l} checked={prefs[k]} onChange={(v) => {
                setD((s) => s && { ...s, preferences: { ...prefs, [k]: v } });
                api.patch("/api/profile", { preferences: { [k]: v } }).then(() => toast.success("Preference saved")).catch(() => toast.error("Save failed"));
              }} />
            ))}
            <Field label="Reminder horizon (hours before deadlines)" hint="Used for reminder scheduling">
              <Input type="number" min={1} defaultValue={prefs.reminderIntervalHours} id="set-rem" />
            </Field>
            <div className="rounded-lg bg-zinc-50 p-3 dark:bg-white/[0.04]">
              <Toggle label="Reserve pending leave from available balance" checked={prefs.reservePendingLeave} onChange={(v) => {
                setD((s) => s && { ...s, preferences: { ...prefs, reservePendingLeave: v } });
                api.patch("/api/profile", { preferences: { reservePendingLeave: v } }).then(() => toast.success("Policy updated")).catch(() => toast.error("Save failed"));
              }} />
            </div>
            <div className="flex justify-end">
              <Button size="sm" variant="outline" loading={busy === "rem"} onClick={() => save("rem", { preferences: { reminderIntervalHours: Number((document.getElementById("set-rem") as HTMLInputElement)?.value) } })}>
                <Save className="size-3.5" /> Save reminder settings
              </Button>
            </div>
          </div>
        </Card>

        {/* Integrations */}
        <Card>
          <CardHeader title="Integrations" subtitle="External services" action={<GitBranch className="size-4 text-zinc-400" />} />
          <div className="space-y-3 p-4">
            <div className="flex items-center justify-between rounded-lg border border-zinc-200 p-3 dark:border-white/[0.07]">
              <div>
                <p className="text-[13px] font-medium">GitHub</p>
                <p className="text-[11px] text-zinc-500">Read-only import of pushes, PRs and reviews</p>
              </div>
              <a href="/activity"><Button size="sm" variant="outline">Manage</Button></a>
            </div>
            <div className="rounded-lg border border-dashed border-zinc-200 p-3 text-[11.5px] leading-relaxed text-zinc-500 dark:border-white/[0.08]">
              <Globe2 className="mb-1.5 size-4 text-zinc-400" />
              Additional integrations (Slack, Jira, OIDC SSO) are wire-framed in the API layer — tokens always stay server-side via <code className="font-mono">.env</code> secrets, never in the browser bundle.
            </div>
          </div>
        </Card>
      </div>

      {/* security footer */}
      <Card className="p-4">
        <div className="flex items-start gap-3">
          <User className="mt-0.5 size-4 text-emerald-500" />
          <p className="text-[11.5px] leading-relaxed text-zinc-500">
            Workspace account <b className="text-zinc-700 dark:text-zinc-200">{d.user.email}</b> (Asia/Kolkata display). This deployment runs in open
            single-user mode — no sign-in required. Data integrity still applies: per-user row ownership on every query, soft deletion for
            auditability, and a full audit trail (issue/leave/holiday/calendar mutations) in the <code className="font-mono">audit_logs</code> table.
          </p>
        </div>
      </Card>
    </div>
  );
}
