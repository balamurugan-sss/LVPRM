import Link from "next/link";
import { Briefcase, CheckCheck, Download, Gauge, Hourglass, Target } from "lucide-react";
import { requirePageUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { getSettings, visibleEmployeeIds } from "@/lib/data";
import { fmtDate } from "@/lib/dates";
import { employeeUtilization, hoursRows, projectUtilization, rangeFromParams } from "@/lib/reports";
import { round2 } from "@/lib/rules";
import { Avatar, Card, cx, fmtH, Kpi, PageHeader, Pct, Progress } from "@/components/ui";
import { PlannedActual } from "@/components/charts/Charts";
import { RangeBar } from "@/components/RangeBar";

export const metadata = { title: "Project utilization" };

export default async function ProjectReport({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const user = await requirePageUser(["manager", "admin"]);
  const settings = await getSettings();
  const { from, to } = rangeFromParams(sp);
  const ids = await visibleEmployeeIds(user);
  const [projects, rows, people] = await Promise.all([
    projectUtilization(ids, from, to),
    hoursRows(ids, from, to),
    employeeUtilization(ids, from, to),
  ]);
  const visible = projects.filter((p) => p.reported > 0 || p.planned > 0);
  const total = (k: "planned" | "approved" | "pending") => round2(visible.reduce((s, p) => s + p[k], 0));
  const billableApproved = round2(visible.filter((p) => p.billable).reduce((s, p) => s + p.approved, 0));

  // Allocation matrix: approved + pending hours per person per project.
  const matrix = people.map((u) => ({
    name: u.name,
    id: u.employeeId,
    cells: visible.map((p) => round2(rows.filter((r) => r.employee_id === u.employeeId && r.project_id === p.projectId && r.status !== "rejected").reduce((s, r) => s + r.hours, 0))),
  })).filter((m) => m.cells.some((c) => c > 0));
  const maxCell = Math.max(1, ...matrix.flatMap((m) => m.cells));
  const assignments = await query<{ employee_id: number; project_id: number; allocation_pct: number }>(
    "SELECT employee_id, project_id, allocation_pct FROM assignments WHERE employee_id = ANY($1)",
    [ids],
  );

  return (
    <>
      <PageHeader title="Project utilization" subtitle={`${fmtDate(from)} – ${fmtDate(to)} · planned vs actual hours`}
        actions={<a className="btn-primary" href={`/api/export?type=projects&from=${from}&to=${to}`}><Download className="h-4 w-4" />Export CSV</a>} />
      <RangeBar from={from} to={to} />

      <div className="mb-5 grid grid-cols-2 gap-4 xl:grid-cols-5">
        <Kpi label="Active projects" value={visible.length} icon={<Briefcase className="h-4 w-4" />} />
        <Kpi label="Planned hours" value={fmtH(total("planned"))} unit="h" icon={<Target className="h-4 w-4" />} />
        <Kpi label="Approved hours" value={fmtH(total("approved"))} unit="h" tone="ok" icon={<CheckCheck className="h-4 w-4" />} />
        <Kpi label="Pending hours" value={fmtH(total("pending"))} unit="h" tone="info" icon={<Hourglass className="h-4 w-4" />} href="/approvals" />
        <Kpi label="Planned vs actual" value={<Pct value={total("planned") ? (total("approved") / total("planned")) * 100 : 0} target={90} />} hint={`${fmtH(billableApproved)}h billable approved`} tone="accent" icon={<Gauge className="h-4 w-4" />} />
      </div>

      <Card title="Planned vs actual by project" className="mb-5">
        <PlannedActual data={visible.map((p) => ({ label: p.code, planned: p.planned, approved: p.approved, pending: p.pending }))} />
      </Card>

      <Card bodyClass="p-0" title="Projects" subtitle="Utilization = approved ÷ planned hours for the period" className="mb-5">
        <div className="scrollbar-thin overflow-x-auto">
          <table className="table-base min-w-[980px]">
            <thead><tr><th>Project</th><th>Manager</th><th className="text-right">Team</th><th className="text-right">Planned</th><th className="text-right">Approved</th><th className="text-right">Pending</th><th className="text-right">Variance</th><th>Period util.</th><th>Budget burn</th></tr></thead>
            <tbody>
              {visible.map((p) => (
                <tr key={p.projectId}>
                  <td>
                    <Link href={`/approvals?project=${p.projectId}&status=all&from=${from}&to=${to}`} className="flex items-center gap-3 hover:text-accent">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl text-[11px] font-bold text-[#0b0c10]" style={{ background: p.color }}>{p.code.slice(0, 3)}</span>
                      <div><div className="font-medium">{p.name}</div><div className="text-xs text-subtle">{p.code} · {p.client} · {p.billable ? "Billable" : "Non-billable"}</div></div>
                    </Link>
                  </td>
                  <td className="text-muted">{p.manager ?? "—"}</td>
                  <td className="text-right tabular-nums">{p.headcount}</td>
                  <td className="text-right tabular-nums text-muted">{fmtH(p.planned)}</td>
                  <td className="text-right tabular-nums">{fmtH(p.approved)}</td>
                  <td className="text-right tabular-nums text-info">{p.pending ? fmtH(p.pending) : "–"}</td>
                  <td className={cx("text-right tabular-nums", p.variance < 0 ? "text-warn" : "text-ok")}>{p.variance > 0 ? "+" : ""}{fmtH(p.variance)}</td>
                  <td className="w-36"><Pct value={p.utilization} target={90} /><div className="mt-1"><Progress value={p.utilization} /></div></td>
                  <td className="w-44 text-xs text-muted">{fmtH(p.budgetUsed)} / {fmtH(p.budget)}h<div className="mt-1"><Progress value={p.budgetUsed} max={p.budget} tone={p.budgetUsed > p.budget ? "rgb(var(--bad))" : p.color} /></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card bodyClass="p-0" title="Resource allocation matrix" subtitle="Hours logged (excluding returned) per person and project · allocation % in brackets">
        <div className="scrollbar-thin overflow-x-auto">
          <table className="table-base min-w-[760px]">
            <thead><tr><th>Employee</th>{visible.map((p) => <th key={p.projectId} className="text-center">{p.code}</th>)}<th className="text-right">Total</th></tr></thead>
            <tbody>
              {matrix.map((m) => (
                <tr key={m.id}>
                  <td><div className="flex items-center gap-2"><Avatar name={m.name} size={26} />{m.name}</div></td>
                  {m.cells.map((c, i) => {
                    const alloc = assignments.find((a) => a.employee_id === m.id && a.project_id === visible[i].projectId)?.allocation_pct;
                    return (
                      <td key={i} className="text-center">
                        {c > 0 || alloc ? (
                          <span className="inline-block min-w-[64px] rounded-lg px-2 py-1 text-xs tabular-nums" style={{ background: `color-mix(in srgb, ${visible[i].color} ${Math.round(10 + (c / maxCell) * 45)}%, transparent)` }}>
                            {fmtH(c)}h{alloc ? <span className="text-muted"> ({alloc}%)</span> : null}
                          </span>
                        ) : <span className="text-subtle">–</span>}
                      </td>
                    );
                  })}
                  <td className="text-right font-semibold tabular-nums">{fmtH(round2(m.cells.reduce((s, c) => s + c, 0)))}h</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-5 pb-4 text-xs text-subtle">Standard week: {settings.standardDailyHours * settings.workingDays.length}h. Planned hours are derived from assignment allocation.</p>
      </Card>
    </>
  );
}
