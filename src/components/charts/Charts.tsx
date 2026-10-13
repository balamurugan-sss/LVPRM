"use client";

import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

const axis = { stroke: "rgb(var(--subtle))", fontSize: 11, tickLine: false, axisLine: false } as const;
const grid = { stroke: "rgb(var(--line) / 0.07)", vertical: false } as const;
const tooltip = {
  contentStyle: { background: "rgb(var(--elev))", border: "1px solid rgb(var(--line) / 0.1)", borderRadius: 12, color: "rgb(var(--fg))", fontSize: 12 },
  labelStyle: { color: "rgb(var(--muted))" },
  cursor: { fill: "rgb(var(--line) / 0.04)" },
};

export const SERIES = {
  billable: "#ff8029",
  nonBillable: "#a78bfa",
  pending: "#60a5fa",
  rejected: "#f87171",
  planned: "#64748b",
};

export function StackedWeekChart({ data, height = 260 }: { data: { label: string; billable: number; nonBillable: number; pending: number }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} barSize={22} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid {...grid} />
        <XAxis dataKey="label" {...axis} />
        <YAxis {...axis} />
        <Tooltip {...tooltip} formatter={(v) => `${v} h`} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: "rgb(var(--muted))" }} />
        <Bar isAnimationActive={false} dataKey="billable" name="Approved billable" stackId="a" fill={SERIES.billable} radius={[0, 0, 4, 4]} />
        <Bar isAnimationActive={false} dataKey="nonBillable" name="Approved non-billable" stackId="a" fill={SERIES.nonBillable} />
        <Bar isAnimationActive={false} dataKey="pending" name="Pending approval" stackId="a" fill={SERIES.pending} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DailyBars({ data, target, height = 220 }: { data: { label: string; hours: number; color?: string }[]; target: number; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} barSize={28} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid {...grid} />
        <XAxis dataKey="label" {...axis} />
        <YAxis {...axis} domain={[0, Math.max(target + 2, ...data.map((d) => d.hours))]} />
        <Tooltip {...tooltip} formatter={(v) => `${v} h`} />
        <Bar isAnimationActive={false} dataKey="hours" name="Hours" radius={[6, 6, 6, 6]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.color ?? (d.hours >= target ? SERIES.billable : d.hours > 0 ? "#f59e0b" : "rgb(var(--elev))")} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TrendArea({ data, height = 240, target }: { data: { label: string; value: number }[]; height?: number; target?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="util" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES.billable} stopOpacity={0.45} />
            <stop offset="100%" stopColor={SERIES.billable} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid {...grid} />
        <XAxis dataKey="label" {...axis} />
        <YAxis {...axis} domain={[0, 110]} unit="%" />
        <Tooltip {...tooltip} formatter={(v) => `${v}%`} />
        {target !== undefined && (
          <Area isAnimationActive={false} type="monotone" dataKey={() => target} name="Target" stroke="rgb(var(--subtle))" strokeDasharray="4 4" fill="none" dot={false} />
        )}
        <Area isAnimationActive={false} type="monotone" dataKey="value" name="Billable utilization" stroke={SERIES.billable} strokeWidth={2} fill="url(#util)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function Donut({ data, height = 200, center }: { data: { name: string; value: number; color: string }[]; height?: number; center?: string }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="relative" style={{ height }}>
      <div className="flex h-full items-center justify-center">
        <PieChart width={height} height={height}>
          <Tooltip {...tooltip} formatter={(v) => `${v} h`} />
          <Pie isAnimationActive={false} data={total ? data : [{ name: "None", value: 1, color: "rgb(var(--elev))" }]} dataKey="value" innerRadius="68%" outerRadius="92%" paddingAngle={total ? 2 : 0} stroke="none">
            {(total ? data : [{ color: "rgb(var(--elev))" }]).map((d, i) => <Cell key={i} fill={d.color} />)}
          </Pie>
        </PieChart>
      </div>
      {center && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tabular-nums">{center}</span>
          <span className="text-[11px] text-muted">hours</span>
        </div>
      )}
    </div>
  );
}

export function PlannedActual({ data, height = 280 }: { data: { label: string; planned: number; approved: number; pending: number }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} barGap={4} barSize={16} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
        <CartesianGrid {...grid} />
        <XAxis dataKey="label" {...axis} />
        <YAxis {...axis} />
        <Tooltip {...tooltip} formatter={(v) => `${v} h`} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        <Bar isAnimationActive={false} dataKey="planned" name="Planned" fill={SERIES.planned} radius={[4, 4, 0, 0]} />
        <Bar isAnimationActive={false} dataKey="approved" name="Approved" fill={SERIES.billable} radius={[4, 4, 0, 0]} />
        <Bar isAnimationActive={false} dataKey="pending" name="Pending" fill={SERIES.pending} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
