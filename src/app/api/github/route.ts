import { db } from "@/db";
import { githubActivity, githubConnections } from "@/db/schema";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { audit, handle, ok, ApiError, readJson, requireUser } from "@/lib/api";
import { todayYMD } from "@/lib/dates";
import { subDays, format } from "date-fns";

export const GET = handle(async () => {
  const user = await requireUser();
  const [conn] = await db.select().from(githubConnections).where(eq(githubConnections.userId, user.id)).limit(1);
  const today = todayYMD();
  const weekAgo = format(subDays(new Date(), 7), "yyyy-MM-dd");
  const monthAgo = format(subDays(new Date(), 30), "yyyy-MM-dd");

  const rows = await db.select().from(githubActivity).where(eq(githubActivity.userId, user.id)).orderBy(desc(githubActivity.activityDate)).limit(400);

  const sum = (pred: (r: typeof rows[number]) => boolean) => rows.filter(pred).reduce((s, r) => s + r.count, 0);
  const byType = (t: string) => rows.filter((r) => r.type === t);

  const byRepo = new Map<string, number>();
  for (const r of rows) if (r.repo) byRepo.set(r.repo, (byRepo.get(r.repo) ?? 0) + r.count);

  const weeklyTrend = new Map<string, number>();
  for (const r of rows.filter((r) => r.type === "commit")) {
    const d = new Date(r.activityDate + "T00:00:00Z");
    const wk = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7)));
    const key = format(wk, "yyyy-MM-dd");
    weeklyTrend.set(key, (weeklyTrend.get(key) ?? 0) + r.count);
  }

  return ok({
    connection: conn
      ? { username: conn.username, status: conn.status, lastSyncAt: conn.lastSyncAt, connectedAt: conn.connectedAt, hasToken: !!conn.accessToken }
      : null,
    stats: {
      commitsThisWeek: sum((r) => r.type === "commit" && r.activityDate >= weekAgo),
      commitsThisMonth: sum((r) => r.type === "commit" && r.activityDate >= monthAgo),
      prsOpened: byType("pr_opened").reduce((s, r) => s + r.count, 0),
      prsMerged: byType("pr_merged").reduce((s, r) => s + r.count, 0),
      reviews: byType("pr_review").reduce((s, r) => s + r.count, 0),
      issuesInteracted: byType("issue").reduce((s, r) => s + r.count, 0),
      total: rows.reduce((s, r) => s + r.count, 0),
      manualCount: rows.filter((r) => r.manual).length,
    },
    byRepo: [...byRepo.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8),
    commitTrend: [...weeklyTrend.entries()].sort().map(([week, value]) => ({ week, value })),
    recent: rows.slice(0, 60),
    note: "Commit counts are raw activity signals only — they are not a performance measure.",
  });
});

/** PUT — connect GitHub (OAuth token optional; verified server-side, stored server-side only). */
export const PUT = handle(async (req) => {
  const user = await requireUser();
  const body = await readJson<{ username?: string; token?: string }>(req);
  const username = body.username?.trim().replace(/^@/, "");
  if (!username) throw new ApiError(400, "GitHub username required");

  let verified = false;
  try {
    const headers: Record<string, string> = { "User-Agent": "employee360", Accept: "application/vnd.github+json" };
    if (body.token) headers.Authorization = `Bearer ${body.token}`;
    const res = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, {
      headers, signal: AbortSignal.timeout(8000),
    });
    verified = res.ok;
  } catch {
    verified = false;
  }

  await db.insert(githubConnections).values({
    userId: user.id, username, accessToken: body.token || null,
    status: verified ? "connected" : "pending",
    connectedAt: verified ? new Date() : null,
  }).onConflictDoUpdate({
    target: githubConnections.userId,
    set: { username, accessToken: body.token || null, status: verified ? "connected" : "pending", connectedAt: verified ? new Date() : null, updatedAt: new Date() },
  });

  await audit(user.id, "github", user.id, "connected", { username, verified });
  return ok({ username, verified, message: verified ? "Connected to GitHub." : "Saved. Could not verify profile online — sync may fail until network is available." });
});

