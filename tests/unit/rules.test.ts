import { test } from "node:test";
import assert from "node:assert/strict";
import { availableHours, dailyTotals, DEFAULT_SETTINGS, isOverdue, transition, utilizationPct, validateGrid, weekTotal, type GridLine } from "../../src/lib/rules";
import { weekStart, addDays } from "../../src/lib/dates";

const line = (projectId: number, hours: number[], billable = true): GridLine => ({ projectId, task: "", notes: "", billable, hours });

test("totals add up per day and week with decimals", () => {
  const lines = [line(1, [6, 6, 5, 6, 6, 0, 0]), line(2, [2, 2, 3, 2, 2.5, 0, 0])];
  assert.deepEqual(dailyTotals(lines), [8, 8, 8, 8, 8.5, 0, 0]);
  assert.equal(weekTotal(lines), 40.5);
});

test("save allows partial weeks; submit flags incomplete days as warnings", () => {
  const lines = [line(1, [8, 4, 0, 0, 0, 0, 0])];
  assert.equal(validateGrid(lines, DEFAULT_SETTINGS, { mode: "save" }).length, 0);
  const issues = validateGrid(lines, DEFAULT_SETTINGS, { mode: "submit" });
  assert.equal(issues.filter((i) => i.level === "error").length, 0);
  assert.equal(issues.filter((i) => i.level === "warning").length, 4);
});

test("holidays/leave days are not flagged as incomplete", () => {
  const lines = [line(1, [8, 8, 0, 8, 8, 0, 0])];
  const issues = validateGrid(lines, DEFAULT_SETTINGS, { mode: "submit", nonWorking: new Set([2]) });
  assert.equal(issues.length, 0);
});

test("rejects invalid hours, limits, unassigned projects and duplicates", () => {
  const s = DEFAULT_SETTINGS;
  const e = (lines: GridLine[], opts = {}) => validateGrid(lines, s, { mode: "save", ...opts }).filter((i) => i.level === "error");
  assert.ok(e([line(1, [-1, 0, 0, 0, 0, 0, 0])]).length);
  assert.ok(e([line(1, [1.3, 0, 0, 0, 0, 0, 0])]).length, "quarter hours only");
  assert.ok(e([line(1, [13, 0, 0, 0, 0, 0, 0])]).length, "daily limit");
  assert.ok(e([line(9, [1, 0, 0, 0, 0, 0, 0])], { allowedProjectIds: new Set([1]) }).length);
  assert.ok(e([line(1, [1, 0, 0, 0, 0, 0, 0]), line(1, [1, 0, 0, 0, 0, 0, 0])]).length);
  assert.ok(validateGrid([line(1, [0, 0, 0, 0, 0, 0, 0])], s, { mode: "submit" }).some((i) => i.level === "error"), "empty submit");
});

test("workflow transitions", () => {
  assert.equal(transition("draft", "submit"), "submitted");
  assert.equal(transition("submitted", "submit"), null, "no duplicate submission");
  assert.equal(transition("submitted", "approve"), "approved");
  assert.equal(transition("submitted", "reject"), "rejected");
  assert.equal(transition("rejected", "submit"), "submitted");
  assert.equal(transition("approved", "save"), null);
  assert.equal(transition("approved", "approve"), null);
  assert.equal(transition("approved", "reopen"), "draft");
});

test("available hours exclude weekends, holidays and leave; utilization formula", () => {
  // 2026-10-12 is a Monday
  const avail = availableHours("2026-10-12", "2026-10-18", {
    workingDays: [1, 2, 3, 4, 5], dailyHours: 8, holidays: new Set(["2026-10-14"]), leaveHours: new Map([["2026-10-15", 4]]),
  });
  assert.equal(avail, 28);
  assert.equal(utilizationPct(21, 28), 75);
  assert.equal(utilizationPct(5, 0), 0);
});

test("overdue after deadline only when not submitted", () => {
  const ws = weekStart("2026-10-05");
  assert.equal(isOverdue(ws, null, addDays(ws, 8), 2), false);
  assert.equal(isOverdue(ws, null, addDays(ws, 9), 2), true);
  assert.equal(isOverdue(ws, "draft", addDays(ws, 9), 2), true);
  assert.equal(isOverdue(ws, "submitted", addDays(ws, 30), 2), false);
});
