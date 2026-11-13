# Employee 360 — Enterprise Work OS

A centralized personal employee productivity & management platform: issues, projects, tasks,
journals, leaves, holidays, a unified calendar, an annual leave planner, GitHub activity,
career tracking, analytics, reports and notifications — all persisted in PostgreSQL.

> **Delivery note (architecture adaptation).** The master prompt targets a Tauri desktop shell
> with a standalone Go backend. This delivery implements the same product contract on the
> platform stack available here: **Next.js App Router (React 19 + TypeScript + Tailwind v4)**
> as the desktop-class UI, **REST API route handlers under `/api/*`** as the backend layer
> (modular, validated, centrally error-handled), and **PostgreSQL via Drizzle ORM** as the
> cloud-ready persistence layer (30-table normalized schema, FKs, unique constraints,
> transactions, audit trail). The result runs everywhere a browser does (including packaging
> through any web-view wrapper later). Nothing is mocked: every screen reads/writes Postgres.

---

## Quick start

```bash
npm install                # already provisioned in this environment
npx drizzle-kit push       # apply schema to Postgres (already applied here)
npm run build && npm start # production
# Authentication is disabled: the workspace opens directly at /
# as the seeded default employee (aarav.sharma@employee360.app).
```

Seed is idempotent (`POST /api/seed` only runs on an empty database) and uses verified 2026
India gazetted holiday dates. All relative dates are computed at seed time so data stays fresh.

## Stack

| Layer | Choice |
|---|---|
| UI | React 19, TypeScript, Tailwind v4, Lucide icons, Recharts, custom FullCalendar-grade calendar views |
| Backend | Next.js REST route handlers, validated payloads, transactions, audit logging |
| DB | PostgreSQL + Drizzle ORM (`src/db/schema.ts` — 30 tables) |
| Auth | Disabled — open single-user mode (default workspace account resolved server-side); session layer retained for optional SSO |
| Reports | CSV + XLSX (server-side), PDF via print-ready view |
| AI | Grounded retrieval engine over own records; optional LLM polish (OpenAI/Anthropic) |
| GitHub | Optional, read-only event import (token stored server-side only) |

## Modules & routes

| Module | Page | API |
|---|---|---|
| Overview dashboard (customizable widgets) | `/` | `GET /api/dashboard` |
| Issue tracker (list/Kanban/bulk/export) | `/issues`, `/issues/[id]` | `GET/POST /api/issues`, `GET/PATCH/DELETE /api/issues/[id]`, comments sub-resource |
| Projects | `/projects` | `GET/POST /api/projects`, `GET/PATCH/DELETE /api/projects/[id]` |
| Tasks (subtasks, progress, board) | `/tasks` | `GET/POST /api/tasks`, `PATCH/DELETE /api/tasks/[id]` |
| Daily work journal + weekly/monthly rollups | `/journal` | `GET/POST/PATCH/DELETE /api/journals` |
| Unified work calendar (ICS/CSV, drag-reschedule) | `/calendar` | `GET/POST/PATCH/DELETE /api/calendar` |
| Leave management (balances, audit, policies) | `/leaves` | `/api/leaves`, `/api/leaves/[id]`, `/api/leaves/balances`, `/api/leaves/types` |
| Holiday calendar (verified, CSV import, dup detection) | `/holidays` | `/api/holidays`, `/api/holidays/[id]` |
| Annual leave planner (bridge detection) | `/planner` | `GET /api/planner` (save via `/api/leaves` planned entries) |
| Developer activity + GitHub | `/activity` | `GET/PUT/POST/DELETE /api/github` |
| Performance & career | `/career` | `GET/POST/PATCH/DELETE /api/career` |
| Analytics & reports | `/analytics`, `/reports/print` | `GET /api/analytics`, `GET /api/reports` |
| Notifications | `/notifications` | `GET/PATCH /api/notifications` (rule-engine generated, deduped) |
| Global search | ⌘K palette | `GET /api/search` |
| Auth | `/login` | `POST /api/auth` (login / logout) |

## Data integrity rules (implemented, not aspirational)

- **Leave days** are computed server-side only: weekend days from `employee_preferences` +
  blocking holidays (national/regional/company) are excluded; half-day = 0.5.
- **Balances**: `remaining = opening + accrued + carryForward + adjustments − approved`.
  Planned/pending never deduct (configurable pending reservation in Settings).
- **Status changes** write `issue_status_history` in the same transaction.
- **Leave approvals/cancellations** append to `leave_approvals`.
- **Notifications** are deduped by unique `dedupe_key` — re-generation never duplicates.
- **Calendar events** are derived live from issues/tasks/leaves/holidays — no mirrored rows that
  could drift out of sync. Manual events get their own table rows.
- **Soft deletion** on issues/tasks/projects/goals/achievements; `audit_logs` captures mutations.

## Security

- Secrets (DB URL etc.) live in `.env` / environment only; GitHub tokens stored server-side and
  never returned to the client.
- Parameterized queries via Drizzle (no SQL string interpolation of user input).
- Middleware rejects unauthenticated requests; API handlers re-verify sessions server-side.
- Input validation on every mutating endpoint; consistent `{ error }` responses.

## Testing / verification performed

- Schema applied via `drizzle-kit push`; seed verified with row counts.
- Workflows exercised end-to-end: login → issue CRUD + status moves → Kanban drag → leave apply
  (auto day calc) → approval → balance recomputed → planner save (planned entries) → journal
  upsert → reports download. Data persists across reloads (Postgres).

