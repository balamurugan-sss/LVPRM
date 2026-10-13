import { NextResponse } from "next/server";
import { HttpError, requireApiUser } from "@/lib/auth";
import { readJson, route, toInt } from "@/lib/api";
import { queryOne } from "@/lib/db";
import { audit, getSettings, notify } from "@/lib/data";
import { isValidISODate, todayISO } from "@/lib/dates";

type Body = { id?: number; employeeId?: number; projectId?: number; allocationPct?: number; startDate?: string; endDate?: string | null };

async function describe(projectId: number) {
  return queryOne<{ code: string; name: string }>("SELECT code, name FROM projects WHERE id = $1", [projectId]);
}

export const POST = route(async (req) => {
  const user = await requireApiUser(["admin"]);
  const b = await readJson<Body>(req);
  const employeeId = toInt(b.employeeId, "employeeId");
  const projectId = toInt(b.projectId, "projectId");
  const pct = Number(b.allocationPct ?? 100);
  if (!Number.isInteger(pct) || pct < 1 || pct > 100) throw new HttpError(422, "Allocation must be 1-100%");
  const start = isValidISODate(b.startDate) ? b.startDate : todayISO();
  const end = b.endDate && isValidISODate(b.endDate) ? b.endDate : null;
  if (end && end < start) throw new HttpError(422, "End date must be after start date");
  const settings = await getSettings();
  const weekly = (settings.standardDailyHours * settings.workingDays.length * pct) / 100;
  let row;
  try {
    row = await queryOne<{ id: number }>(
      "INSERT INTO assignments (employee_id, project_id, allocation_pct, weekly_hours, start_date, end_date) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
      [employeeId, projectId, pct, weekly, start, end],
    );
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw new HttpError(409, "Employee is already assigned to this project");
    if ((e as { code?: string }).code === "23503") throw new HttpError(404, "Employee or project not found");
    throw e;
  }
  const p = await describe(projectId);
  await audit(null, user.id, "assignment.create", "assignment", row!.id, { employeeId, projectId, pct, start, end });
  if (settings.notifyAssignmentChange) {
    await notify(null, employeeId, "assignment", "New project assignment", `You were assigned to ${p?.code} (${p?.name}) at ${pct}% allocation from ${start}.`, "/allocation");
  }
  return NextResponse.json({ id: row!.id });
});

export const PATCH = route(async (req) => {
  const user = await requireApiUser(["admin"]);
  const b = await readJson<Body>(req);
  const id = toInt(b.id, "id");
  const pct = Number(b.allocationPct);
  if (!Number.isInteger(pct) || pct < 1 || pct > 100) throw new HttpError(422, "Allocation must be 1-100%");
  const end = b.endDate && isValidISODate(b.endDate) ? b.endDate : null;
  const settings = await getSettings();
  const before = await queryOne<{ employee_id: number; project_id: number; allocation_pct: number; end_date: string | null }>(
    "SELECT employee_id, project_id, allocation_pct, end_date FROM assignments WHERE id = $1",
    [id],
  );
  if (!before) throw new HttpError(404, "Assignment not found");
  await queryOne("UPDATE assignments SET allocation_pct = $2, weekly_hours = $3, end_date = $4 WHERE id = $1", [
    id, pct, (settings.standardDailyHours * settings.workingDays.length * pct) / 100, end,
  ]);
  const p = await describe(before.project_id);
  await audit(null, user.id, "assignment.update", "assignment", id, { before, after: { pct, end } });
  if (settings.notifyAssignmentChange) {
    await notify(null, before.employee_id, "assignment", "Project assignment updated", `Your allocation on ${p?.code} is now ${pct}%${end ? ` until ${end}` : ""}.`, "/allocation");
  }
  return NextResponse.json({ ok: true });
});

export const DELETE = route(async (req) => {
  const user = await requireApiUser(["admin"]);
  const id = toInt(req.nextUrl.searchParams.get("id"), "id");
  const row = await queryOne<{ employee_id: number; project_id: number }>("DELETE FROM assignments WHERE id = $1 RETURNING employee_id, project_id", [id]);
  if (!row) throw new HttpError(404, "Assignment not found");
  const p = await describe(row.project_id);
  await audit(null, user.id, "assignment.delete", "assignment", id, row);
  const settings = await getSettings();
  if (settings.notifyAssignmentChange) {
    await notify(null, row.employee_id, "assignment", "Removed from project", `You were unassigned from ${p?.code} (${p?.name}).`, "/allocation");
  }
  return NextResponse.json({ ok: true });
});
