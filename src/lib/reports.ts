import "server-only";
import { query } from "./db";
import { addDays, eachDay, isoWeekday, weekStart } from "./dates";
import { getSettings, holidaysBetween, leavesBetween } from "./data";
import { availableHours, isOverdue, round2, utilizationPct, type TimesheetStatus } from "./rules";

export type HoursRow = {
  employee_id: number;
  project_id: number;
  status: TimesheetStatus;
  billable: boolean;
  week_start: string;
  work_date: string;
  hours: number;
};

export async function hoursRows(employeeIds: number[], from: string, to: string): Promise<HoursRow[]> {
  if (!employeeIds.length) return [];
  return query<HoursRow>(
    `SELECT t.employee_id, l.project_id, t.status, l.billable, t.week_start, e.work_date, e.hours
       FROM time_entries e
       JOIN timesheet_lines l ON l.id = e.line_id
       JOIN timesheets t ON t.id = l.timesheet_id
      WHERE t.employee_id = ANY($1) AND e.work_date BETWEEN $2 AND $3`,
    [employeeIds, from, to],
  );
}

export type EmployeeUtil = {
  employeeId: number;
  name: string;
  empCode: string;
  department: string | null;
  manager: string | null;
  reported: number;
  approved: number;
  pending: number;
  rejected: number;
  draft: number;
  approvedBillable: number;
  approvedNonBillable: number;
  available: number;
  utilization: number; // billable utilization (%)
  totalUtilization: number; // all approved hours (%)
  overdueWeeks: number;
};

export async function employeeUtilization(employeeIds: number[], from: string, to: string): Promise<EmployeeUtil[]> {
  if (!employeeIds.length) return [];
  const settings = await getSettings();
  const [emps, rows, hols, lvs, sheets] = await Promise.all([
    query<{ id: number; name: string; emp_code: string; department: string | null; manager: string | null; daily_hours: number | null; joined_on: string }>(
      `SELECT e.id, e.name, e.emp_code, d.name AS department, m.name AS manager, e.daily_hours, e.joined_on
         FROM employees e LEFT JOIN departments d ON d.id = e.department_id LEFT JOIN employees m ON m.id = e.manager_id
        WHERE e.id = ANY($1) AND e.role <> 'admin' AND e.active ORDER BY e.name`,
      [employeeIds],
    ),
    hoursRows(employeeIds, from, to),
    holidaysBetween(from, to),
    leavesBetween(employeeIds, from, to),
    query<{ employee_id: number; week_start: string; status: TimesheetStatus }>(
      "SELECT employee_id, week_start, status FROM timesheets WHERE employee_id = ANY($1) AND week_start BETWEEN $2 AND $3",
      [employeeIds, weekStart(from), to],
    ),
  ]);
  const holidays = new Set(hols.map((h) => h.date));
  const today = new Date().toISOString().slice(0, 10);
  const weeks = weekStartsBetween(from, to);

  return emps.map((e) => {
    const mine = rows.filter((r) => r.employee_id === e.id);
    const sum = (f: (r: HoursRow) => boolean) => round2(mine.filter(f).reduce((s, r) => s + r.hours, 0));
    const leaveHours = new Map(lvs.filter((l) => l.employee_id === e.id).map((l) => [l.date, l.hours]));
    const start = e.joined_on > from ? e.joined_on : from;
    const available = availableHours(start, to, {
      workingDays: settings.workingDays,
      dailyHours: e.daily_hours ?? settings.standardDailyHours,
      holidays,
      leaveHours,
    });
    const approvedBillable = sum((r) => r.status === "approved" && r.billable);
    const approved = sum((r) => r.status === "approved");
    const overdueWeeks = weeks.filter((w) => {
      if (addDays(w, 6) < e.joined_on) return false;
      const s = sheets.find((x) => x.employee_id === e.id && x.week_start === w)?.status ?? null;
      return isOverdue(w, s, today, settings.submissionDeadlineDays);
    }).length;
    return {
      employeeId: e.id,
      name: e.name,
      empCode: e.emp_code,
      department: e.department,
      manager: e.manager,
      reported: sum(() => true),
      approved,
      pending: sum((r) => r.status === "submitted"),
      rejected: sum((r) => r.status === "rejected"),
      draft: sum((r) => r.status === "draft"),
      approvedBillable,
      approvedNonBillable: round2(approved - approvedBillable),
      available,
      utilization: utilizationPct(approvedBillable, available),
      totalUtilization: utilizationPct(approved, available),
      overdueWeeks,
    };
  });
}

