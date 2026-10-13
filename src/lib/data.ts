import "server-only";
import type { PoolClient } from "pg";
import { query, queryOne } from "./db";
import { DEFAULT_SETTINGS, type Settings } from "./rules";
import type { SessionUser } from "./auth";

type Exec = Pick<PoolClient, "query">;

export async function getSettings(): Promise<Settings> {
  const rows = await query<{ key: string; value: unknown }>("SELECT key, value FROM settings");
  const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) if (r.key in DEFAULT_SETTINGS) merged[r.key] = r.value;
  return merged as Settings;
}

export async function audit(
  db: Exec | null,
  actorId: number | null,
  action: string,
  entity: string,
  entityId: number | null,
  details?: unknown,
) {
  const sql = "INSERT INTO audit_logs (actor_id, action, entity, entity_id, details) VALUES ($1, $2, $3, $4, $5)";
  const params = [actorId, action, entity, entityId, details === undefined ? null : JSON.stringify(details)];
  if (db) await db.query(sql, params);
  else await query(sql, params);
}

export async function notify(
  db: Exec | null,
  recipientId: number,
  type: string,
  title: string,
  body: string,
  link?: string,
) {
  const sql = "INSERT INTO notifications (recipient_id, type, title, body, link) VALUES ($1, $2, $3, $4, $5)";
  const params = [recipientId, type, title, body, link ?? null];
  if (db) await db.query(sql, params);
  else await query(sql, params);
}

/**
 * Employees whose data the user is authorised to see.
 * employee → self; manager → self + everyone in their reporting line + members of projects they manage; admin → all.
 */
export async function visibleEmployeeIds(user: SessionUser): Promise<number[]> {
  if (user.role === "admin") {
    return (await query<{ id: number }>("SELECT id FROM employees")).map((r) => r.id);
  }
  if (user.role === "employee") return [user.id];
  const rows = await query<{ id: number }>(
    `WITH RECURSIVE team AS (
        SELECT id FROM employees WHERE id = $1
        UNION
        SELECT e.id FROM employees e JOIN team t ON e.manager_id = t.id
     )
     SELECT id FROM team
     UNION
     SELECT a.employee_id FROM assignments a JOIN projects p ON p.id = a.project_id WHERE p.manager_id = $1`,
    [user.id],
  );
  return rows.map((r) => r.id);
}

/** Employees whose timesheets the user may approve (never themselves). */
export async function approvableEmployeeIds(user: SessionUser): Promise<number[]> {
  if (user.role === "admin") {
    return (await query<{ id: number }>("SELECT id FROM employees WHERE id <> $1", [user.id])).map((r) => r.id);
  }
  if (user.role !== "manager") return [];
  return (await query<{ id: number }>("SELECT id FROM employees WHERE manager_id = $1", [user.id])).map((r) => r.id);
}

export async function canViewEmployee(user: SessionUser, employeeId: number) {
  return (await visibleEmployeeIds(user)).includes(employeeId);
}

export type Employee = {
  id: number;
  emp_code: string;
  name: string;
  email: string;
  role: string;
  title: string;
  department: string | null;
  department_id: number | null;
  manager_id: number | null;
  manager_name: string | null;
  location: string;
  active: boolean;
  joined_on: string;
  daily_hours: number | null;
};

export async function listEmployees(ids?: number[]): Promise<Employee[]> {
  return query<Employee>(
    `SELECT e.id, e.emp_code, e.name, e.email, e.role, e.title, d.name AS department, e.department_id,
            e.manager_id, m.name AS manager_name, e.location, e.active, e.joined_on, e.daily_hours
       FROM employees e
       LEFT JOIN departments d ON d.id = e.department_id
       LEFT JOIN employees m ON m.id = e.manager_id
      WHERE ($1::int[] IS NULL OR e.id = ANY($1))
      ORDER BY e.name`,
    [ids ?? null],
  );
}

export type Project = {
  id: number;
  code: string;
  name: string;
  client: string;
  billable: boolean;
  manager_id: number | null;
  manager_name: string | null;
  start_date: string;
  end_date: string | null;
  planned_hours: number;
  status: string;
  color: string;
};

export async function listProjects(): Promise<Project[]> {
  return query<Project>(
    `SELECT p.*, m.name AS manager_name FROM projects p LEFT JOIN employees m ON m.id = p.manager_id ORDER BY p.code`,
  );
}

export type AssignedProject = Project & { allocation_pct: number; weekly_hours: number | null };

export async function assignedProjects(employeeId: number, onDate?: string): Promise<AssignedProject[]> {
  return query<AssignedProject>(
    `SELECT p.*, m.name AS manager_name, a.allocation_pct, a.weekly_hours
       FROM assignments a
       JOIN projects p ON p.id = a.project_id
       LEFT JOIN employees m ON m.id = p.manager_id
      WHERE a.employee_id = $1
        AND ($2::date IS NULL OR (a.start_date <= $2::date + 6 AND (a.end_date IS NULL OR a.end_date >= $2::date)))
      ORDER BY p.billable DESC, p.code`,
    [employeeId, onDate ?? null],
  );
}

export async function unreadCount(userId: number): Promise<number> {
  const r = await queryOne<{ n: number }>(
    "SELECT count(*)::int AS n FROM notifications WHERE recipient_id = $1 AND read_at IS NULL",
    [userId],
  );
  return r?.n ?? 0;
}

export async function pendingApprovalCount(user: SessionUser): Promise<number> {
  const ids = await approvableEmployeeIds(user);
  if (!ids.length) return 0;
  const r = await queryOne<{ n: number }>(
    "SELECT count(*)::int AS n FROM timesheets WHERE status = 'submitted' AND employee_id = ANY($1)",
    [ids],
  );
  return r?.n ?? 0;
}

export async function holidaysBetween(from: string, to: string) {
  return query<{ date: string; name: string }>(
    "SELECT date, name FROM holidays WHERE date BETWEEN $1 AND $2 ORDER BY date",
    [from, to],
  );
}

export async function leavesBetween(employeeIds: number[], from: string, to: string) {
  return query<{ employee_id: number; date: string; hours: number; type: string }>(
    "SELECT employee_id, date, hours, type FROM leaves WHERE employee_id = ANY($1) AND date BETWEEN $2 AND $3",
    [employeeIds, from, to],
  );
}
