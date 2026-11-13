import { db } from "@/db";
import * as s from "@/db/schema";
import { and, count, eq, isNull } from "drizzle-orm";
import { handle, ok, requireUser } from "@/lib/api";
import { addDays, format, subDays } from "date-fns";

/**
 * POST /api/seed/advanced — idempotent seed for the Phase-2 modules
 * (meetings, knowledge base). Runs only while those tables are empty for the
 * user; automation rules are created on first visit by the automations API.
 */
export async function POST() {
  const user = await requireUser();
  const [{ value: mCount }] = await db.select({ value: count() }).from(s.meetings).where(eq(s.meetings.userId, user.id));
  const [{ value: kCount }] = await db.select({ value: count() }).from(s.knowledgeDocs).where(eq(s.knowledgeDocs.userId, user.id));
  if (mCount > 0 || kCount > 0) {
    return Response.json({ error: "Advanced modules already seeded" }, { status: 409 });
  }

  const today = new Date();
  const dp = (n: number) => format(subDays(today, n), "yyyy-MM-dd");
  const dn = (n: number) => format(addDays(today, n), "yyyy-MM-dd");

  const projects = await db.select().from(s.projects).where(and(eq(s.projects.userId, user.id), isNull(s.projects.deletedAt)));
  const goals = await db.select().from(s.careerGoals).where(and(eq(s.careerGoals.userId, user.id), isNull(s.careerGoals.deletedAt)));
  const orion = projects.find((p) => p.key === "ORN");
  const nova = projects.find((p) => p.key === "NVA");

  /* ------------------------------------------------------- meetings */
  const meetingSeed: (typeof s.meetings.$inferInsert)[] = [
    {
      userId: user.id, title: "Weekly 1:1 with Priya", type: "one_on_one", meetingDate: dp(3),
      startTime: "16:00", durationMinutes: 30, manager: "Priya Nair", attendees: ["Aarav Sharma", "Priya Nair"],
      agenda: "Gateway incident retro, Q-goals check-in, growth plan.",
      notes: "Walked through the 502 burst incident timeline. Agreed the backoff patch ships this week and we add a soak test to CI.",
      discussionTopics: ["ISS-1018 incident", "Staff-engineer growth plan", "On-call rotation load"],
      feedback: "Strong incident command. Needs more cross-org visibility — present Orion roadmap at the eng all-hands.",
      decisions: "Soak test becomes a release gate for Orion. Aarav to own arch review board slot next quarter.",
      managerCommitments: "Priya to nominate Aarav for the architecture review board and share the L6 rubric.",
      followUpDate: dn(4), projectId: orion?.id ?? null, careerGoalId: goals[0]?.id ?? null,
    },
    {
      userId: user.id, title: "Orion architecture review", type: "review", meetingDate: dp(9),
      startTime: "11:00", durationMinutes: 60, attendees: ["Aarav Sharma", "Priya Nair", "Rahul Iyer", "Meera K"],
      agenda: "Rate-limit SPI design, tenant tiering, egress policy.",
      notes: "Design approved with one change: tenant tier config moves to the control plane rather than per-gateway YAML.",
      discussionTopics: ["Rate-limit SPI", "Tenant tiering", "Config distribution"],
      decisions: "Approved design with control-plane config. Revisit egress policy after the spike.",
      projectId: orion?.id ?? null,
    },
    {
      userId: user.id, title: "Billing incident post-mortem", type: "retro", meetingDate: dp(16),
      startTime: "15:00", durationMinutes: 45, attendees: ["Aarav Sharma", "Finance Ops", "SRE Oncall"],
      agenda: "Invoice proration off-by-one; dunning retries.",
      notes: "Root cause was inclusive/exclusive day-boundary mismatch in legacy proration code. Three invoices were manually credited.",
      discussionTopics: ["Proration boundaries", "Webhook retry exhaustion", "Alerting gaps"],
      decisions: "Add boundary-case test matrix; DLQ alert routes to PagerDuty.",
      managerCommitments: "Finance Ops to supply the full affected-invoice list by Friday.",
      followUpDate: dn(2), projectId: nova?.id ?? null,
    },
    {
      userId: user.id, title: "Skip-level with Head of Engineering", type: "skip_level", meetingDate: dn(6),
      startTime: "14:00", durationMinutes: 30, manager: "Vikram Rao", attendees: ["Aarav Sharma", "Vikram Rao"],
      agenda: "Career trajectory, platform strategy input.",
    },
  ];
  const insertedMeetings = await db.insert(s.meetings).values(meetingSeed).returning();

  await db.insert(s.meetingActionItems).values([
    { meetingId: insertedMeetings[0].id, description: "Share Orion roadmap deck with Priya before all-hands", owner: "Aarav Sharma", dueDate: dn(3), status: "in_progress" },
    { meetingId: insertedMeetings[0].id, description: "Document L6 competency evidence in promotion tracker", owner: "Aarav Sharma", dueDate: dn(10), status: "open" },
    { meetingId: insertedMeetings[0].id, description: "Nominate Aarav for architecture review board", owner: "Priya Nair", dueDate: dn(7), status: "open" },
    { meetingId: insertedMeetings[1].id, description: "Move tenant tier config to control plane", owner: "Aarav Sharma", dueDate: dn(12), status: "open" },
    { meetingId: insertedMeetings[1].id, description: "Publish updated design doc", owner: "Aarav Sharma", dueDate: dp(2), status: "done", completedAt: new Date() },
    { meetingId: insertedMeetings[2].id, description: "Add proration boundary-case test matrix", owner: "Aarav Sharma", dueDate: dn(1), status: "in_progress" },
    { meetingId: insertedMeetings[2].id, description: "Route exhausted-retry DLQ alerts to PagerDuty", owner: "SRE Oncall", dueDate: dn(5), status: "open" },
  ]);

  /* ------------------------------------------------- knowledge base */
  await db.insert(s.knowledgeDocs).values([
    {
      userId: user.id, title: "Diagnosing Postgres connection pool exhaustion", docType: "troubleshooting",
      category: "Databases", tags: ["postgres", "performance", "incident"], isFavorite: true, projectId: orion?.id ?? null,
      body: `## Symptom
Gateway returns 502s under burst traffic; upstream workers appear idle.

## Diagnosis
1. Check active vs idle connections:
   select state, count(*) from pg_stat_activity group by 1;
2. Look for \`idle in transaction\` — these hold pool slots.
3. Capture a pprof heap/goroutine dump during the burst.

## Root cause
Worker pool size < burst concurrency, so requests queue past the client timeout.

## Fix
- Raise pool ceiling and add exponential backoff with jitter.
- Add a soak test to CI at 4k RPS as a release gate.

## Prevention
Alert when pool utilisation > 80% for 2 minutes.`,
    },
    {
      userId: user.id, title: "kubectl triage cheatsheet", docType: "command", category: "Kubernetes",
      tags: ["kubectl", "ops", "cheatsheet"], language: "bash", isFavorite: true,
      body: `# pods sorted by restarts
kubectl get pods -A --sort-by='.status.containerStatuses[0].restartCount'

# tail logs for a crashlooping pod
kubectl logs -f <pod> -n <ns> --previous

# describe recent cluster events
kubectl get events -A --sort-by=.lastTimestamp | tail -40

# resource pressure per node
kubectl top nodes

# exec into a running container
kubectl exec -it <pod> -n <ns> -- /bin/sh`,
    },
    {
      userId: user.id, title: "Go: context-aware worker pool", docType: "snippet", category: "Go",
      tags: ["go", "concurrency", "pattern"], language: "go",
      body: `func pool[T any](ctx context.Context, n int, in <-chan T, fn func(context.Context, T) error) error {
    g, ctx := errgroup.WithContext(ctx)
    for i := 0; i < n; i++ {
        g.Go(func() error {
            for {
                select {
                case <-ctx.Done():
                    return ctx.Err()
                case v, ok := <-in:
                    if !ok {
                        return nil
                    }
                    if err := fn(ctx, v); err != nil {
                        return err
                    }
                }
            }
        })
    }
    return g.Wait()
}`,
    },
    {
      userId: user.id, title: "Orion gateway architecture notes", docType: "architecture",
      category: "Architecture", tags: ["orion", "gateway", "design"], projectId: orion?.id ?? null,
      body: `## Components
- **Edge router** — TLS termination, per-tenant rate limiting.
- **Control plane** — distributes tenant tier config (moved here after arch review).
- **Service mesh** — mTLS between internal services.

## Key decisions
| Decision | Rationale |
|---|---|
| Control-plane config | Avoids per-gateway YAML drift |
| Token bucket per tenant | Predictable fairness under burst |
| gRPC internally | Lower latency than JSON/HTTP |

## Open questions
- Egress policy for third-party calls (spike pending).`,
    },
    {
      userId: user.id, title: "Release runbook — Nova billing", docType: "runbook", category: "Release",
      tags: ["release", "billing", "runbook"], projectId: nova?.id ?? null,
      body: `## Pre-flight
- [ ] Soak test green
- [ ] Migration dry-run on staging clone
- [ ] Finance Ops notified

## Deploy
1. Scale dunning workers to 0.
2. Apply migrations.
3. Rolling deploy, 25% at a time.
4. Re-enable workers; watch DLQ depth.

## Rollback
Revert image tag, replay DLQ, reconcile invoices for the window.`,
    },
    {
      userId: user.id, title: "Incident review template", docType: "note", category: "Process",
      tags: ["process", "incident", "template"],
      body: `## Summary
One paragraph, blameless.

## Impact
Users affected, duration, revenue/SLO impact.

## Timeline (IST)
- HH:MM detection
- HH:MM mitigation
- HH:MM resolution

## Root cause
## What went well
## What to improve
## Action items (owner + due date)`,
    },
  ]);

  return ok({
    seeded: true,
    meetings: insertedMeetings.length,
    actionItems: 7,
    knowledgeDocs: 6,
  }, 201);
}

export const GET = handle(async () => {
  const user = await requireUser();
  const [{ value: mCount }] = await db.select({ value: count() }).from(s.meetings).where(eq(s.meetings.userId, user.id));
  const [{ value: kCount }] = await db.select({ value: count() }).from(s.knowledgeDocs).where(eq(s.knowledgeDocs.userId, user.id));
  return ok({ seeded: mCount > 0 || kCount > 0, meetings: mCount, knowledgeDocs: kCount });
});
