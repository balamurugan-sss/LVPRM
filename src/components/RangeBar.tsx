"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarRange } from "lucide-react";
import { addDays, monthEnd, monthStart, todayISO, weekStart } from "@/lib/dates";
import { cx } from "./ui";

type Opt = { id: number; name: string };

function presets() {
  const t = todayISO();
  const ws = weekStart(t);
  const fyStartYear = Number(t.slice(5, 7)) >= 4 ? Number(t.slice(0, 4)) : Number(t.slice(0, 4)) - 1;
  const lastMonth = addDays(monthStart(t), -1);
  return [
    { label: "4 weeks", from: addDays(ws, -21), to: addDays(ws, 6) },
    { label: "8 weeks", from: addDays(ws, -49), to: addDays(ws, 6) },
    { label: "This month", from: monthStart(t), to: monthEnd(t) },
    { label: "Last month", from: monthStart(lastMonth), to: monthEnd(lastMonth) },
    { label: "FY to date", from: `${fyStartYear}-04-01`, to: t },
  ];
}

export function RangeBar({ from, to, departments, extra }: { from: string; to: string; departments?: Opt[]; extra?: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const set = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams(sp.toString());
    Object.entries(patch).forEach(([k, v]) => (v ? q.set(k, v) : q.delete(k)));
    router.push(`${path}?${q.toString()}`);
  };
  return (
    <div className="card mb-5 flex flex-wrap items-end gap-3 p-4">
      <div className="flex items-center gap-2 self-center text-sm font-medium text-muted"><CalendarRange className="h-4 w-4 text-accent" />Period</div>
      <div className="flex flex-wrap rounded-xl border hairline bg-elev/40 p-1">
        {presets().map((p) => (
          <button key={p.label} onClick={() => set({ from: p.from, to: p.to })}
            className={cx("rounded-lg px-3 py-1.5 text-xs font-medium", p.from === from && p.to === to ? "bg-accent text-white" : "text-muted hover:text-fg")}>
            {p.label}
          </button>
        ))}
      </div>
      <div><label className="label">From</label><input type="date" className="input py-1.5" value={from} onChange={(e) => e.target.value && set({ from: e.target.value })} /></div>
      <div><label className="label">To</label><input type="date" className="input py-1.5" value={to} onChange={(e) => e.target.value && set({ to: e.target.value })} /></div>
      {departments && (
        <div className="min-w-[170px]">
          <label className="label">Department</label>
          <select className="input py-1.5" value={sp.get("dept") ?? ""} onChange={(e) => set({ dept: e.target.value || null })}>
            <option value="">All departments</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
      )}
      {extra}
    </div>
  );
}