/** POST — {op:'sync'} pulls real GitHub events; {op:'manual', ...} records an offline activity entry. */
export const POST = handle(async (req) => {
  const user = await requireUser();
  const body = await readJson<Record<string, unknown>>(req);
  const [conn] = await db.select().from(githubConnections).where(eq(githubConnections.userId, user.id)).limit(1);

  if (body.op === "manual") {
    const title = String(body.title ?? "").trim();
    const type = String(body.type ?? "commit");
    const date = String(body.activityDate ?? todayYMD()).slice(0, 10);
    if (!title) throw new ApiError(400, "Title required");
    if (!["commit", "pr_opened", "pr_merged", "pr_review", "issue"].includes(type)) throw new ApiError(400, "Invalid type");
    const [row] = await db.insert(githubActivity).values({
      userId: user.id, activityDate: date, type, title, manual: true,
      repo: (body.repo as string) || null,
      url: (body.url as string) || null,
      count: Math.max(1, Number(body.count ?? 1) || 1),
    }).returning();
    await audit(user.id, "github", row.id, "manual_entry");
    return ok(row, 201);
  }

  if (body.op === "sync") {
    if (!conn?.username) throw new ApiError(400, "Connect GitHub first (Settings → Developer Activity).");
    const headers: Record<string, string> = { "User-Agent": "employee360", Accept: "application/vnd.github+json" };
    if (conn.accessToken) headers.Authorization = `Bearer ${conn.accessToken}`;

    let events: unknown[];
    try {
      const res = await fetch(`https://api.github.com/users/${encodeURIComponent(conn.username)}/events?per_page=100`, {
        headers, signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error(String(res.status));
      events = (await res.json()) as unknown[];
    } catch {
      throw new ApiError(502, "Could not reach GitHub. Check network/token, or add a manual entry instead.");
    }
    if (!Array.isArray(events)) throw new ApiError(502, "Unexpected GitHub response.");

    type Gevent = { id: string; type: string; created_at: string; repo?: { name?: string }; payload?: { commits?: unknown[]; action?: string; pull_request?: { merged?: boolean; title?: string; html_url?: string }; review?: { html_url?: string; pull_request_url?: string }; issue?: { title?: string; html_url?: string }; ref?: string } };
    let imported = 0;
    for (const ev of events as Gevent[]) {
      const date = ev.created_at?.slice(0, 10);
      if (!date) continue;
      const repo = ev.repo?.name ?? null;
      const rows: (typeof githubActivity.$inferInsert)[] = [];
      if (ev.type === "PushEvent") {
        const commits = ev.payload?.commits?.length ?? 0;
        if (commits > 0) rows.push({ userId: user.id, activityDate: date, repo, type: "commit", title: `${commits} commit(s) pushed to ${repo}`, url: null, count: commits, externalId: `push-${ev.id}`, manual: false });
      } else if (ev.type === "PullRequestEvent") {
        const merged = ev.payload?.action === "closed" && ev.payload?.pull_request?.merged;
        if (ev.payload?.action === "opened" || merged) {
          rows.push({ userId: user.id, activityDate: date, repo, type: merged ? "pr_merged" : "pr_opened", title: ev.payload?.pull_request?.title ?? "Pull request", url: ev.payload?.pull_request?.html_url ?? null, count: 1, externalId: `pr-${ev.id}`, manual: false });
        }
      } else if (ev.type === "PullRequestReviewEvent") {
        rows.push({ userId: user.id, activityDate: date, repo, type: "pr_review", title: `Reviewed PR in ${repo ?? "repo"}`, url: ev.payload?.review?.html_url ?? null, count: 1, externalId: `review-${ev.id}`, manual: false });
      } else if (ev.type === "IssuesEvent" && ev.payload?.action === "opened") {
        rows.push({ userId: user.id, activityDate: date, repo, type: "issue", title: ev.payload?.issue?.title ?? "Issue opened", url: ev.payload?.issue?.html_url ?? null, count: 1, externalId: `issue-${ev.id}`, manual: false });
      }
      for (const r of rows) {
        const res = await db.insert(githubActivity).values(r).onConflictDoNothing().returning();
        imported += res.length;
      }
    }
    await db.update(githubConnections).set({ lastSyncAt: new Date(), status: "connected", updatedAt: new Date() }).where(eq(githubConnections.userId, user.id));
    await audit(user.id, "github", user.id, "synced", { imported });
    return ok({ imported, totalEvents: events.length });
  }

  throw new ApiError(400, "Unknown op (sync | manual).");
});

/** DELETE — disconnect (keeps history, clears the token server-side). */
export const DELETE = handle(async () => {
  const user = await requireUser();
  await db.update(githubConnections).set({ status: "disconnected", accessToken: null, username: null, updatedAt: new Date() })
    .where(eq(githubConnections.userId, user.id));
  await audit(user.id, "github", user.id, "disconnected");
  return ok({ disconnected: true });
});
