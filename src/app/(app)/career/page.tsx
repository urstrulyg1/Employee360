"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Plus, Trophy, Target, TrendingUp, Trash2, Pencil, ExternalLink, Award, Info } from "lucide-react";
import { api } from "@/lib/client";
import { Badge, Button, Card, CardHeader, Confirm, Empty, Field, Input, Modal, PageHeader, Progress, Select, Skeleton, Tabs, Tag, Textarea } from "@/components/ui";
import { ACHIEVEMENT_CATEGORIES, GOAL_HORIZONS, label } from "@/lib/domain";
import { humanize } from "@/lib/dates";

type Goal = { id: string; title: string; description: string | null; horizon: string; targetDate: string | null; progress: number; status: string; evidence: string | null; completionNotes: string | null };
type Achievement = { id: string; category: string; title: string; description: string | null; impact: string | null; achievedDate: string | null; evidenceUrl: string | null };
type Promotion = { targetRole: string | null; requiredCompetencies: string | null; demonstratedSkills: string | null; achievementsSummary: string | null; evidenceLinks: string | null; feedback: string | null; developmentGaps: string | null; nextSteps: string | null };
type Career = { goals: Goal[]; achievements: Achievement[]; promotion: Promotion | null; profile: { designation: string; department: string; manager: string | null; joiningDate: string | null } | null };