export function weekStartsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let w = weekStart(from); w <= to; w = addDays(w, 7)) out.push(w);
  return out;
}

export type ProjectUtil = {
  projectId: number;
  code: string;
  name: string;
  client: string;
  billable: boolean;
  color: string;
  manager: string | null;
  status: string;
  headcount: number;
  planned: number; // planned hours within the range
  approved: number;
  pending: number;
  reported: number;
  budget: number; // total planned hours for project lifetime
  budgetUsed: number; // all-time approved hours
  variance: number; // approved - planned
  utilization: number; // approved / planned %
};

export async function projectUtilization(employeeIds: number[], from: string, to: string, projectIds?: number[]): Promise<ProjectUtil[]> {
  const settings = await getSettings();
  const [projects, rows, assigns, lifetime] = await Promise.all([
    query<{ id: number; code: string; name: string; client: string; billable: boolean; color: string; manager: string | null; status: string; planned_hours: number }>(
      `SELECT p.id, p.code, p.name, p.client, p.billable, p.color, m.name AS manager, p.status, p.planned_hours
         FROM projects p LEFT JOIN employees m ON m.id = p.manager_id
        WHERE ($1::int[] IS NULL OR p.id = ANY($1)) ORDER BY p.code`,
      [projectIds ?? null],
    ),
    hoursRows(employeeIds, from, to),
    query<{ project_id: number; employee_id: number; weekly_hours: number | null; allocation_pct: number; start_date: string; end_date: string | null }>(
      "SELECT project_id, employee_id, weekly_hours, allocation_pct, start_date, end_date FROM assignments WHERE employee_id = ANY($1)",
      [employeeIds],
    ),
    query<{ project_id: number; hours: number }>(
      `SELECT l.project_id, SUM(e.hours)::float AS hours FROM time_entries e
         JOIN timesheet_lines l ON l.id = e.line_id JOIN timesheets t ON t.id = l.timesheet_id
        WHERE t.status = 'approved' GROUP BY l.project_id`,
    ),
  ]);
  const workdays = eachDay(from, to).filter((d) => settings.workingDays.includes(isoWeekday(d)));

  return projects.map((p) => {
    const mine = rows.filter((r) => r.project_id === p.id);
    const sum = (f: (r: HoursRow) => boolean) => round2(mine.filter(f).reduce((s, r) => s + r.hours, 0));
    const pa = assigns.filter((a) => a.project_id === p.id);
    const planned = round2(
      pa.reduce((s, a) => {
        const perDay = (a.weekly_hours ?? (settings.standardDailyHours * settings.workingDays.length * a.allocation_pct) / 100) / settings.workingDays.length;
        const days = workdays.filter((d) => d >= a.start_date && (!a.end_date || d <= a.end_date)).length;
        return s + perDay * days;
      }, 0),
    );
    const approved = sum((r) => r.status === "approved");
    return {
      projectId: p.id,
      code: p.code,
      name: p.name,
      client: p.client,
      billable: p.billable,
      color: p.color,
      manager: p.manager,
      status: p.status,
      headcount: new Set(pa.map((a) => a.employee_id)).size,
      planned,
      approved,
      pending: sum((r) => r.status === "submitted"),
      reported: sum(() => true),
      budget: p.planned_hours,
      budgetUsed: round2(lifetime.find((l) => l.project_id === p.id)?.hours ?? 0),
      variance: round2(approved - planned),
      utilization: planned > 0 ? round2((approved / planned) * 100) : 0,
    };
  });
}

export type TrendPoint = { week: string; billable: number; nonBillable: number; pending: number; rejected: number };

export function weeklyTrend(rows: HoursRow[], from: string, to: string): TrendPoint[] {
  return weekStartsBetween(from, to).map((w) => {
    const inWeek = rows.filter((r) => r.week_start === w);
    const sum = (f: (r: HoursRow) => boolean) => round2(inWeek.filter(f).reduce((s, r) => s + r.hours, 0));
    return {
      week: w,
      billable: sum((r) => r.status === "approved" && r.billable),
      nonBillable: sum((r) => r.status === "approved" && !r.billable),
      pending: sum((r) => r.status === "submitted"),
      rejected: sum((r) => r.status === "rejected"),
    };
  });
}

export function rangeFromParams(sp: Record<string, string | string[] | undefined>, defaultWeeks = 8) {
  const today = new Date().toISOString().slice(0, 10);
  const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
  let to = isDate(sp.to) ? sp.to : addDays(weekStart(today), 6);
  let from = isDate(sp.from) ? sp.from : addDays(weekStart(today), -7 * (defaultWeeks - 1));
  if (from > to) [from, to] = [to, from];
  // Cap at roughly one year to keep queries bounded.
  if (eachDay(from, to).length > 400) from = addDays(to, -399);
  return { from, to };
}

