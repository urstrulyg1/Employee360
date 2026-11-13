import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Authentication is disabled in this deployment: the app runs as a single-user
 * workspace and every route opens directly. API handlers still resolve the
 * default employee account server-side (see src/lib/auth.ts).
 */
export function middleware(req: NextRequest) {
  redirectLoginToHome(req);
  return NextResponse.next();
}

function redirectLoginToHome(_req: NextRequest) {
  // no-op kept for clarity — /login itself redirects to "/" (see app/login/page.tsx)
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
