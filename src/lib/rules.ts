// Pure business rules shared by the server (authoritative) and the client (instant feedback).
// No database or framework imports here so it stays unit-testable.

import { addDays, eachDay, isoWeekday } from "./dates";

export type Settings = {
  standardDailyHours: number;
  maxDailyHours: number;
  maxWeeklyHours: number;
  workingDays: number[]; // ISO weekdays, 1 = Monday
  submissionDeadlineDays: number; // days after the week ends before a missing submission is overdue
  utilizationTarget: number; // %
  allowWeekendEntry: boolean;
  notifyDeadlineReminder: boolean;
  notifyMissingTimesheet: boolean;
  notifyAssignmentChange: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  standardDailyHours: 8,
  maxDailyHours: 12,
  maxWeeklyHours: 60,
  workingDays: [1, 2, 3, 4, 5],
  submissionDeadlineDays: 2,
  utilizationTarget: 80,
  allowWeekendEntry: true,
  notifyDeadlineReminder: true,
  notifyMissingTimesheet: true,
  notifyAssignmentChange: true,
};

export type TimesheetStatus = "draft" | "submitted" | "approved" | "rejected";

export type GridLine = {
  projectId: number;
  task: string;
  notes: string;
  billable: boolean;
  hours: number[]; // 7 values, Monday..Sunday
};

export type ValidationIssue = { level: "error" | "warning"; message: string; day?: number; line?: number };

export const round2 = (n: number) => Math.round(n * 100) / 100;

export function dailyTotals(lines: GridLine[]): number[] {
  return Array.from({ length: 7 }, (_, d) => round2(lines.reduce((s, l) => s + (Number(l.hours[d]) || 0), 0)));
}

export function lineTotal(line: GridLine): number {
  return round2(line.hours.reduce((s, h) => s + (Number(h) || 0), 0));
}

export function weekTotal(lines: GridLine[]): number {
  return round2(dailyTotals(lines).reduce((s, h) => s + h, 0));
}

/**
 * Validate a weekly grid.
 * `mode = "save"` only rejects malformed data; `mode = "submit"` also enforces completeness.
 * `nonWorking` is the set of day indexes (0..6) that are holidays or full-day leave.
 */
export function validateGrid(
  lines: GridLine[],
  settings: Settings,
  opts: { mode: "save" | "submit"; nonWorking?: Set<number>; allowedProjectIds?: Set<number>; dailyHours?: number },
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const nonWorking = opts.nonWorking ?? new Set<number>();
  const expected = opts.dailyHours ?? settings.standardDailyHours;

  if (lines.length > 30) issues.push({ level: "error", message: "A timesheet can contain at most 30 rows." });

  const seen = new Set<string>();
  lines.forEach((l, i) => {
    const row = i + 1;
    if (!Number.isInteger(l.projectId) || l.projectId <= 0) {
      issues.push({ level: "error", line: i, message: `Row ${row}: choose a project.` });
    } else if (opts.allowedProjectIds && !opts.allowedProjectIds.has(l.projectId)) {
      issues.push({ level: "error", line: i, message: `Row ${row}: you are not assigned to this project.` });
    }
    if ((l.task ?? "").length > 200) issues.push({ level: "error", line: i, message: `Row ${row}: task is too long.` });
    if ((l.notes ?? "").length > 1000) issues.push({ level: "error", line: i, message: `Row ${row}: notes are too long.` });
    if (!Array.isArray(l.hours) || l.hours.length !== 7) {
      issues.push({ level: "error", line: i, message: `Row ${row}: malformed hours.` });
      return;
    }
    l.hours.forEach((h, d) => {
      if (typeof h !== "number" || Number.isNaN(h) || h < 0 || h > 24) {
        issues.push({ level: "error", line: i, day: d, message: `Row ${row}: hours must be between 0 and 24.` });
      } else if (round2(h * 4) !== Math.round(h * 4)) {
        issues.push({ level: "error", line: i, day: d, message: `Row ${row}: use quarter-hour increments (e.g. 1.25, 1.5).` });
      }
      if (h > 0 && !settings.allowWeekendEntry && !settings.workingDays.includes(d + 1)) {
        issues.push({ level: "error", line: i, day: d, message: `Row ${row}: entries on non-working days are not allowed.` });
      }
    });
    const key = String(l.projectId);
    if (seen.has(key)) issues.push({ level: "error", line: i, message: `Row ${row}: duplicate allocation row.` });
    seen.add(key);
  });

  const totals = dailyTotals(lines);
  totals.forEach((t, d) => {
    if (t > settings.maxDailyHours) {
      issues.push({ level: "error", day: d, message: `${DAY_NAMES[d]}: ${t}h exceeds the daily limit of ${settings.maxDailyHours}h.` });
    }
  });
  const total = weekTotal(lines);
  if (total > settings.maxWeeklyHours) {
    issues.push({ level: "error", message: `Weekly total ${total}h exceeds the limit of ${settings.maxWeeklyHours}h.` });
  }

  if (opts.mode === "submit") {
    if (total <= 0) issues.push({ level: "error", message: "Enter at least one hour before submitting." });
    settings.workingDays.forEach((wd) => {
      const d = wd - 1;
      if (nonWorking.has(d)) return;
      if (totals[d] === 0) issues.push({ level: "warning", day: d, message: `${DAY_NAMES[d]}: no hours entered.` });
      else if (totals[d] < expected) {
        issues.push({ level: "warning", day: d, message: `${DAY_NAMES[d]}: ${totals[d]}h is below the expected ${expected}h.` });
      }
    });
  }
  return issues;
}

export const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Allowed status transitions. Returns the new status or null if the transition is illegal. */
export function transition(
  from: TimesheetStatus,
  action: "save" | "submit" | "approve" | "reject" | "reopen",
): TimesheetStatus | null {
  switch (action) {
    case "save":
      return from === "draft" || from === "rejected" ? from : null;
    case "submit":
      return from === "draft" || from === "rejected" ? "submitted" : null;
    case "approve":
      return from === "submitted" ? "approved" : null;
    case "reject":
      return from === "submitted" ? "rejected" : null;
    case "reopen":
      return from === "submitted" || from === "approved" ? "draft" : null;
  }
}

/**
 * Available working hours for an employee in [from, to]:
 * working days × daily hours, minus holidays and approved leave.
 */
export function availableHours(
  from: string,
  to: string,
  opts: { workingDays: number[]; dailyHours: number; holidays: Set<string>; leaveHours?: Map<string, number> },
): number {
  let total = 0;
  for (const d of eachDay(from, to)) {
    if (!opts.workingDays.includes(isoWeekday(d))) continue;
    if (opts.holidays.has(d)) continue;
    const leave = opts.leaveHours?.get(d) ?? 0;
    total += Math.max(0, opts.dailyHours - leave);
  }
  return round2(total);
}

/** Employee Utilization (%) = Approved Billable Hours ÷ Available Working Hours × 100 */
export function utilizationPct(approvedBillable: number, available: number): number {
  if (available <= 0) return 0;
  return round2((approvedBillable / available) * 100);
}

/** A week is overdue if it is not submitted/approved and its deadline has passed. */
export function isOverdue(weekStartISO: string, status: TimesheetStatus | null, today: string, deadlineDays: number): boolean {
  if (status === "submitted" || status === "approved") return false;
  const deadline = addDays(weekStartISO, 6 + deadlineDays);
  return today > deadline;
}

export function deadlineFor(weekStartISO: string, deadlineDays: number): string {
  return addDays(weekStartISO, 6 + deadlineDays);
}
