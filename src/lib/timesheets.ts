import "server-only";
import { query, queryOne, tx } from "./db";
import { addDays, fmtWeek, isoWeekday, weekDays, weekStart } from "./dates";
import { HttpError, type SessionUser } from "./auth";
import {
  approvableEmployeeIds,
  assignedProjects,
  audit,
  getSettings,
  holidaysBetween,
  leavesBetween,
  notify,
} from "./data";
import { round2, transition, validateGrid, weekTotal, type GridLine, type TimesheetStatus } from "./rules";

export type TimesheetLineView = GridLine & { id?: number; projectName: string; projectCode: string; color: string };

export type TimesheetView = {
  id: number | null;
  employeeId: number;
  employeeName: string;
  weekStart: string;
  status: TimesheetStatus | null; // null = not started
  version: number;
  submittedAt: string | null;
  decidedAt: string | null;
  decidedByName: string | null;
  decisionComment: string | null;
  lines: TimesheetLineView[];
  total: number;
};

type TsRow = {
  id: number;
  employee_id: number;
  employee_name: string;
  week_start: string;
  status: TimesheetStatus;
  version: number;
  submitted_at: string | null;
  decided_at: string | null;
  decided_by_name: string | null;
  decision_comment: string | null;
};

export async function loadLines(timesheetId: number, week: string): Promise<TimesheetLineView[]> {
  const lines = await query<{
    id: number;
    project_id: number;
    task: string;
    notes: string;
    billable: boolean;
    name: string;
    code: string;
    color: string;
  }>(
    `SELECT l.id, l.project_id, l.task, l.notes, l.billable, p.name, p.code, p.color
       FROM timesheet_lines l JOIN projects p ON p.id = l.project_id
      WHERE l.timesheet_id = $1 ORDER BY l.position, l.id`,
    [timesheetId],
  );
  const entries = await query<{ line_id: number; work_date: string; hours: number }>(
    `SELECT e.line_id, e.work_date, e.hours FROM time_entries e
       JOIN timesheet_lines l ON l.id = e.line_id WHERE l.timesheet_id = $1`,
    [timesheetId],
  );
  const days = weekDays(week);
  return lines.map((l) => {
    const hours = days.map((d) => entries.find((e) => e.line_id === l.id && e.work_date === d)?.hours ?? 0);
    return {
      id: l.id,
      projectId: l.project_id,
      task: l.task,
      notes: l.notes,
      billable: l.billable,
      hours,
      projectName: l.name,
      projectCode: l.code,
      color: l.color,
    };
  });
}

export async function getTimesheet(employeeId: number, week: string): Promise<TimesheetView> {
  const ws = weekStart(week);
  const row = await queryOne<TsRow>(
    `SELECT t.id, t.employee_id, e.name AS employee_name, t.week_start, t.status, t.version,
            t.submitted_at, t.decided_at, d.name AS decided_by_name, t.decision_comment
       FROM timesheets t JOIN employees e ON e.id = t.employee_id
       LEFT JOIN employees d ON d.id = t.decided_by
      WHERE t.employee_id = $1 AND t.week_start = $2`,
    [employeeId, ws],
  );
  if (!row) {
    const emp = await queryOne<{ name: string }>("SELECT name FROM employees WHERE id = $1", [employeeId]);
    return {
      id: null,
      employeeId,
      employeeName: emp?.name ?? "",
      weekStart: ws,
      status: null,
      version: 0,
      submittedAt: null,
      decidedAt: null,
      decidedByName: null,
      decisionComment: null,
      lines: [],
      total: 0,
    };
  }
  return toView(row, await loadLines(row.id, ws));
}

export async function getTimesheetById(id: number): Promise<TimesheetView | null> {
  const row = await queryOne<TsRow>(
    `SELECT t.id, t.employee_id, e.name AS employee_name, t.week_start, t.status, t.version,
            t.submitted_at, t.decided_at, d.name AS decided_by_name, t.decision_comment
       FROM timesheets t JOIN employees e ON e.id = t.employee_id
       LEFT JOIN employees d ON d.id = t.decided_by
      WHERE t.id = $1`,
    [id],
  );
  if (!row) return null;
  return toView(row, await loadLines(row.id, row.week_start));
}

