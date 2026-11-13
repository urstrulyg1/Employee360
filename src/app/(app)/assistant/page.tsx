"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  Sparkles, Send, FileText, Pencil, Check, X, Trash2, Database, Plus,
  MessageSquare, ShieldCheck, Download,
} from "lucide-react";
import { api } from "@/lib/client";
import { Badge, Button, Card, CardHeader, Empty, Input, PageHeader, Skeleton, Tag, Textarea } from "@/components/ui";
import { inTz } from "@/lib/dates";
import { cn } from "@/lib/utils";

type Source = { kind: string; ref: string; label: string; href?: string };
type Msg = {
  id: string; role: "user" | "assistant"; content: string; intent: string | null;
  sources: Source[] | null; provider: string; edited: boolean; createdAt: string;
};
type Conv = { id: string; title: string; updatedAt: string };
type Meta = { enabled: boolean; llmConfigured: boolean; provider: string; conversations: Conv[]; messages: Msg[] };

const SUGGESTIONS = [
  "What did I work on last week?",
  "Which issues are overdue?",
  "What did I accomplish this month?",
  "Which projects need attention?",
  "Generate my weekly status report.",
  "Summarize my technical contributions.",
  "What are my upcoming holidays?",
  "How many leave days have I taken?",
  "What is my current workload?",
  "What meeting follow-ups are open?",
];