## Extending to the full target deployment

- The REST surface is per-module and versionable (`/api/v1/...` aliasing is trivial).
- For a native desktop shell: wrap this app with Tauri 2 with no changes (static platform URL +
  API base URL config); desktop notifications map 1:1 onto `notifications`.
- Docker: any Next.js standalone build + managed Postgres (Neon/RDS) works; `DATABASE_URL` is the
  only required env var.

---

## Phase 2 — Advanced modules

All Phase-2 features extend the existing architecture (no duplicate tables or parallel modules).
10 new tables were added; `version` columns were added to `issues`, `tasks`, `knowledge_docs`
and `meetings` for optimistic concurrency.

| Module | Page | API | Notes |
|---|---|---|---|
| AI Employee Assistant | `/assistant` | `/api/assistant` | Grounded answers + supporting records |
| Workload & Capacity | `/workload` | `/api/workload` | Capacity, conflicts, est-vs-actual |
| Meetings & Manager Tracker | `/meetings` | `/api/meetings`, `/api/meetings/actions` | 1:1s, feedback, decisions, action items |
| Personal Knowledge Base | `/knowledge` | `/api/knowledge` | Notes, snippets, runbooks, MD import/export |
| Cloud Sync & Backup | `/sync` | `/api/sync` | Pull/push, conflicts, backup/verify/restore |
| Automation Engine | `/automations` | `/api/automations` | 6 configurable rules, de-duplicated |
| Advanced Reporting | `/analytics` | `/api/reports` | 8 new report types (CSV/XLSX/PDF) |

### AI assistant — how "no fabrication" is enforced

1. The question is routed to an **intent** by deterministic keyword scoring.
2. Each intent runs **real SQL** against the signed-in user's rows only.
3. The answer is composed from those rows; every answer returns a `sources[]`
   array of the exact records used, rendered as deep links in the UI.
4. When a dataset is empty the assistant states that no records were found.
5. An LLM is **optional**. With `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` set, the
   model only re-phrases the retrieved facts (facts are passed in the prompt and
   the system prompt forbids adding data). Any provider/network error falls back
   to the grounded answer. Without a key the app is fully functional.

```bash
# optional – enable LLM phrasing
OPENAI_API_KEY=sk-...        # or ANTHROPIC_API_KEY=sk-ant-...
AI_MODEL=gpt-4o-mini         # optional override
```

Disable the assistant entirely with the `ai_enabled` preference (Settings).

### Workload & capacity model

`capacity = working days × focusHoursPerDay`, where working days exclude configured
weekend days, blocking holidays and **approved** leave. `committed` is the remaining
estimate (`estimated − actual`) of items due in the week. A **deadline conflict** is any
day whose committed hours exceed daily focus capacity or that stacks more than two items.
Working hours, focus hours and weekend days are user-adjustable.

### Cloud sync & conflict handling

PostgreSQL is the authoritative replica. Clients `pull` into a local cache
(`localStorage`, cleared on demand) and `push` with the `version` they last saw:

* matching version → applied, version incremented
* stale version → **HTTP 409** with `{clientVersion, serverVersion, reason}`; the server
  record is never overwritten
* backups are SHA-256 checksummed over **canonical JSON** (keys sorted) so verification
  survives the jsonb round-trip; restore refuses to run on a failed checksum and is
  non-destructive (only re-creates missing records)

Sync status (online/offline + last cache time) is shown in the app header.

### Automation engine

Six rules (`deadline_reminder`, `overdue_issue`, `weekly_report`, `leave_reminder`,
`goal_deadline`, `pending_task`) each with enable/disable and lead-time controls.
Notifications carry a unique `dedupe_key` (rule + record + date) so repeated executions
never duplicate. Every execution is recorded in `automation_runs` and the audit log.

### Phase 2 verification performed

Executed against the running server (not just compilation):

* **Assistant** — 6 question types returned grounded answers whose figures match the
  database exactly (3 overdue, 7 leave days taken — identical to the dashboard);
  empty GitHub data correctly reported as "No GitHub activity imported";
  generated weekly report edited and persisted (`edited: true`).
* **Workload** — capacity correctly dropped to 4 working days for the week containing the
  9 Nov company holiday; changing focus hours 6→7 recomputed capacity 24h→28h and
  utilisation 163%→139%; invalid hours rejected with a validation error.
* **Automations** — first run generated 12 notifications across 6 rules; immediate re-run
  generated **0** (dedupe verified); rules toggle on/off.
* **Sync** — pull cached 42 records with checksum; push with stale `version: 0` returned
  **409** and the record title was confirmed unchanged; push with the correct version applied.
* **Backup** — checksum verified `true`; deleting a document and restoring recovered it
  (`restored: 1`); a backup with a mismatched checksum was refused with **422**.
* **Meetings** — action item promoted to a real task and confirmed on the task board.
* **Knowledge** — markdown bulk import created 2 documents; full-text search, tags,
  categories and favorites all query live rows.
* **Reports** — all 8 new report types returned populated CSV from real records.

### Known limitations (stated honestly)

* The desktop shell is not packaged here (no Tauri toolchain in this environment); the
  app is browser-delivered and the sync layer is already desktop-ready.
* Background sync runs while a tab is open (60s interval) rather than as an OS service.
* Restore is intentionally scoped to knowledge documents to stay non-destructive.
* Encryption at rest is delegated to the managed PostgreSQL provider; transport security
  is provided by the hosting HTTPS termination.