function toView(row: TsRow, lines: TimesheetLineView[]): TimesheetView {
  return {
    id: row.id,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    weekStart: row.week_start,
    status: row.status,
    version: row.version,
    submittedAt: row.submitted_at,
    decidedAt: row.decided_at,
    decidedByName: row.decided_by_name,
    decisionComment: row.decision_comment,
    lines,
    total: weekTotal(lines),
  };
}

/** Day indexes (0..6) that are holidays or full-day leave for the employee in the given week. */
export async function nonWorkingDays(employeeId: number, ws: string, dailyHours: number) {
  const days = weekDays(ws);
  const [hol, lv] = await Promise.all([holidaysBetween(ws, days[6]), leavesBetween([employeeId], ws, days[6])]);
  const set = new Set<number>();
  hol.forEach((h) => set.add(days.indexOf(h.date)));
  lv.forEach((l) => {
    if (l.hours >= dailyHours) set.add(days.indexOf(l.date));
  });
  return { set, holidays: hol, leaves: lv };
}

export function sanitizeLines(input: unknown): GridLine[] {
  if (!Array.isArray(input)) throw new HttpError(400, "lines must be an array");
  return input.map((raw) => {
    const l = (raw ?? {}) as Record<string, unknown>;
    return {
      projectId: Number(l.projectId),
      task: String(l.task ?? "").trim(),
      notes: String(l.notes ?? "").trim(),
      billable: Boolean(l.billable),
      hours: Array.isArray(l.hours) ? l.hours.slice(0, 7).map((h) => (h === "" || h === null ? 0 : Number(h))) : [],
    };
  });
}

/**
 * Save a draft or submit the employee's own weekly timesheet.
 * Authorization: only the owner can edit; only draft/rejected sheets are editable.
 */