export type Slice = { name: string; value: number; color: string };

export const CATEGORY_COLORS = {
  billable: "#ff8029",
  nonBillable: "#a78bfa",
  pending: "#60a5fa",
  leave: "#fbbf24",
  holiday: "#f87171",
  notLogged: "#475569",
};

/**
 * Hours split into categories for a period: approved billable, approved non-billable,
 * pending approval, leave, holiday and not-yet-logged (available minus logged, up to today).
 */
export async function categoryBreakdown(employeeIds: number[], from: string, to: string): Promise<Slice[]> {
  if (!employeeIds.length) return [];
  const settings = await getSettings();
  const today = new Date().toISOString().slice(0, 10);
  const until = to < today ? to : today;
  const [rows, hols, lvs, emps] = await Promise.all([
    hoursRows(employeeIds, from, to),
    holidaysBetween(from, until),
    leavesBetween(employeeIds, from, until),
    query<{ id: number; daily_hours: number | null; joined_on: string }>(
      "SELECT id, daily_hours, joined_on FROM employees WHERE id = ANY($1) AND active",
      [employeeIds],
    ),
  ]);
  const sum = (f: (r: HoursRow) => boolean) => round2(rows.filter(f).reduce((s, r) => s + r.hours, 0));
  const billable = sum((r) => r.status === "approved" && r.billable);
  const nonBillable = sum((r) => r.status === "approved" && !r.billable);
  const pending = sum((r) => r.status === "submitted" || r.status === "draft");
  const holidaySet = new Set(hols.map((h) => h.date));
  let holiday = 0;
  let leave = 0;
  let available = 0;
  for (const e of emps) {
    const daily = e.daily_hours ?? settings.standardDailyHours;
    const start = e.joined_on > from ? e.joined_on : from;
    if (start > until) continue;
    for (const d of eachDay(start, until)) {
      if (!settings.workingDays.includes(isoWeekday(d))) continue;
      if (holidaySet.has(d)) { holiday += daily; continue; }
      const lv = lvs.find((l) => l.employee_id === e.id && l.date === d)?.hours ?? 0;
      leave += Math.min(lv, daily);
      available += Math.max(0, daily - lv);
    }
  }
  const logged = sum((r) => r.status !== "rejected" && r.work_date <= until);
  const notLogged = round2(Math.max(0, available - logged));
  return [
    { name: "Billable", value: billable, color: CATEGORY_COLORS.billable },
    { name: "Non-billable", value: nonBillable, color: CATEGORY_COLORS.nonBillable },
    { name: "Pending / draft", value: pending, color: CATEGORY_COLORS.pending },
    { name: "Leave", value: round2(leave), color: CATEGORY_COLORS.leave },
    { name: "Holiday", value: round2(holiday), color: CATEGORY_COLORS.holiday },
    { name: "Not logged", value: notLogged, color: CATEGORY_COLORS.notLogged },
  ];
}

/** Week / month / financial-year (Apr–Mar) periods containing `today`. */
export function analysisPeriods(today: string) {
  const ws = weekStart(today);
  const y = Number(today.slice(0, 4));
  const fy = Number(today.slice(5, 7)) >= 4 ? y : y - 1;
  return {
    week: { from: ws, to: addDays(ws, 6), label: `Week of ${ws}` },
    month: { from: `${today.slice(0, 7)}-01`, to: monthEndISO(today), label: today.slice(0, 7) },
    year: { from: `${fy}-04-01`, to: `${fy + 1}-03-31`, label: `FY ${fy}-${String(fy + 1).slice(2)}` },
  };
}

function monthEndISO(d: string) {
  const dt = new Date(`${d.slice(0, 7)}-01T00:00:00Z`);
  dt.setUTCMonth(dt.getUTCMonth() + 1);
  dt.setUTCDate(0);
  return dt.toISOString().slice(0, 10);
}

export async function periodBreakdowns(employeeIds: number[], today: string) {
  const p = analysisPeriods(today);
  const [week, month, year] = await Promise.all([
    categoryBreakdown(employeeIds, p.week.from, p.week.to),
    categoryBreakdown(employeeIds, p.month.from, p.month.to),
    categoryBreakdown(employeeIds, p.year.from, p.year.to),
  ]);
  return { week: { ...p.week, slices: week }, month: { ...p.month, slices: month }, year: { ...p.year, slices: year } };
}
