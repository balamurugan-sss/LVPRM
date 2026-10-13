import Link from "next/link";
import { AlertTriangle, ArrowDownUp, CheckCheck, Clock3, Download, Gauge, Hourglass, Info, XCircle } from "lucide-react";
import { requirePageUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { getSettings, visibleEmployeeIds } from "@/lib/data";
import { fmtDate, fmtShort } from "@/lib/dates";
import { employeeUtilization, hoursRows, periodBreakdowns, rangeFromParams, weeklyTrend, type EmployeeUtil } from "@/lib/reports";
import { round2, utilizationPct } from "@/lib/rules";
import { Avatar, Card, cx, Empty, fmtH, Kpi, PageHeader, Pct, Progress } from "@/components/ui";
import { StackedWeekChart } from "@/components/charts/Charts";
import { AnalysisPie } from "@/components/charts/AnalysisPie";
import { RangeBar } from "@/components/RangeBar";

export const metadata = { title: "Employee utilization" };

const COLS: { key: keyof EmployeeUtil; label: string; num?: boolean }[] = [
  { key: "name", label: "Employee" },
  { key: "available", label: "Available", num: true },
  { key: "reported", label: "Reported", num: true },
  { key: "approved", label: "Approved", num: true },
  { key: "approvedBillable", label: "Billable", num: true },
  { key: "pending", label: "Pending", num: true },
  { key: "rejected", label: "Returned", num: true },
  { key: "utilization", label: "Billable util.", num: true },
  { key: "totalUtilization", label: "Total util.", num: true },
  { key: "overdueWeeks", label: "Overdue", num: true },
];

export default async function EmployeeReport({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const user = await requirePageUser(["manager", "admin"]);
  const settings = await getSettings();
  const { from, to } = rangeFromParams(sp);
  const dept = Number(sp.dept) || null;
  let ids = await visibleEmployeeIds(user);
  if (dept) {
    const inDept = new Set((await query<{ id: number }>("SELECT id FROM employees WHERE department_id = $1", [dept])).map((r) => r.id));
    ids = ids.filter((i) => inDept.has(i));
  }
  const [util, rows, departments, analysis] = await Promise.all([
    employeeUtilization(ids, from, to),
    hoursRows(ids, from, to),
    query<{ id: number; name: string }>("SELECT id, name FROM departments ORDER BY name"),
    periodBreakdowns(ids, new Date().toISOString().slice(0, 10)),
  ]);
  const sortKey = (COLS.find((c) => c.key === sp.sort)?.key ?? (sp.sort === "overdue" ? "overdueWeeks" : "utilization")) as keyof EmployeeUtil;
  const dir = sp.dir === "asc" ? 1 : -1;
  util.sort((a, b) => ((a[sortKey] ?? 0) < (b[sortKey] ?? 0) ? -1 : (a[sortKey] ?? 0) > (b[sortKey] ?? 0) ? 1 : 0) * dir);

  const sum = (k: keyof EmployeeUtil) => round2(util.reduce((s, u) => s + (u[k] as number), 0));
  const available = sum("available");
  const billable = sum("approvedBillable");
  const teamUtil = utilizationPct(billable, available);
  const teamTotal = utilizationPct(sum("approved"), available);
  const trend = weeklyTrend(rows, from, to);
  const qs = (patch: Record<string, string>) => new URLSearchParams({ ...sp, ...patch }).toString();

  return (
    <>
      <PageHeader title="Employee utilization" subtitle={`${fmtDate(from)} – ${fmtDate(to)} · ${util.length} people in scope`}
        actions={<a className="btn-primary" href={`/api/export?type=employees&from=${from}&to=${to}`}><Download className="h-4 w-4" />Export CSV</a>} />
      <RangeBar from={from} to={to} departments={departments} />

      <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Reported hours" value={fmtH(sum("reported"))} unit="h" icon={<Clock3 className="h-4 w-4" />} />
        <Kpi label="Approved hours" value={fmtH(sum("approved"))} unit="h" tone="ok" icon={<CheckCheck className="h-4 w-4" />} href={`/approvals?status=approved&from=${from}&to=${to}`} />
        <Kpi label="Pending approval" value={fmtH(sum("pending"))} unit="h" tone="info" icon={<Hourglass className="h-4 w-4" />} href={`/approvals?status=submitted&from=${from}&to=${to}`} />
        <Kpi label="Returned / rejected" value={fmtH(sum("rejected"))} unit="h" tone="bad" icon={<XCircle className="h-4 w-4" />} href={`/approvals?status=rejected&from=${from}&to=${to}`} />
        <Kpi label="Billable utilization" value={<Pct value={teamUtil} target={settings.utilizationTarget} />} hint={`Total ${teamTotal.toFixed(1)}% · target ${settings.utilizationTarget}%`} tone="accent" icon={<Gauge className="h-4 w-4" />} />
        <Kpi label="Missing / overdue" value={sum("overdueWeeks")} unit="weeks" tone="warn" icon={<AlertTriangle className="h-4 w-4" />} href={`/reports/employees?${qs({ sort: "overdueWeeks", dir: "desc" })}`} />
      </div>

      <div className="mb-5 grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <Card title="Weekly hours trend" subtitle="Approved billable, non-billable and pending">
          <StackedWeekChart data={trend.map((t) => ({ label: fmtShort(t.week), billable: t.billable, nonBillable: t.nonBillable, pending: t.pending }))} height={280} />
        </Card>
        <div className="space-y-5">
        <AnalysisPie data={analysis} title="Team time analysis" size={170} />
          <div className="card p-4 text-xs text-muted">
            <div className="mb-1 flex items-center gap-1.5 font-medium text-fg"><Info className="h-3.5 w-3.5 text-accent" />How utilization is calculated</div>
            <p><b className="text-fg">Billable utilization</b> = Approved billable hours ÷ Available working hours × 100.</p>
            <p className="mt-1">Available hours = working days ({settings.workingDays.length}/week) × standard day ({settings.standardDailyHours}h), excluding holidays and approved leave. <b className="text-fg">Total utilization</b> uses all approved hours.</p>
            <p className="mt-1">In this period: {fmtH(billable)}h ÷ {fmtH(available)}h = <b className="text-fg">{teamUtil.toFixed(1)}%</b></p>
          </div>
        </div>
      </div>

      <Card bodyClass="p-0" title="People" subtitle="Click a column to sort · click a person to drill into their timesheets">
        {util.length === 0 ? <Empty title="No people in scope" /> : (
          <div className="scrollbar-thin overflow-x-auto">
            <table className="table-base min-w-[1040px]">
              <thead>
                <tr>
                  {COLS.map((c) => (
                    <th key={c.key} className={cx(c.num && "text-right")}>
                      <Link href={`/reports/employees?${qs({ sort: c.key, dir: sortKey === c.key && dir === -1 ? "asc" : "desc" })}`} className={cx("inline-flex items-center gap-1 hover:text-fg", sortKey === c.key && "text-accent")}>
                        {c.label}<ArrowDownUp className="h-3 w-3 opacity-50" />
                      </Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {util.map((u) => (
                  <tr key={u.employeeId}>
                    <td>
                      <Link href={`/approvals?employee=${u.employeeId}&status=all&from=${from}&to=${to}`} className="flex items-center gap-3 hover:text-accent">
                        <Avatar name={u.name} size={30} />
                        <div><div className="font-medium">{u.name}</div><div className="text-xs text-subtle">{u.empCode} · {u.department}</div></div>
                      </Link>
                    </td>
                    <td className="text-right tabular-nums text-muted">{fmtH(u.available)}</td>
                    <td className="text-right tabular-nums">{fmtH(u.reported)}</td>
                    <td className="text-right tabular-nums">{fmtH(u.approved)}</td>
                    <td className="text-right tabular-nums">{fmtH(u.approvedBillable)}</td>
                    <td className="text-right tabular-nums text-info">{u.pending ? fmtH(u.pending) : "–"}</td>
                    <td className="text-right tabular-nums text-bad">{u.rejected ? fmtH(u.rejected) : "–"}</td>
                    <td className="w-40 text-right"><Pct value={u.utilization} target={settings.utilizationTarget} /><div className="mt-1"><Progress value={u.utilization} /></div></td>
                    <td className="text-right"><Pct value={u.totalUtilization} /></td>
                    <td className="text-right">{u.overdueWeeks ? <span className="chip bg-warn/15 text-warn">{u.overdueWeeks}</span> : <span className="text-subtle">–</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
