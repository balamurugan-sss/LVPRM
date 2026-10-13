import { requirePageUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { listEmployees, listProjects, visibleEmployeeIds } from "@/lib/data";
import { PageHeader } from "@/components/ui";
import { AllocationBoard, type AssignmentRow } from "./AllocationBoard";

export const metadata = { title: "Project & resource allocation" };

export default async function AllocationPage() {
  const user = await requirePageUser();
  const ids = await visibleEmployeeIds(user);
  const [assignments, employees, projects] = await Promise.all([
    query<AssignmentRow>(
      `SELECT a.id, a.employee_id, e.name AS employee, e.emp_code, e.title, a.project_id, p.code, p.name AS project, p.color, p.billable,
              a.allocation_pct, a.weekly_hours, a.start_date, a.end_date
         FROM assignments a JOIN employees e ON e.id = a.employee_id JOIN projects p ON p.id = a.project_id
        WHERE a.employee_id = ANY($1) AND e.active ORDER BY e.name, p.code`,
      [ids],
    ),
    listEmployees(user.role === "admin" ? undefined : ids),
    listProjects(),
  ]);
  return (
    <>
      <PageHeader
        title="Project & resource allocation"
        subtitle={user.role === "admin" ? "Assign people to projects, set allocation and manage projects" : user.role === "manager" ? "Allocation across your team and projects" : "Your current project assignments"}
      />
      <AllocationBoard
        isAdmin={user.role === "admin"}
        assignments={assignments}
        employees={employees.filter((e) => e.active && e.role !== "admin").map((e) => ({ id: e.id, name: e.name }))}
        managers={employees.filter((e) => e.role !== "employee").map((e) => ({ id: e.id, name: e.name }))}
        projects={projects}
      />
    </>
  );
}
