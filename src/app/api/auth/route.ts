import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createSession, destroySession, getSessionUser, SESSION_COOKIE, verifyPassword } from "@/lib/auth";
import { handle, ok, ApiError, readJson, audit } from "@/lib/api";

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};
const COOKIE_MAX_AGE = 14 * 24 * 3600;

export const POST = handle(async (req) => {
  const body = await readJson<{ action: string; email?: string; password?: string }>(req);

  if (body.action === "logout") {
    const user = await getSessionUser();
    if (user) {
      const { cookies } = await import("next/headers");
      const store = await cookies();
      const token = store.get(SESSION_COOKIE)?.value;
      if (token) await destroySession(token);
      await audit(user.id, "auth", user.id, "logout");
    }
    const res = ok({ loggedOut: true });
    res.headers.append("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; Max-Age=0`);
    return res;
  }

  if (body.action === "login") {
    const email = (body.email ?? "").trim().toLowerCase();
    const password = body.password ?? "";
    if (!email || !password) throw new ApiError(400, "Email and password are required.");

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new ApiError(401, "Invalid email or password.");
    }
    const { token, expiresAt } = await createSession(user.id, req.headers.get("user-agent"));
    await audit(user.id, "auth", user.id, "login");

    const res = ok({ user: { id: user.id, name: user.name, email: user.email, timezone: user.timezone } });
    const cookieBits = [COOKIE_OPTS.httpOnly && "HttpOnly", "SameSite=Lax", COOKIE_OPTS.secure && "Secure", "Path=/", `Max-Age=${COOKIE_MAX_AGE}`].filter(Boolean).join("; ");
    void expiresAt;
    res.headers.append("Set-Cookie", `${SESSION_COOKIE}=${token}; ${cookieBits}`);
    return res;
  }

  throw new ApiError(400, "Unknown auth action.");
});
