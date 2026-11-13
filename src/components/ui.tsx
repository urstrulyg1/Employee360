"use client";

import React, { useEffect } from "react";
import { cn } from "@/lib/utils";
import { toneClasses, type Tone, label as domainLabel, toneOf } from "@/lib/domain";
import { Loader2, X, Inbox } from "lucide-react";

/* --------------------------------------------------------------- Button */
type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "subtle" | "ghost" | "danger" | "outline";
  size?: "sm" | "md" | "xs";
  loading?: boolean;
};
export function Button({ className, variant = "primary", size = "md", loading, children, disabled, ...rest }: BtnProps) {
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-all select-none",
        "disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]",
        size === "sm" && "h-8 px-3 text-[13px]",
        size === "md" && "h-9 px-3.5 text-[13px]",
        size === "xs" && "h-7 px-2.5 text-xs rounded-md",
        variant === "primary" && "bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm shadow-indigo-950/20",
        variant === "subtle" && "bg-zinc-900/[0.06] hover:bg-zinc-900/[0.1] text-zinc-800 dark:bg-white/[0.07] dark:hover:bg-white/[0.12] dark:text-zinc-100",
        variant === "ghost" && "hover:bg-zinc-900/[0.05] dark:hover:bg-white/[0.07] text-zinc-600 dark:text-zinc-300",
        variant === "outline" && "border border-zinc-200 dark:border-zinc-700/80 hover:bg-zinc-900/[0.04] dark:hover:bg-white/[0.05] text-zinc-700 dark:text-zinc-200",
        variant === "danger" && "bg-red-600/90 hover:bg-red-500 text-white",
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 className="size-3.5 animate-spin" />}
      {children}
    </button>
  );
}

export function IconButton({ className, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-lg text-zinc-500 dark:text-zinc-400",
        "hover:bg-zinc-900/[0.05] hover:text-zinc-800 dark:hover:bg-white/[0.08] dark:hover:text-zinc-100 transition-colors",
        className,
      )}
      {...rest}
    />
  );
}

/* ---------------------------------------------------------------- Input */
export const inputCls =
  "h-9 w-full rounded-lg border border-zinc-200 bg-white px-3 text-[13px] text-zinc-900 placeholder:text-zinc-400 transition-colors " +
  "focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15 focus:outline-none " +
  "dark:border-zinc-700/80 dark:bg-zinc-900/60 dark:text-zinc-100 dark:placeholder:text-zinc-500";

export function Input({ className, ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputCls, className)} {...rest} />;
}
export function Textarea({ className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(inputCls, "h-auto min-h-20 py-2", className)} {...rest} />;
}
export function Select({ className, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(inputCls, "appearance-none pr-8 bg-no-repeat cursor-pointer", className)}
      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")", backgroundPosition: "right 0.7rem center" }}
      {...rest}>
      {children}
    </select>
  );
}

export function Field({ label, children, hint, className }: { label: string; children: React.ReactNode; hint?: string; className?: string }) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-zinc-400 dark:text-zinc-500">{hint}</span>}
    </label>
  );
}

/* ---------------------------------------------------------------- Badge */
export function Badge({ value, className }: { value: string; className?: string }) {
  const t: Tone = toneOf(value);
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset whitespace-nowrap",
      toneClasses[t].chip, className,
    )}>
      <span className={cn("size-1.5 rounded-full", toneClasses[t].dot)} />
      {domainLabel(value)}
    </span>
  );
}

export function Tag({ children, tone = "zinc" }: { children: React.ReactNode; tone?: Tone }) {
  return (
    <span className={cn("inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset", toneClasses[tone].chip)}>
      {children}
    </span>
  );
}

/* ----------------------------------------------------------------- Card */
export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-zinc-200/80 bg-white shadow-[0_1px_2px_rgba(16,16,20,0.04)]",
        "dark:border-white/[0.07] dark:bg-[#121215] dark:shadow-none",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action, className }: { title: string; subtitle?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-3 border-b border-zinc-100 px-4 py-3 dark:border-white/[0.06]", className)}>
      <div>
        <h3 className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/* ----------------------------------------------------------------- Dialog */
export function Modal({ open, onClose, title, children, wide }: {
  open: boolean; onClose: () => void; title: React.ReactNode; children: React.ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const fn = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-10" role="dialog" aria-modal>
      <div className="fixed inset-0 bg-zinc-950/50 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />
      <div className={cn(
        "relative z-10 w-full rounded-2xl border border-zinc-200 bg-white shadow-2xl animate-scale-in",
        "dark:border-white/10 dark:bg-[#151518]", wide ? "max-w-3xl" : "max-w-lg",
      )}>
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-3.5 dark:border-white/[0.06]">
          <h2 className="text-sm font-semibold">{title}</h2>
          <IconButton onClick={onClose} aria-label="Close"><X className="size-4" /></IconButton>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- States */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-zinc-200/70 dark:bg-white/[0.06]", className)} />;
}

export function Empty({ title, hint, action, icon }: { title: string; hint?: string; action?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-200 py-12 text-center dark:border-white/[0.08]">
      <div className="grid size-10 place-items-center rounded-xl bg-zinc-100 text-zinc-400 dark:bg-white/[0.05] dark:text-zinc-500">
        {icon ?? <Inbox className="size-5" />}
      </div>
      <p className="text-[13px] font-medium text-zinc-700 dark:text-zinc-300">{title}</p>
      {hint && <p className="max-w-xs text-xs text-zinc-500 dark:text-zinc-500">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-10 justify-center text-zinc-500">
      <Loader2 className="size-4 animate-spin" />
      <span className="text-xs">{label ?? "Loading…"}</span>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-white">{title}</h1>
        {subtitle && <p className="mt-0.5 text-[13px] text-zinc-500 dark:text-zinc-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ Tabs */
export function Tabs({ tabs, active, onChange }: { tabs: { key: string; label: React.ReactNode }[]; active: string; onChange: (k: string) => void }) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-zinc-200/80 bg-zinc-50 p-0.5 dark:border-white/[0.07] dark:bg-white/[0.04]">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={cn(
            "rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors",
            active === t.key
              ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-white"
              : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Progress({ value, tone = "indigo", className }: { value: number; tone?: Tone; className?: string }) {
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-zinc-200/70 dark:bg-white/[0.07]", className)}>
      <div className={cn("h-full rounded-full transition-all duration-500", toneClasses[tone].bar)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-zinc-300/80 bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] font-medium text-zinc-500 dark:border-white/15 dark:bg-white/[0.06] dark:text-zinc-400">
      {children}
    </kbd>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: React.ReactNode }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex items-center gap-2.5 group">
      <span className={cn(
        "relative h-5 w-9 rounded-full transition-colors",
        checked ? "bg-indigo-600" : "bg-zinc-300 dark:bg-zinc-700",
      )}>
        <span className={cn(
          "absolute top-0.5 size-4 rounded-full bg-white shadow transition-all",
          checked ? "left-[18px]" : "left-0.5",
        )} />
      </span>
      {label && <span className="text-[13px] text-zinc-600 dark:text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors">{label}</span>}
    </button>
  );
}

export function Confirm({ open, title, message, onCancel, onConfirm, danger }: {
  open: boolean; title: string; message: string; onCancel: () => void; onConfirm: () => void; danger?: boolean;
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <p className="text-[13px] text-zinc-600 dark:text-zinc-400">{message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="subtle" onClick={onCancel}>Cancel</Button>
        <Button variant={danger ? "danger" : "primary"} onClick={onConfirm}>Confirm</Button>
      </div>
    </Modal>
  );
}