export async function saveTimesheet(user: SessionUser, week: string, rawLines: unknown, action: "save" | "submit") {
  const ws = weekStart(week);
  const settings = await getSettings();
  const lines = sanitizeLines(rawLines).filter((l) => l.projectId > 0 || l.hours.some((h) => h > 0) || l.task);

  const projects = await assignedProjects(user.id, ws);
  const allowed = new Set(projects.map((p) => p.id));
  const billableById = new Map(projects.map((p) => [p.id, p.billable]));
  // Billability comes from the project; it can only be lowered (e.g. internal task on a billable project).
  for (const l of lines) l.billable = (billableById.get(l.projectId) ?? false) && l.billable;

  const emp = await queryOne<{ daily_hours: number | null }>("SELECT daily_hours FROM employees WHERE id = $1", [user.id]);
  const dailyHours = emp?.daily_hours ?? settings.standardDailyHours;
  const { set: nonWorking } = await nonWorkingDays(user.id, ws, dailyHours);

  const issues = validateGrid(lines, settings, {
    mode: action,
    nonWorking,
    allowedProjectIds: allowed,
    dailyHours,
  });
  const errors = issues.filter((i) => i.level === "error");
  if (errors.length) throw new HttpError(422, errors[0].message, { issues });

  const days = weekDays(ws);
  const total = weekTotal(lines);

  return tx(async (db) => {
    // Lock (or create) the sheet row to serialise concurrent saves / prevent duplicate submissions.
    await db.query(
      `INSERT INTO timesheets (employee_id, week_start) VALUES ($1, $2) ON CONFLICT (employee_id, week_start) DO NOTHING`,
      [user.id, ws],
    );
    const { rows } = await db.query<{ id: number; status: TimesheetStatus; version: number }>(
      "SELECT id, status, version FROM timesheets WHERE employee_id = $1 AND week_start = $2 FOR UPDATE",
      [user.id, ws],
    );
    const sheet = rows[0];
    const next = transition(sheet.status, action);
    if (!next) {
      throw new HttpError(409, `This timesheet is ${sheet.status} and can no longer be edited.`);
    }

    await db.query("DELETE FROM timesheet_lines WHERE timesheet_id = $1", [sheet.id]);
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const ins = await db.query<{ id: number }>(
        `INSERT INTO timesheet_lines (timesheet_id, project_id, task, notes, billable, position)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [sheet.id, l.projectId, l.task, l.notes, l.billable, i],
      );
      for (let d = 0; d < 7; d++) {
        if (l.hours[d] > 0) {
          await db.query("INSERT INTO time_entries (line_id, work_date, hours) VALUES ($1, $2, $3)", [
            ins.rows[0].id,
            days[d],
            round2(l.hours[d]),
          ]);
        }
      }
    }

    if (action === "save") {
      await db.query("UPDATE timesheets SET updated_at = now() WHERE id = $1", [sheet.id]);
      await audit(db, user.id, "timesheet.save_draft", "timesheet", sheet.id, { week: ws, total });
      return { id: sheet.id, status: sheet.status, issues };
    }

    const version = sheet.status === "rejected" ? sheet.version + 1 : sheet.version;
    await db.query(
      `UPDATE timesheets SET status = 'submitted', submitted_at = now(), version = $2, updated_at = now(),
              decided_at = NULL, decided_by = NULL, decision_comment = NULL
        WHERE id = $1`,
      [sheet.id, version],
    );
    const snapshot = lines.map((l) => ({ ...l, project: projects.find((p) => p.id === l.projectId)?.code }));
    await db.query(
      `INSERT INTO approval_records (timesheet_id, action, actor_id, comment, version, total_hours, snapshot)
       VALUES ($1, 'submitted', $2, $3, $4, $5, $6)`,
      [sheet.id, user.id, sheet.status === "rejected" ? "Resubmitted after changes" : null, version, total, JSON.stringify(snapshot)],
    );
    await audit(db, user.id, sheet.status === "rejected" ? "timesheet.resubmit" : "timesheet.submit", "timesheet", sheet.id, {
      week: ws,
      total,
      version,
    });
    await notify(
      db,
      user.id,
      "submitted",
      "Timesheet submitted",
      `Your timesheet for ${fmtWeek(ws)} (${total}h) was submitted for approval.`,
      `/timesheet?week=${ws}`,
    );
    if (user.manager_id) {
      await notify(
        db,
        user.manager_id,
        "pending_approval",
        "Timesheet awaiting approval",
        `${user.name} submitted ${total}h for ${fmtWeek(ws)}.`,
        `/approvals?id=${sheet.id}`,
      );
    }
    return { id: sheet.id, status: "submitted" as const, issues };
  });
}

/** Approve or reject one or more submitted timesheets. Rejection requires a reason. */
export async function decideTimesheets(
  user: SessionUser,
  ids: number[],
  decision: "approve" | "reject",
  comment: string,
) {
  if (!ids.length) throw new HttpError(400, "Select at least one timesheet");
  if (ids.length > 200) throw new HttpError(400, "Too many timesheets in one request");
  const reason = (comment ?? "").trim();
  if (decision === "reject" && reason.length < 3) throw new HttpError(422, "A reason is required when rejecting a timesheet");
  if (reason.length > 1000) throw new HttpError(422, "Comment is too long");

  const allowed = new Set(await approvableEmployeeIds(user));
  const results: { id: number; ok: boolean; error?: string }[] = [];

  await tx(async (db) => {
    const { rows } = await db.query<{ id: number; employee_id: number; status: TimesheetStatus; week_start: string; version: number }>(
      "SELECT id, employee_id, status, week_start, version FROM timesheets WHERE id = ANY($1) ORDER BY id FOR UPDATE",
      [ids],
    );
    for (const id of ids) {
      const t = rows.find((r) => r.id === id);
      if (!t) {
        results.push({ id, ok: false, error: "Not found" });
        continue;
      }
      if (!allowed.has(t.employee_id) || t.employee_id === user.id) {
        results.push({ id, ok: false, error: "Not authorised to approve this timesheet" });
        continue;
      }
      const next = transition(t.status, decision);
      if (!next) {
        results.push({ id, ok: false, error: `Already ${t.status}` });
        continue;
      }
      const totalRow = await db.query<{ total: number }>(
        `SELECT COALESCE(SUM(e.hours),0)::float AS total FROM time_entries e
           JOIN timesheet_lines l ON l.id = e.line_id WHERE l.timesheet_id = $1`,
        [t.id],
      );
      const total = totalRow.rows[0].total;
      await db.query(
        `UPDATE timesheets SET status = $2, decided_at = now(), decided_by = $3, decision_comment = $4, updated_at = now() WHERE id = $1`,
        [t.id, next, user.id, reason || null],
      );
      await db.query(
        `INSERT INTO approval_records (timesheet_id, action, actor_id, comment, version, total_hours)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [t.id, decision === "approve" ? "approved" : "rejected", user.id, reason || null, t.version, total],
      );
      await audit(db, user.id, `timesheet.${decision}`, "timesheet", t.id, { employee_id: t.employee_id, week: t.week_start, total, comment: reason || undefined });
      await notify(
        db,
        t.employee_id,
        decision === "approve" ? "approved" : "rejected",
        decision === "approve" ? "Timesheet approved" : "Changes requested on your timesheet",
        decision === "approve"
          ? `${user.name} approved ${total}h for ${fmtWeek(t.week_start)}.${reason ? ` Comment: ${reason}` : ""}`
          : `${user.name} returned your timesheet for ${fmtWeek(t.week_start)}: “${reason}”. Please update and resubmit.`,
        `/timesheet?week=${t.week_start}`,
      );
      results.push({ id, ok: true });
    }
  });
  return results;
}