export default function AssistantPage() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [convId, setConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (id?: string | null) => {
    const r = await api.get<Meta>(`/api/assistant${id ? `?conversationId=${id}` : ""}`);
    setMeta(r);
    if (id) setMessages(r.messages);
  }, []);

  useEffect(() => { load().catch((e) => toast.error(e.message)); }, [load]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const ask = async (question: string) => {
    if (!question.trim() || busy) return;
    setBusy(true);
    const optimistic: Msg = { id: "tmp-" + Date.now(), role: "user", content: question, intent: null, sources: null, provider: "grounded", edited: false, createdAt: new Date().toISOString() };
    setMessages((m) => [...m, optimistic]);
    setQ("");
    try {
      const r = await api.post<{ conversationId: string; message: Msg }>("/api/assistant", { question, conversationId: convId });
      setConvId(r.conversationId);
      setMessages((m) => [...m.filter((x) => x.id !== optimistic.id), { ...optimistic, id: "u-" + r.message.id }, r.message]);
      load(r.conversationId);
    } catch (e) {
      setMessages((m) => m.filter((x) => x.id !== optimistic.id));
      toast.error(e instanceof Error ? e.message : "Assistant failed");
    } finally { setBusy(false); }
  };

  const saveEdit = async () => {
    if (!editing) return;
    try {
      await api.patch("/api/assistant", { messageId: editing.id, content: editing.text });
      setMessages((m) => m.map((x) => x.id === editing.id ? { ...x, content: editing.text, edited: true } : x));
      setEditing(null);
      toast.success("Report updated");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); }
  };

  const copyMd = (text: string) => {
    navigator.clipboard?.writeText(text).then(() => toast.success("Copied as Markdown")).catch(() => toast.error("Copy failed"));
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader
        title="AI Assistant"
        subtitle="Answers are computed from your own records — nothing is invented"
        actions={
          <>
            <Tag tone={meta?.llmConfigured ? "violet" : "teal"}>
              {meta ? (meta.llmConfigured ? `LLM: ${meta.provider}` : "Grounded engine") : "…"}
            </Tag>
            <Button size="sm" variant="outline" onClick={() => { setConvId(null); setMessages([]); }}>
              <Plus className="size-3.5" /> New chat
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[250px_1fr]">
        {/* history */}
        <Card className="h-fit lg:sticky lg:top-[4.5rem]">
          <CardHeader title="Conversations" subtitle={`${meta?.conversations.length ?? 0} saved`} />
          <div className="max-h-[420px] overflow-y-auto p-1.5">
            {!meta && <div className="space-y-2 p-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10" />)}</div>}
            {meta?.conversations.length === 0 && <p className="px-3 py-6 text-center text-xs text-zinc-400">No conversations yet.</p>}
            {meta?.conversations.map((c) => (
              <div key={c.id} className={cn("group flex items-center gap-1 rounded-lg px-2 py-1.5", convId === c.id && "bg-indigo-600/[0.08] dark:bg-indigo-400/[0.1]")}>
                <button onClick={() => { setConvId(c.id); load(c.id); }} className="min-w-0 flex-1 text-left">
                  <p className="truncate text-[12px] font-medium">{c.title}</p>
                  <p className="text-[10px] text-zinc-400">{inTz(c.updatedAt, "Asia/Kolkata")}</p>
                </button>
                <button
                  onClick={async () => {
                    await api.del("/api/assistant", { conversationId: c.id }).catch(() => {});
                    if (convId === c.id) { setConvId(null); setMessages([]); }
                    load();
                  }}
                  className="opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <Trash2 className="size-3.5 text-red-500" />
                </button>
              </div>
            ))}
          </div>
        </Card>

        {/* chat */}
        <div className="space-y-3">
          <Card className="flex min-h-[460px] flex-col">
            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              {!messages.length && (
                <div className="py-6">
                  <div className="mb-4 flex items-start gap-3 rounded-xl border border-indigo-500/20 bg-indigo-500/[0.05] p-3.5">
                    <ShieldCheck className="mt-0.5 size-4 shrink-0 text-indigo-400" />
                    <p className="text-[12px] leading-relaxed text-indigo-700 dark:text-indigo-300">
                      This assistant reads only <b>your</b> issues, tasks, journals, leaves, meetings, goals and knowledge base.
                      Every answer lists the exact records it used. If there is no data, it says so rather than guessing.
                    </p>
                  </div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Try asking</p>
                  <div className="flex flex-wrap gap-2">
                    {SUGGESTIONS.map((sug) => (
                      <button key={sug} onClick={() => ask(sug)}
                        className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-[12px] text-zinc-600 transition-colors hover:border-indigo-400 hover:text-indigo-600 dark:border-white/[0.08] dark:text-zinc-300 dark:hover:text-indigo-300">
                        {sug}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m) => (
                <div key={m.id} className={cn("flex gap-3", m.role === "user" && "justify-end")}>
                  {m.role === "assistant" && (
                    <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white">
                      <Sparkles className="size-3.5" />
                    </div>
                  )}
                  <div className={cn("min-w-0 max-w-[86%] rounded-xl px-3.5 py-2.5",
                    m.role === "user"
                      ? "bg-indigo-600 text-white"
                      : "border border-zinc-200 bg-zinc-50/60 dark:border-white/[0.07] dark:bg-white/[0.03]")}>
                    {editing?.id === m.id ? (
                      <div className="space-y-2">
                        <Textarea rows={12} className="font-mono text-[12px]" value={editing.text} onChange={(e) => setEditing({ ...editing, text: e.target.value })} />
                        <div className="flex justify-end gap-1.5">
                          <Button size="xs" variant="subtle" onClick={() => setEditing(null)}><X className="size-3" /> Cancel</Button>
                          <Button size="xs" onClick={saveEdit}><Check className="size-3" /> Save</Button>
                        </div>
                      </div>
                    ) : (
                      <Markdown text={m.content} inverted={m.role === "user"} />
                    )}

                    {m.role === "assistant" && editing?.id !== m.id && (
                      <>
                        {m.sources && m.sources.length > 0 && (
                          <details className="mt-3 border-t border-zinc-200 pt-2 dark:border-white/[0.07]">
                            <summary className="cursor-pointer text-[11px] font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
                              <Database className="mb-0.5 mr-1 inline size-3" />
                              {m.sources.length} supporting record(s)
                            </summary>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {m.sources.map((sc, i) => sc.href ? (
                                <Link key={i} href={sc.href} className="rounded-md bg-zinc-200/60 px-1.5 py-0.5 text-[10.5px] text-zinc-600 hover:text-indigo-600 dark:bg-white/[0.07] dark:text-zinc-300">
                                  {sc.kind}: {sc.label}
                                </Link>
                              ) : (
                                <span key={i} className="rounded-md bg-zinc-200/60 px-1.5 py-0.5 text-[10.5px] text-zinc-600 dark:bg-white/[0.07] dark:text-zinc-300">{sc.kind}: {sc.label}</span>
                              ))}
                            </div>
                          </details>
                        )}
                        <div className="mt-2 flex items-center gap-2 border-t border-zinc-200 pt-2 dark:border-white/[0.07]">
                          <span className="text-[10px] text-zinc-400">{m.provider === "llm" ? "LLM phrasing · facts from DB" : "Grounded"}{m.edited ? " · edited" : ""}</span>
                          <div className="ml-auto flex gap-1">
                            <Button size="xs" variant="ghost" onClick={() => setEditing({ id: m.id, text: m.content })}><Pencil className="size-3" /> Edit</Button>
                            <Button size="xs" variant="ghost" onClick={() => copyMd(m.content)}><FileText className="size-3" /> Copy</Button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))}
              {busy && (
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <Sparkles className="size-3.5 animate-pulse text-indigo-400" /> Querying your records…
                </div>
              )}
              <div ref={endRef} />
            </div>

            <div className="border-t border-zinc-100 p-3 dark:border-white/[0.06]">
              <div className="flex gap-2">
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(q); } }}
                  placeholder="Ask about your work, issues, leaves, workload…"
                  disabled={busy}
                />
                <Button onClick={() => ask(q)} loading={busy} disabled={!q.trim()}><Send className="size-3.5" /></Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

/** Minimal markdown renderer (headings, bold, bullets, code) — no external deps. */
function Markdown({ text, inverted }: { text: string; inverted?: boolean }) {
  const lines = text.split("\n");
  return (
    <div className={cn("space-y-1 text-[12.5px] leading-relaxed", inverted ? "text-white" : "text-zinc-700 dark:text-zinc-300")}>
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1" />;
        if (line.startsWith("## ")) return <p key={i} className={cn("text-[13.5px] font-semibold", inverted ? "text-white" : "text-zinc-900 dark:text-white")}>{line.slice(3)}</p>;
        if (line.startsWith("**") && line.endsWith("**")) return <p key={i} className={cn("pt-1.5 text-[11px] font-semibold uppercase tracking-wider", inverted ? "text-indigo-100" : "text-zinc-500 dark:text-zinc-400")}>{line.replace(/\*\*/g, "")}</p>;
        if (line.startsWith("- ")) return <p key={i} className="flex gap-1.5 pl-1"><span className="opacity-40">•</span><span>{inline(line.slice(2))}</span></p>;
        if (line.startsWith("_") && line.endsWith("_")) return <p key={i} className="italic opacity-60">{line.replace(/_/g, "")}</p>;
        return <p key={i}>{inline(line)}</p>;
      })}
    </div>
  );
}

function inline(s: string) {
  const parts = s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) return <b key={i}>{p.slice(2, -2)}</b>;
    if (p.startsWith("`") && p.endsWith("`")) return <code key={i} className="rounded bg-zinc-200/70 px-1 font-mono text-[11px] dark:bg-white/[0.1]">{p.slice(1, -1)}</code>;
    return <span key={i}>{p}</span>;
  });
}
