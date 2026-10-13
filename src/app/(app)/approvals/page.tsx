import { requirePageUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { approvableEmployeeIds, getSettings, listProjects } from "@/lib/data";
import { addDays, isValidISODate, todayISO, weekStart } from "@/lib/dates";
import { PageHeader } from "@/components/ui";
import { ApprovalInbox, type InboxRow } from "./ApprovalInbox";

export const metadata = { title: "Approval inbox" };

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const user = await requirePageUser(["manager", "admin"]);
  const settings = await getSettings();
  const ids = await approvableEmployeeIds(user);
  const status = ["submitted", "approved", "rejected", "all"].includes(sp.status) ? sp.status : "submitted";
  const from = isValidISODate(sp.from) ? weekStart(sp.from) : addDays(weekStart(todayISO()), -7 * 12);
  const to = isValidISODate(sp.to) ? sp.to : todayISO();
  const employee = Number(sp.employee) || null;
  const project = Number(sp.project) || null;
  const dept = Number(sp.dept) || null;

  const rows = ids.length
    ? await query<InboxRow>(
        `SELECT t.id, t.employee_id, e.name AS employee, e.emp_code, d.name AS department, t.week_start, t.status, t.submitted_at,
                t.decided_at, a.name AS approver, t.decision_comment, t.version,
                COALESCE(SUM(te.hours),0)::float AS total,
                COALESCE(SUM(te.hours) FILTER (WHERE l.billable),0)::float AS billable,
                COALESCE(array_agg(DISTINCT p.code) FILTER (WHERE p.code IS NOT NULL), '{}') AS projects
           FROM timesheets t
           JOIN employees e ON e.id = t.employee_id
           LEFT JOIN departments d ON d.id = e.department_id
           LEFT JOIN employees a ON a.id = t.decided_by
           LEFT JOIN timesheet_lines l ON l.timesheet_id = t.id
           LEFT JOIN projects p ON p.id = l.project_id
           LEFT JOIN time_entries te ON te.line_id = l.id
          WHERE t.employee_id = ANY($1)
            AND t.status <> 'draft'
            AND ($2 = 'all' OR t.status = $2)
            AND t.week_start BETWEEN $3 AND $4
            AND ($5::int IS NULL OR t.employee_id = $5)
            AND ($6::int IS NULL OR EXISTS (SELECT 1 FROM timesheet_lines x WHERE x.timesheet_id = t.id AND x.project_id = $6))
            AND ($7::int IS NULL OR e.department_id = $7)
          GROUP BY t.id, e.name, e.emp_code, d.name, a.name
          ORDER BY CASE WHEN t.status = 'submitted' THEN 0 ELSE 1 END, t.submitted_at ASC NULLS LAST
          LIMIT 300`,
        [ids, status, from, to, employee, project, dept],
      )
    : [];

  const [people, projects, departments, recent] = await Promise.all([
    ids.length ? query<{ id: number; name: string }>("SELECT id, name FROM employees WHERE id = ANY($1) ORDER BY name", [ids]) : Promise.resolve([]),
    listProjects(),
    query<{ id: number; name: string }>("SELECT id, name FROM departments ORDER BY name"),
    ids.length
      ? query<{ id: number; action: string; actor: string; employee: string; week_start: string; comment: string | null; created_at: string; total_hours: number; timesheet_id: number }>(
          `SELECT r.id, r.action, a.name AS actor, e.name AS employee, t.week_start, r.comment, r.created_at, r.total_hours, r.timesheet_id
             FROM approval_records r JOIN timesheets t ON t.id = r.timesheet_id
             JOIN employees e ON e.id = t.employee_id JOIN employees a ON a.id = r.actor_id
            WHERE t.employee_id = ANY($1) ORDER BY r.created_at DESC LIMIT 12`,
          [ids],
        )
      : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader title="Approval inbox" subtitle={user.role === "admin" ? "All submitted timesheets across the organisation" : "Timesheets submitted by your direct reports"} />
      <ApprovalInbox
        rows={rows}
        filters={{ status, from, to, employee, project, dept }}
        people={people}
        projects={projects.map((p) => ({ id: p.id, name: `${p.code} — ${p.name}` }))}
        departments={departments}
        recent={recent}
        openId={Number(sp.id) || null}
        today={todayISO()}
        deadlineDays={settings.submissionDeadlineDays}
      />
    </>
  );
}
