import Link from "next/link";
import { Download, History } from "lucide-react";
import { requirePageUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { getSettings } from "@/lib/data";
import { addDays, fmtDateTime, fmtWeek, todayISO, weekStart } from "@/lib/dates";
import { isOverdue, type TimesheetStatus } from "@/lib/rules";
import { Card, cx, Empty, fmtH, PageHeader, StatusBadge } from "@/components/ui";

export const metadata = { title: "My timesheets" };

const FILTERS = ["all", "draft", "submitted", "approved", "rejected", "overdue"] as const;

export default async function HistoryPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const user = await requirePageUser();
  const settings = await getSettings();
  const filter = (FILTERS as readonly string[]).includes(sp.status) ? sp.status : "all";
  const today = todayISO();
  const ws = weekStart(today);
  const weeks = Number(sp.weeks) === 52 ? 52 : 16;

  const sheets = await query<{
    id: number; week_start: string; status: TimesheetStatus; submitted_at: string | null; decided_at: string | null;
    approver: string | null; decision_comment: string | null; version: number; total: number; billable: number;
  }>(
    `SELECT t.id, t.week_start, t.status, t.submitted_at, t.decided_at, a.name AS approver, t.decision_comment, t.version,
            COALESCE(SUM(e.hours),0)::float AS total,
            COALESCE(SUM(e.hours) FILTER (WHERE l.billable),0)::float AS billable
       FROM timesheets t
       LEFT JOIN employees a ON a.id = t.decided_by
       LEFT JOIN timesheet_lines l ON l.timesheet_id = t.id
       LEFT JOIN time_entries e ON e.line_id = l.id
      WHERE t.employee_id = $1 AND t.week_start >= $2
      GROUP BY t.id, a.name ORDER BY t.week_start DESC`,
    [user.id, addDays(ws, -7 * weeks)],
  );
  // Include weeks with no timesheet at all so missing weeks are visible.
  const all = Array.from({ length: weeks + 1 }, (_, i) => addDays(ws, -7 * i)).map((w) => {
    const s = sheets.find((x) => x.week_start === w);
    const overdue = isOverdue(w, s?.status ?? null, today, settings.submissionDeadlineDays);
    return { week: w, sheet: s, overdue };
  });
  const rows = all.filter((r) =>
    filter === "all" ? true : filter === "overdue" ? r.overdue : r.sheet?.status === filter,
  );
  const count = (f: string) => all.filter((r) => (f === "all" ? true : f === "overdue" ? r.overdue : r.sheet?.status === f)).length;

  return (
    <>
      <PageHeader
        title="My timesheet history"
        subtitle={`Your submissions for the last ${weeks} weeks`}
        actions={
          <>
            <Link href={`/history?status=${filter}&weeks=${weeks === 16 ? 52 : 16}`} className="btn-secondary">{weeks === 16 ? "Show 52 weeks" : "Show 16 weeks"}</Link>
            <a href={`/api/export?type=timesheets&from=${addDays(ws, -7 * weeks)}&to=${addDays(ws, 6)}`} className="btn-primary"><Download className="h-4 w-4" />Export CSV</a>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link key={f} href={`/history?status=${f}&weeks=${weeks}`} className={cx("chip border py-1.5 capitalize", filter === f ? "border-accent/40 bg-accent/15 text-accent" : "hairline bg-card text-muted hover:text-fg")}>
            {f === "rejected" ? "Changes requested" : f} <span className="tabular-nums opacity-70">{count(f)}</span>
          </Link>
        ))}
      </div>
      <Card bodyClass="p-0">
        {rows.length === 0 ? <Empty title="No timesheets match this filter" icon={<History className="h-6 w-6" />} /> : (
          <div className="scrollbar-thin overflow-x-auto">
            <table className="table-base min-w-[820px]">
              <thead><tr><th>Week</th><th>Status</th><th className="text-right">Total</th><th className="text-right">Billable</th><th>Submitted</th><th>Reviewed</th><th>Comment</th><th /></tr></thead>
              <tbody>
                {rows.map(({ week, sheet, overdue }) => (
                  <tr key={week}>
                    <td className="font-medium">{fmtWeek(week)}</td>
                    <td><div className="flex gap-1.5"><StatusBadge status={sheet?.status ?? "missing"} />{overdue && <StatusBadge status="overdue" />}</div></td>
                    <td className="text-right tabular-nums">{fmtH(sheet?.total ?? 0)}h</td>
                    <td className="text-right tabular-nums text-muted">{fmtH(sheet?.billable ?? 0)}h</td>
                    <td className="text-xs text-muted">{fmtDateTime(sheet?.submitted_at)}</td>
                    <td className="text-xs text-muted">{sheet?.decided_at ? <>{sheet.approver}<br />{fmtDateTime(sheet.decided_at)}</> : "—"}</td>
                    <td className="max-w-[260px] truncate text-xs text-muted" title={sheet?.decision_comment ?? ""}>{sheet?.decision_comment ?? "—"}</td>
                    <td className="text-right">
                      <Link href={`/timesheet?week=${week}`} className="btn-ghost py-1 text-xs">
                        {!sheet || sheet.status === "draft" || sheet.status === "rejected" ? "Edit" : "View"}
                      </Link>
                    </td>
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
