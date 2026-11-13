import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { getSessionUser, type SessionUser } from "@/lib/auth";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function ok(data: unknown, status = 200) {
  return Response.json(data, { status });
}

export function fail(status: number, message: string) {
  return Response.json({ error: message }, { status });
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new ApiError(401, "Not authenticated");
  return user;
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new ApiError(400, "Invalid JSON body");
  }
}

type Ctx = { params: Promise<Record<string, string>> };
type Handler = (req: Request, ctx: Ctx) => Promise<Response>;

/** Centralized error handling for route handlers. */
export function handle(fn: Handler): Handler {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof ApiError) return fail(e.status, e.message);
      console.error("[api:error]", e);
      return fail(500, "Internal server error");
    }
  };
}

export async function audit(
  userId: string | null,
  entity: string,
  entityId: string | null,
  action: string,
  metadata?: Record<string, unknown>,
) {
  try {
    await db.insert(auditLogs).values({ userId, entity, entityId, action, metadata });
  } catch (e) {
    console.error("[audit:error]", e);
  }
}

export function pageParams(url: string) {
  const u = new URL(url);
  const page = Math.max(1, Number(u.searchParams.get("page") ?? 1) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(u.searchParams.get("pageSize") ?? 50) || 50));
  return { u, page, pageSize, offset: (page - 1) * pageSize };
}
