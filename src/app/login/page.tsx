import Link from "next/link";
import { PanelsTopLeft, ArrowRight } from "lucide-react";

/**
 * Authentication is disabled for this workspace — /login simply routes home.
 */
export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0a0a0c] p-6 text-zinc-100">
      <div className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-950/40">
        <PanelsTopLeft className="size-5 text-white" />
      </div>
      <h1 className="text-xl font-semibold tracking-tight">Login is disabled</h1>
      <p className="max-w-sm text-center text-[13px] leading-relaxed text-zinc-400">
        This Employee 360 workspace runs in open single-user mode. Your workspace
        opens directly — no sign-in required.
      </p>
      <Link
        href="/"
        className="inline-flex h-9 items-center gap-2 rounded-lg bg-indigo-600 px-4 text-[13px] font-medium text-white transition-colors hover:bg-indigo-500"
      >
        Open workspace <ArrowRight className="size-4" />
      </Link>
    </div>
  );
}
