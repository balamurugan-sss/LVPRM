import { HttpError, requireApiUser } from "@/lib/auth";
import { csvResponse, route } from "@/lib/api";
import { query } from "@/lib/db";
import { audit, visibleEmployeeIds } from "@/lib/data";
import { employeeUtilization, projectUtilization, rangeFromParams } from "@/lib/reports";

export const GET = route(async (req) => {
  const user = await requireApiUser();
  const sp = Object.fromEntries(req.nextUrl.searchParams);
  const { from, to } = rangeFromParams(sp);
  const type = sp.type ?? "timesheets";
  // Employees may export only their own timesheet entries; reports require manager/admin.
  if (type !== "timesheets" && user.role === "employee") throw new HttpError(403, "Exporting reports requires a manager or administrator role");
  const ids = await visibleEmployeeIds(user);
  await audit(null, user.id, "export.csv", "export", null, { type, from, to });

  if (type === "timesheets") {
    const status = ["draft", "submitted", "approved", "rejected"].includes(sp.status ?? "") ? sp.status : null;
    const rows = await query<{
      emp_code: string; name: string; department: string | null; week_start: string; work_date: string; project: string;
      project_name: string; task: string; billable: boolean; hours: number; status: string; approver: string | null; decided_at: string | null;
    }>(
      `SELECT emp.emp_code, emp.name, d.name AS department, t.week_start, e.work_date, p.code AS project, p.name AS project_name,
              l.task, l.billable, e.hours, t.status, a.name AS approver, t.decided_at
         FROM time_entries e
         JOIN timesheet_lines l ON l.id = e.line_id
         JOIN timesheets t ON t.id = l.timesheet_id
         JOIN employees emp ON emp.id = t.employee_id
         LEFT JOIN departments d ON d.id = emp.department_id
         JOIN projects p ON p.id = l.project_id
         LEFT JOIN employees a ON a.id = t.decided_by
        WHERE t.employee_id = ANY($1) AND e.work_date BETWEEN $2 AND $3 AND ($4::text IS NULL OR t.status = $4)
        ORDER BY emp.name, e.work_date, p.code`,
      [ids, from, to, status],
    );
    return csvResponse(
      `prm-timesheets-${from}-to-${to}.csv`,
      ["Employee ID", "Employee", "Department", "Week Start", "Date", "Project Code", "Project", "Billable", "Hours", "Status", "Approver", "Decided At"],
      rows.map((r) => [r.emp_code, r.name, r.department, r.week_start, r.work_date, r.project, r.project_name, r.billable ? "Yes" : "No", r.hours, r.status, r.approver, r.decided_at ? new Date(r.decided_at).toISOString() : ""]),
    );
  }
  if (type === "employees") {
    const rows = await employeeUtilization(ids, from, to);
    return csvResponse(
      `prm-employee-utilization-${from}-to-${to}.csv`,
      ["Employee ID", "Employee", "Department", "Manager", "Available Hrs", "Reported Hrs", "Approved Hrs", "Approved Billable Hrs", "Approved Non-billable Hrs", "Pending Hrs", "Rejected Hrs", "Billable Utilization %", "Total Utilization %", "Overdue Weeks"],
      rows.map((r) => [r.empCode, r.name, r.department, r.manager, r.available, r.reported, r.approved, r.approvedBillable, r.approvedNonBillable, r.pending, r.rejected, r.utilization, r.totalUtilization, r.overdueWeeks]),
    );
  }
  if (type === "projects") {
    const rows = await projectUtilization(ids, from, to);
    return csvResponse(
      `prm-project-utilization-${from}-to-${to}.csv`,
      ["Project Code", "Project", "Client", "Billable", "Manager", "Headcount", "Planned Hrs", "Approved Hrs", "Pending Hrs", "Variance Hrs", "Utilization %", "Budget Hrs", "Budget Used Hrs"],
      rows.map((r) => [r.code, r.name, r.client, r.billable ? "Yes" : "No", r.manager, r.headcount, r.planned, r.approved, r.pending, r.variance, r.utilization, r.budget, r.budgetUsed]),
    );
  }
  throw new HttpError(400, "Unknown export type");
});