export default function CareerPage() {
  const [d, setD] = useState<Career | null>(null);
  const [tab, setTab] = useState<"goals" | "achievements" | "promotion">("goals");
  const [goalModal, setGoalModal] = useState<{ goal?: Goal } | null>(null);
  const [achModal, setAchModal] = useState<{ ach?: Achievement } | null>(null);
  const [del, setDel] = useState<{ entity: string; id: string } | null>(null);

  const load = useCallback(async () => setD(await api.get<Career>("/api/career")), []);
  useEffect(() => { load().catch((e) => toast.error(e.message)); }, [load]);

  const inProgress = d?.goals.filter((g) => g.status === "in_progress") ?? [];
  const completed = d?.goals.filter((g) => g.status === "completed") ?? [];

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader title="Performance & Career" subtitle={d?.profile ? `${d.profile.designation} · ${d.profile.department} · manager: ${d.profile.manager ?? "—"}` : "Goals, achievements and promotion readiness"}
        actions={
          <>
            <Button size="sm" variant="outline" onClick={() => window.open("/api/reports?type=achievements&format=xlsx")}>Export achievements</Button>
            <Button size="sm" onClick={() => tab === "achievements" ? setAchModal({}) : setGoalModal({})}>
              <Plus className="size-3.5" /> {tab === "achievements" ? "Log achievement" : "New goal"}
            </Button>
          </>
        }
      />

      {/* summary strip */}
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { icon: Target, label: "Active goals", value: inProgress.length },
          { icon: Trophy, label: "Goals completed", value: completed.length },
          { icon: Award, label: "Achievements", value: d?.achievements.length ?? 0 },
          { icon: TrendingUp, label: "Avg goal progress", value: `${Math.round(((inProgress.reduce((s, g) => s + g.progress, 0)) || 0) / Math.max(1, inProgress.length))}%` },
        ].map((s) => (
          <Card key={s.label} className="flex items-center gap-3 p-4">
            <div className="grid size-10 place-items-center rounded-xl bg-indigo-600/10 text-indigo-500"><s.icon className="size-4" /></div>
            <div>
              <p className="font-mono text-xl font-bold">{s.value}</p>
              <p className="text-[11px] text-zinc-400">{s.label}</p>
            </div>
          </Card>
        ))}
      </div>

      <Tabs tabs={[{ key: "goals", label: "Goals" }, { key: "achievements", label: "Achievements" }, { key: "promotion", label: "Promotion readiness" }]} active={tab} onChange={(v) => setTab(v as typeof tab)} />

      {/* GOALS */}
      {tab === "goals" && (
        !d ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-44" />)}</div> :
        d.goals.length === 0 ? <Empty title="No goals yet" icon={<Target className="size-5" />} hint="Define quarterly, annual, learning or career goals." action={<Button size="sm" onClick={() => setGoalModal({})}><Plus className="size-3.5" /> New goal</Button>} /> : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {d.goals.map((g) => (
              <Card key={g.id} className="flex flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <Badge value={g.horizon} />
                  <div className="flex gap-1">
                    <Button size="xs" variant="ghost" onClick={() => setGoalModal({ goal: g })}><Pencil className="size-3" /></Button>
                    <Button size="xs" variant="ghost" onClick={() => setDel({ entity: "goal", id: g.id })}><Trash2 className="size-3 text-red-500" /></Button>
                  </div>
                </div>
                <p className="mt-2 text-[13.5px] font-semibold leading-snug">{g.title}</p>
                {g.description && <p className="mt-1 line-clamp-2 text-[12px] text-zinc-500 dark:text-zinc-400">{g.description}</p>}
                <div className="mt-3">
                  <div className="mb-1 flex justify-between text-[11px]"><Badge value={g.status} /><span className="font-mono text-zinc-400">{g.progress}%</span></div>
                  <Progress value={g.progress} tone={g.status === "completed" ? "emerald" : g.status === "on_hold" ? "amber" : "indigo"} />
                  <input
                    type="range" min={0} max={100} step={5} value={g.progress}
                    className="mt-2 w-full accent-indigo-600"
                    onChange={async (e) => {
                      const progress = Number(e.target.value);
                      setD((cur) => cur && { ...cur, goals: cur.goals.map((x) => x.id === g.id ? { ...x, progress } : x) });
                      try { await api.patch("/api/career", { entity: "goal", id: g.id, progress, status: progress === 100 ? "completed" : g.status }); }
                      catch { toast.error("Progress save failed"); }
                    }}
                  />
                </div>
                <div className="mt-auto flex items-center justify-between pt-3 text-[11px] text-zinc-400">
                  <span>{g.targetDate ? `Target ${humanize(g.targetDate)}` : "No target date"}</span>
                  {g.evidence && <a href={g.evidence.startsWith("http") ? g.evidence : undefined} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-indigo-500 hover:underline"><ExternalLink className="size-3" /> Evidence</a>}
                </div>
              </Card>
            ))}
          </div>
        )
      )}

      {/* ACHIEVEMENTS */}
      {tab === "achievements" && (
        !d ? <Skeleton className="h-72" /> :
        d.achievements.length === 0 ? <Empty title="No achievements logged" icon={<Trophy className="size-5" />} hint="Log shipped projects, resolved incidents, certifications, mentoring…" action={<Button size="sm" onClick={() => setAchModal({})}><Plus className="size-3.5" /> Log achievement</Button>} /> : (
          <Card>
            <CardHeader title={`${d.achievements.length} career achievement(s)`} subtitle="Your own verified record — nothing is auto-generated" />
            <div className="divide-y divide-zinc-100 dark:divide-white/[0.05]">
              {d.achievements.map((a) => (
                <div key={a.id} className="group flex items-start gap-3 px-4 py-3.5">
                  <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-amber-500/10 text-amber-500"><Trophy className="size-3.5" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[13px] font-semibold">{a.title}</p>
                      <Tag tone="amber">{label(a.category)}</Tag>
                      <span className="font-mono text-[10.5px] text-zinc-400">{humanize(a.achievedDate)}</span>
                    </div>
                    {a.description && <p className="mt-1 text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">{a.description}</p>}
                    {a.impact && <p className="mt-1 text-[11.5px] text-emerald-600 dark:text-emerald-400">Impact: {a.impact}</p>}
                    {a.evidenceUrl && <a href={a.evidenceUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[11px] text-indigo-500 hover:underline"><ExternalLink className="size-3" /> Evidence</a>}
                  </div>
                  <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button size="xs" variant="ghost" onClick={() => setAchModal({ ach: a })}><Pencil className="size-3" /></Button>
                    <Button size="xs" variant="ghost" onClick={() => setDel({ entity: "achievement", id: a.id })}><Trash2 className="size-3 text-red-500" /></Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )
      )}

      {/* PROMOTION */}
      {tab === "promotion" && (
        !d ? <Skeleton className="h-72" /> : <PromotionForm promotion={d.promotion} onSaved={load} />
      )}

      {goalModal && <GoalModal goal={goalModal.goal} onClose={() => setGoalModal(null)} onSaved={() => { setGoalModal(null); load(); }} />}
      {achModal && <AchievementModal ach={achModal.ach} onClose={() => setAchModal(null)} onSaved={() => { setAchModal(null); load(); }} />}
      <Confirm open={!!del} title={`Delete ${del?.entity}?`} message="This record will be soft-deleted." danger onCancel={() => setDel(null)}
        onConfirm={async () => { try { await api.del("/api/career", del); toast.success("Deleted"); setDel(null); load(); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } }} />
    </div>
  );
}

function PromotionForm({ promotion, onSaved }: { promotion: Promotion | null; onSaved: () => void }) {
  const [f, setF] = useState<Promotion>(promotion ?? { targetRole: null, requiredCompetencies: null, demonstratedSkills: null, achievementsSummary: null, evidenceLinks: null, feedback: null, developmentGaps: null, nextSteps: null });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (promotion) setF(promotion); }, [promotion]);
  const set = (k: keyof Promotion, v: string) => setF((p) => ({ ...p, [k]: v }));

  return (
    <Card>
      <CardHeader title="Promotion readiness tracker" subtitle="Documents evidence against your target role — it does not determine eligibility" />
      <div className="grid gap-4 p-4 sm:grid-cols-2">
        <Field label="Target role / level" className="sm:col-span-2">
          <Input value={f.targetRole ?? ""} onChange={(e) => set("targetRole", e.target.value)} placeholder="Staff Software Engineer (L6)" />
        </Field>
        {(
          [
            ["requiredCompetencies", "Required competencies for next level"],
            ["demonstratedSkills", "Skills you have demonstrated"],
            ["achievementsSummary", "Achievements that support the case"],
            ["evidenceLinks", "Evidence links (design docs, talks, PRs…)"],
            ["feedback", "Manager / peer feedback"],
            ["developmentGaps", "Development gaps"],
            ["nextSteps", "Next steps & timeline"],
          ] as [keyof Promotion, string][]
        ).map(([k, l]) => (
          <Field key={k} label={l} className={k === "nextSteps" ? "sm:col-span-2" : ""}>
            <Textarea rows={3} value={(f[k] as string) ?? ""} onChange={(e) => set(k, e.target.value)} />
          </Field>
        ))}
      </div>
      <div className="flex items-start justify-between gap-3 border-t border-zinc-100 px-4 py-3 dark:border-white/[0.06]">
        <p className="flex items-start gap-2 text-[11px] leading-relaxed text-zinc-400">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          Nothing here generates ratings or promotion decisions — it's your documented evidence portfolio.
        </p>
        <Button loading={busy} onClick={async () => {
          setBusy(true);
          try { await api.post("/api/career", { entity: "promotion", ...f }); toast.success("Promotion tracker saved"); onSaved(); }
          catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); }
          finally { setBusy(false); }
        }}>Save tracker</Button>
      </div>
    </Card>
  );
}

