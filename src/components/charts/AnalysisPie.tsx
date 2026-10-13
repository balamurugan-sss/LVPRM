"use client";

import { useState } from "react";
import { Cell, Pie, PieChart, Tooltip } from "recharts";
import { cx, fmtH } from "../ui";

type Slice = { name: string; value: number; color: string };
type Period = { label: string; from: string; to: string; slices: Slice[] };

const TABS = [
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
] as const;

export function AnalysisPie({ data, title = "Time analysis", size = 210 }: { data: Record<"week" | "month" | "year", Period>; title?: string; size?: number }) {
  const [tab, setTab] = useState<"week" | "month" | "year">("week");
  const period = data[tab];
  const slices = period.slices.filter((s) => s.value > 0);
  const total = slices.reduce((s, x) => s + x.value, 0);
  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <p className="mt-0.5 text-xs text-muted">{period.from} → {period.to}</p>
        </div>
        <div className="flex rounded-xl border hairline bg-elev/40 p-1" role="tablist" aria-label="Period">
          {TABS.map((t) => (
            <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
              className={cx("rounded-lg px-3 py-1 text-xs font-medium", tab === t.key ? "bg-accent text-white" : "text-muted hover:text-fg")}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4 flex flex-col items-center gap-5">
        <div className="relative shrink-0" style={{ width: size, height: size }}>
          <PieChart width={size} height={size}>
            <Tooltip
              formatter={(v) => `${fmtH(Number(v))} h`}
              contentStyle={{ background: "rgb(var(--elev))", border: "1px solid rgb(var(--line) / 0.1)", borderRadius: 12, color: "rgb(var(--fg))", fontSize: 12 }}
            />
            <Pie isAnimationActive={false} data={total ? slices : [{ name: "No data", value: 1, color: "rgb(var(--elev))" }]}
              dataKey="value" nameKey="name" innerRadius="0%" outerRadius="95%" paddingAngle={slices.length > 1 ? 1 : 0} stroke="rgb(var(--card))" strokeWidth={slices.length > 1 ? 2 : 0}>
              {(total ? slices : [{ color: "rgb(var(--elev))" }]).map((s, i) => <Cell key={i} fill={s.color} />)}
            </Pie>
          </PieChart>
        </div>
        <ul className="grid w-full grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {period.slices.map((s) => (
            <li key={s.name} className="flex items-center justify-between gap-3 whitespace-nowrap">
              <span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />{s.name}</span>
              <span className="tabular-nums text-muted">
                {fmtH(s.value)}h <span className="text-subtle">· {total ? Math.round((s.value / total) * 100) : 0}%</span>
              </span>
            </li>
          ))}
          <li className="flex items-center justify-between border-t hairline pt-2 font-semibold sm:col-span-2">
            <span>Total</span><span className="tabular-nums">{fmtH(Math.round(total * 100) / 100)}h</span>
          </li>
        </ul>
      </div>
    </section>
  );
}
