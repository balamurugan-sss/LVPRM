/**
 * End-to-end API test of the core workflow against a running server (seeded demo data):
 * employee logs hours → submits → manager rejects → employee resubmits → manager approves → reports reflect it.
 * Usage: BASE_URL=http://localhost:3000 npm run test:e2e   (re-run `npm run db:seed` afterwards to reset data)
 */
import assert from "node:assert/strict";
import { addDays, todayISO, weekStart } from "../../src/lib/dates";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const WEEK = weekStart(todayISO());
const EMPLOYEE = "arjun.menon@demo.prm.local";
const MANAGER = "priya.raman@demo.prm.local";
const OTHER_MANAGER = "daniel.brooks@demo.prm.local";

class Client {
  cookie = "";
  async login(email: string) {
    const r = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "demo1234" }) });
    assert.equal(r.status, 200, `login ${email}`);
    this.cookie = (r.headers.get("set-cookie") ?? "").split(";")[0];
    return this;
  }
  async call(path: string, method = "GET", body?: unknown) {
    const r = await fetch(`${BASE}${path}`, { method, headers: { cookie: this.cookie, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const text = await r.text();
    let json: any = text;
    try { json = JSON.parse(text); } catch {}
    return { status: r.status, json };
  }
}

function approvedFor(csv: string, name: string) {
  const header = csv.replace(/^﻿/, "").split("\r\n")[0].split(",");
  const row = csv.split("\r\n").find((l) => l.includes(name))!.split(",");
  return Number(row[header.indexOf("Approved Hrs")]);
}

async function step(name: string, fn: () => Promise<void>) {
  await fn();
  console.log(`  ✓ ${name}`);
}

async function main() {
  console.log(`E2E workflow against ${BASE} (week ${WEEK})`);
  const emp = await new Client().login(EMPLOYEE);
  const mgr = await new Client().login(MANAGER);
  const other = await new Client().login(OTHER_MANAGER);

  const anon = await new Client().call(`/api/timesheets?week=${WEEK}`);
  await step("unauthenticated API access is rejected", async () => assert.equal(anon.status, 401));

  const csvBefore = (await mgr.call(`/api/export?type=employees&from=${WEEK}&to=${addDays(WEEK, 6)}`)).json as string;
  const approvedBefore = approvedFor(csvBefore, "Arjun Menon");

  const sheet = (await emp.call(`/api/timesheets?week=${WEEK}`)).json;
  const projectIds: number[] = [...new Set<number>(sheet.lines.map((l: { projectId: number }) => l.projectId))];
  assert.ok(projectIds.length > 0, "employee has allocations");
  const lines = [{ projectId: projectIds[0], task: "", notes: "e2e", billable: true, hours: [8, 8, 8, 8, 7.5, 0, 0] }];

  await step("employee saves a draft", async () => {
    const r = await emp.call("/api/timesheets", "PUT", { week: WEEK, action: "save", lines });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.timesheet.total, 39.5);
  });
  await step("server rejects hours over the daily limit", async () => {
    const r = await emp.call("/api/timesheets", "PUT", { week: WEEK, action: "save", lines: [{ ...lines[0], hours: [20, 0, 0, 0, 0, 0, 0] }] });
    assert.equal(r.status, 422);
  });
  await step("server rejects unassigned projects", async () => {
    const r = await emp.call("/api/timesheets", "PUT", { week: WEEK, action: "save", lines: [{ ...lines[0], projectId: 999999 }] });
    assert.equal(r.status, 422);
  });

  let id = 0;
  await step("employee submits for approval", async () => {
    const r = await emp.call("/api/timesheets", "PUT", { week: WEEK, action: "submit", lines });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.timesheet.status, "submitted");
    id = r.json.id;
  });
  await step("duplicate submission and editing after submit are blocked", async () => {
    assert.equal((await emp.call("/api/timesheets", "PUT", { week: WEEK, action: "submit", lines })).status, 409);
    assert.equal((await emp.call("/api/timesheets", "PUT", { week: WEEK, action: "save", lines })).status, 409);
  });
  await step("employee cannot approve", async () => {
    assert.equal((await emp.call("/api/approvals", "POST", { ids: [id], decision: "approve" })).status, 403);
  });
  await step("a manager outside the reporting line cannot approve", async () => {
    const r = await other.call("/api/approvals", "POST", { ids: [id], decision: "approve" });
    assert.equal(r.json.results[0].ok, false);
  });
  await step("rejection requires a reason", async () => {
    assert.equal((await mgr.call("/api/approvals", "POST", { ids: [id], decision: "reject", comment: "" })).status, 422);
  });
  await step("manager rejects with a comment", async () => {
    const r = await mgr.call("/api/approvals", "POST", { ids: [id], decision: "reject", comment: "Friday should be 8h" });
    assert.equal(r.status, 200);
    assert.equal(r.json.results[0].ok, true);
  });
  await step("employee sees rejected status and is notified", async () => {
    const s = (await emp.call(`/api/timesheets?week=${WEEK}`)).json;
    assert.equal(s.status, "rejected");
    assert.equal(s.decisionComment, "Friday should be 8h");
  });
  await step("employee edits and resubmits (version 2)", async () => {
    const r = await emp.call("/api/timesheets", "PUT", { week: WEEK, action: "submit", lines: [{ ...lines[0], hours: [8, 8, 8, 8, 8, 0, 0] }] });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.timesheet.version, 2);
  });
  await step("manager approves", async () => {
    const r = await mgr.call("/api/approvals", "POST", { ids: [id], decision: "approve", comment: "Thanks" });
    assert.equal(r.json.results[0].ok, true);
    const again = await mgr.call("/api/approvals", "POST", { ids: [id], decision: "approve" });
    assert.equal(again.json.results[0].ok, false, "cannot approve twice");
  });
  await step("history preserves every transition", async () => {
    const d = (await mgr.call(`/api/timesheets/${id}`)).json;
    assert.deepEqual(d.history.map((h: { action: string }) => h.action), ["submitted", "rejected", "submitted", "approved"]);
  });
  await step("reports reflect the approved hours", async () => {
    const csvAfter = (await mgr.call(`/api/export?type=employees&from=${WEEK}&to=${addDays(WEEK, 6)}`)).json as string;
    assert.equal(approvedFor(csvAfter, "Arjun Menon"), approvedBefore + 40);
  });
  await step("approved timesheets are locked for the employee", async () => {
    assert.equal((await emp.call("/api/timesheets", "PUT", { week: WEEK, action: "save", lines })).status, 409);
  });
  console.log("All workflow checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
