"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Empty, Skeleton } from "@/components/ui";
import { Printer } from "lucide-react";

/** Print-ready report view — open in browser and “Save as PDF”. */
export default function PrintReportPage() {
  return <Suspense fallback={<Skeleton className="m-8 h-96" />}><PrintInner /></Suspense>;
}

function PrintInner() {
  const params = useSearchParams();
  const type = params.get("type") ?? "issues";
  const extra = ["month", "year"].map((k) => params.get(k) ? `&${k}=${params.get(k)}` : "").join("");
  const [rows, setRows] = useState<Record<string, string | number | null>[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/reports?type=${type}&format=csv${extra}`)
      .then((r) => r.text())
      .then((csv) => {
        const lines = csv.split("\n").filter(Boolean);
        if (!lines.length || lines[0] === "No records") { setRows([]); return; }
        const parseCsvLine = (line: string) => {
          const out: string[] = [];
          let cur = "", inQ = false;
          for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
            else if (ch === "," && !inQ) { out.push(cur); cur = ""; }
            else cur += ch;
          }
          out.push(cur);
          return out;
        };
        const headers = parseCsvLine(lines[0]);
        setRows(lines.slice(1).map((l) => {
          const cells = parseCsvLine(l);
          return Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? null]));
        }));
      })
      .catch((e) => setError(e.message));
  }, [type, extra]);

  if (error) return <div className="p-10"><Empty title="Could not load report" hint={error} /></div>;

  return (
    <div className="mx-auto max-w-5xl p-8 text-zinc-900">
      <div className="no-print mb-4 flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-200">
        <p className="text-[12.5px]">Print-ready view — choose <b>Save as PDF</b> in the print dialog.</p>
        <Button size="sm" onClick={() => window.print()}><Printer className="size-3.5" /> Print / Save PDF</Button>
      </div>

      <div className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">Employee 360 Report</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight capitalize">{type.replace("-", " ")}</h1>
        <p className="text-xs text-zinc-400">Generated {new Date().toLocaleString("en-GB", { timeZone: "Asia/Kolkata" })} (IST)</p>
      </div>

      {!rows ? <Skeleton className="h-96" /> : !rows.length ? <Empty title="No records for this report" /> : (
        <table className="w-full border-collapse text-left text-[11.5px]">
          <thead>
            <tr>{Object.keys(rows[0]).map((h) => <th key={h} className="border-b-2 border-zinc-900 px-2 py-2 font-semibold">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-zinc-100">
                {Object.values(r).map((v, j) => <td key={j} className="max-w-[260px] truncate px-2 py-1.5">{String(v ?? "—")}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="mt-4 text-[10px] text-zinc-400">All figures computed from the Employee 360 PostgreSQL database at generation time.</p>
    </div>
  );
}