/** Admin intervention: move a submitted/approved sheet back to draft (audited). */
export async function reopenTimesheet(user: SessionUser, id: number, comment: string) {
  if (user.role !== "admin") throw new HttpError(403, "Only administrators can reopen timesheets");
  const reason = (comment ?? "").trim();
  if (reason.length < 3) throw new HttpError(422, "A reason is required to reopen a timesheet");
  return tx(async (db) => {
    const { rows } = await db.query<{ id: number; employee_id: number; status: TimesheetStatus; week_start: string; version: number }>(
      "SELECT id, employee_id, status, week_start, version FROM timesheets WHERE id = $1 FOR UPDATE",
      [id],
    );
    const t = rows[0];
    if (!t) throw new HttpError(404, "Timesheet not found");
    if (!transition(t.status, "reopen")) throw new HttpError(409, `A ${t.status} timesheet cannot be reopened`);
    await db.query(
      "UPDATE timesheets SET status = 'draft', version = version + 1, decided_at = NULL, decided_by = NULL, decision_comment = $2, updated_at = now() WHERE id = $1",
      [id, `Reopened by administrator: ${reason}`],
    );
    await db.query(
      "INSERT INTO approval_records (timesheet_id, action, actor_id, comment, version) VALUES ($1, 'reopened', $2, $3, $4)",
      [id, user.id, reason, t.version],
    );
    await audit(db, user.id, "timesheet.reopen", "timesheet", id, { previous_status: t.status, reason });
    await notify(db, t.employee_id, "reopened", "Timesheet reopened", `An administrator reopened your timesheet for ${fmtWeek(t.week_start)}: “${reason}”.`, `/timesheet?week=${t.week_start}`);
    return { id, status: "draft" };
  });
}

export async function approvalHistory(timesheetId: number) {
  return query<{ id: number; action: string; actor_name: string; comment: string | null; version: number; total_hours: number; created_at: string }>(
    `SELECT r.id, r.action, e.name AS actor_name, r.comment, r.version, r.total_hours, r.created_at
       FROM approval_records r JOIN employees e ON e.id = r.actor_id
      WHERE r.timesheet_id = $1 ORDER BY r.created_at, r.id`,
    [timesheetId],
  );
}

export function isWorkingWeekday(d: string, workingDays: number[]) {
  return workingDays.includes(isoWeekday(d));
}

export const prevWeek = (ws: string) => addDays(ws, -7);
export const nextWeek = (ws: string) => addDays(ws, 7);