function GoalModal({ goal, onClose, onSaved }: { goal?: Goal; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Record<string, unknown>>(goal ?? { horizon: "quarterly", status: "not_started", progress: 0 });
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title={goal ? "Edit goal" : "New goal"}>
      <div className="space-y-4">
        <Field label="Title"><Input autoFocus value={(f.title as string) ?? ""} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Description"><Textarea rows={2} value={(f.description as string) ?? ""} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Horizon">
            <Select value={(f.horizon as string) ?? "quarterly"} onChange={(e) => setF({ ...f, horizon: e.target.value })}>
              {GOAL_HORIZONS.map((h) => <option key={h} value={h}>{label(h)}</option>)}
            </Select>
          </Field>
          <Field label="Target date"><Input type="date" value={(f.targetDate as string) ?? ""} onChange={(e) => setF({ ...f, targetDate: e.target.value || null })} /></Field>
          <Field label="Status">
            <Select value={(f.status as string) ?? "not_started"} onChange={(e) => setF({ ...f, status: e.target.value })}>
              {["not_started", "in_progress", "on_hold", "completed"].map((s) => <option key={s} value={s}>{label(s)}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Evidence / link"><Input value={(f.evidence as string) ?? ""} onChange={(e) => setF({ ...f, evidence: e.target.value })} /></Field>
        <Field label="Completion notes"><Textarea rows={2} value={(f.completionNotes as string) ?? ""} onChange={(e) => setF({ ...f, completionNotes: e.target.value })} /></Field>
        <div className="flex justify-end gap-2">
          <Button variant="subtle" onClick={onClose}>Cancel</Button>
          <Button loading={busy} disabled={!(f.title as string)?.trim()} onClick={async () => {
            setBusy(true);
            try {
              if (goal) await api.patch("/api/career", { entity: "goal", id: goal.id, ...f });
              else await api.post("/api/career", { entity: "goal", ...f });
              toast.success("Goal saved"); onSaved();
            } catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); }
            finally { setBusy(false); }
          }}>{goal ? "Save" : "Create goal"}</Button>
        </div>
      </div>
    </Modal>
  );
}

function AchievementModal({ ach, onClose, onSaved }: { ach?: Achievement; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Record<string, unknown>>(ach ?? { category: "technical" });
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title={ach ? "Edit achievement" : "Log achievement"}>
      <div className="space-y-4">
        <Field label="Title"><Input autoFocus value={(f.title as string) ?? ""} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="What did you accomplish?" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            <Select value={(f.category as string) ?? "technical"} onChange={(e) => setF({ ...f, category: e.target.value })}>
              {ACHIEVEMENT_CATEGORIES.map((c) => <option key={c} value={c}>{label(c)}</option>)}
            </Select>
          </Field>
          <Field label="Date achieved"><Input type="date" value={(f.achievedDate as string) ?? ""} onChange={(e) => setF({ ...f, achievedDate: e.target.value || null })} /></Field>
        </div>
        <Field label="Description"><Textarea rows={2} value={(f.description as string) ?? ""} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Impact"><Input value={(f.impact as string) ?? ""} onChange={(e) => setF({ ...f, impact: e.target.value })} placeholder="Business / customer / team impact" /></Field>
        <Field label="Evidence URL"><Input value={(f.evidenceUrl as string) ?? ""} onChange={(e) => setF({ ...f, evidenceUrl: e.target.value })} placeholder="https://…" /></Field>
        <div className="flex justify-end gap-2">
          <Button variant="subtle" onClick={onClose}>Cancel</Button>
          <Button loading={busy} disabled={!(f.title as string)?.trim()} onClick={async () => {
            setBusy(true);
            try {
              if (ach) await api.patch("/api/career", { entity: "achievement", id: ach.id, ...f });
              else await api.post("/api/career", { entity: "achievement", ...f });
              toast.success("Achievement saved"); onSaved();
            } catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); }
            finally { setBusy(false); }
          }}>{ach ? "Save" : "Log achievement"}</Button>
        </div>
      </div>
    </Modal>
  );
}
