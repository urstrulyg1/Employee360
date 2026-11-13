"use client";

import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, AreaChart, Area, LineChart, Line, Legend,
} from "recharts";
import { toneClasses, toneOf, type Tone } from "@/lib/domain";
import { format } from "date-fns";

const axisStyle = { fontSize: 10, fill: "#71717a" } as const;

function ThemedTooltip({ active, payload, label }: { active?: boolean; payload?: { name?: string; value?: number; color?: string }[]; label?: string | number }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-zinc-200 bg-white/95 px-2.5 py-1.5 text-xs shadow-lg dark:border-white/10 dark:bg-zinc-900/95">
      {label !== undefined && <div className="mb-0.5 font-medium text-zinc-700 dark:text-zinc-300">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
          <span className="size-1.5 rounded-full" style={{ background: p.color ?? "#6366f1" }} />
          <span>{p.name}: <b className="text-zinc-800 dark:text-zinc-100">{p.value}</b></span>
        </div>
      ))}
    </div>
  );
}

export function MiniBars({ data, x, y, color = "#6366f1" }: { data: Record<string, unknown>[]; x: string; y: string; color?: string }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 4, left: -22, right: 4, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,120,140,0.12)" vertical={false} />
        <XAxis dataKey={x} tick={axisStyle} tickLine={false} axisLine={false} />
        <YAxis tick={axisStyle} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip content={<ThemedTooltip />} cursor={{ fill: "rgba(120,120,140,0.08)" }} />
        <Bar dataKey={y} fill={color} radius={[4, 4, 0, 0]} maxBarSize={26} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function GroupedBars({ data, keys, colors }: { data: Record<string, unknown>[]; keys: string[]; colors: string[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, left: -22, right: 4, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,120,140,0.12)" vertical={false} />
        <XAxis dataKey="month" tick={axisStyle} tickLine={false} axisLine={false} />
        <YAxis tick={axisStyle} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip content={<ThemedTooltip />} cursor={{ fill: "rgba(120,120,140,0.08)" }} />
        <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={6} />
        {keys.map((k, i) => <Bar key={k} dataKey={k} fill={colors[i % colors.length]} radius={[3, 3, 0, 0]} maxBarSize={18} />)}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TrendArea({ data, keys, colors }: { data: Record<string, unknown>[]; keys: string[]; colors: string[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 4, left: -18, right: 4, bottom: 0 }}>
        <defs>
          {keys.map((k, i) => (
            <linearGradient key={k} id={`g-${k}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colors[i % colors.length]} stopOpacity={0.25} />
              <stop offset="100%" stopColor={colors[i % colors.length]} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,120,140,0.12)" vertical={false} />
        <XAxis dataKey="month" tick={axisStyle} tickLine={false} axisLine={false} />
        <YAxis tick={axisStyle} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip content={<ThemedTooltip />} />
        <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={6} />
        {keys.map((k, i) => (
          <Area key={k} type="monotone" dataKey={k} stroke={colors[i % colors.length]} strokeWidth={2} fill={`url(#g-${k})`} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function Donut({ data, nameKey = "name", valueKey = "value", useTones = false, colors }: {
  data: Record<string, unknown>[]; nameKey?: string; valueKey?: string; useTones?: boolean; colors?: string[];
}) {
  const palette = colors ?? ["#6366f1", "#10b981", "#f59e0b", "#0ea5e9", "#f43f5e", "#8b5cf6", "#14b8a6", "#a1a1aa"];
  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie
          data={data} dataKey={valueKey} nameKey={nameKey}
          innerRadius={52} outerRadius={80} paddingAngle={2} strokeWidth={0}
        >
          {data.map((d, i) => (
            <Cell
              key={i}
              fill={useTones ? toneClasses[toneOf(String(d[nameKey]))].hex : palette[i % palette.length]}
            />
          ))}
        </Pie>
        <Tooltip content={<ThemedTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={6}
          formatter={(v) => <span className="text-zinc-500 dark:text-zinc-400">{formatLabel(String(v))}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function ThinLine({ data, keys, colors }: { data: Record<string, unknown>[]; keys: string[]; colors: string[] }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data} margin={{ top: 4, left: -18, right: 4, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,120,140,0.12)" vertical={false} />
        <XAxis dataKey="week" tick={axisStyle} tickLine={false} axisLine={false} tickFormatter={(v) => formatWeek(String(v))} />
        <YAxis tick={axisStyle} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip content={<ThemedTooltip />} />
        {keys.map((k, i) => (
          <Line key={k} type="monotone" dataKey={k} stroke={colors[i % colors.length]} strokeWidth={2} dot={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function WeekBars({ data, color = "#10b981" }: { data: { week: string; value: number }[]; color?: string }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 4, left: -22, right: 4, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,120,140,0.12)" vertical={false} />
        <XAxis dataKey="week" tick={axisStyle} tickLine={false} axisLine={false} tickFormatter={(v) => formatWeek(String(v))} />
        <YAxis tick={axisStyle} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip content={<ThemedTooltip />} cursor={{ fill: "rgba(120,120,140,0.08)" }} />
        <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function formatWeek(ymd: string) {
  try { return format(new Date(ymd + "T00:00:00"), "d MMM"); } catch { return ymd; }
}
export function formatLabel(v: string) {
  return v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
export { toneClasses };
