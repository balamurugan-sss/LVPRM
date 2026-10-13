import { NextResponse } from "next/server";
import { HttpError, requireApiUser } from "@/lib/auth";
import { readJson, route, toInt } from "@/lib/api";
import { queryOne } from "@/lib/db";
import { audit } from "@/lib/data";
import { isValidISODate } from "@/lib/dates";

type Body = {
  id?: number; code?: string; name?: string; client?: string; billable?: boolean; managerId?: number | null;
  startDate?: string; endDate?: string | null; plannedHours?: number; status?: string; color?: string;
};

function check(b: Body, creating: boolean) {
  if (creating && !/^[A-Z0-9-]{2,20}$/.test(String(b.code ?? "").toUpperCase())) throw new HttpError(422, "Code must be 2-20 letters/digits/dashes");
  if ((creating || b.name !== undefined) && !String(b.name ?? "").trim()) throw new HttpError(422, "Name is required");
  if ((creating || b.startDate !== undefined) && !isValidISODate(b.startDate)) throw new HttpError(422, "Start date is required");
  if (b.endDate && !isValidISODate(b.endDate)) throw new HttpError(422, "Invalid end date");
  if (b.endDate && b.startDate && b.endDate < b.startDate) throw new HttpError(422, "End date must be after the start date");
  if (b.plannedHours !== undefined && (!(Number(b.plannedHours) >= 0) || Number(b.plannedHours) > 1_000_000)) throw new HttpError(422, "Invalid planned hours");
  if (b.status !== undefined && !["active", "on_hold", "closed"].includes(b.status)) throw new HttpError(422, "Invalid status");
  if (b.color !== undefined && !/^#[0-9a-fA-F]{6}$/.test(b.color)) throw new HttpError(422, "Color must be a hex value");
}

export const POST = route(async (req) => {
  const user = await requireApiUser(["admin"]);
  const b = await readJson<Body>(req);
  check(b, true);
  try {
    const row = await queryOne<{ id: number }>(
      `INSERT INTO projects (code, name, client, billable, manager_id, start_date, end_date, planned_hours, color)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [String(b.code).toUpperCase(), String(b.name).trim(), String(b.client ?? "Internal").trim() || "Internal", b.billable ?? true, b.managerId ?? null, b.startDate, b.endDate || null, Number(b.plannedHours ?? 0), b.color ?? "#6366f1"],
    );
    await audit(null, user.id, "project.create", "project", row!.id, b);
    return NextResponse.json({ id: row!.id });
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw new HttpError(409, "Project code already exists");
    throw e;
  }
});

export const PATCH = route(async (req) => {
  const user = await requireApiUser(["admin"]);
  const b = await readJson<Body>(req);
  const id = toInt(b.id, "id");
  check(b, false);
  const before = await queryOne("SELECT * FROM projects WHERE id = $1", [id]);
  if (!before) throw new HttpError(404, "Project not found");
  const map: Record<string, unknown> = {
    name: b.name?.trim(), client: b.client?.trim(), billable: b.billable, manager_id: b.managerId,
    start_date: b.startDate, end_date: b.endDate === "" ? null : b.endDate, planned_hours: b.plannedHours, status: b.status, color: b.color,
  };
  const fields = Object.entries(map).filter(([, v]) => v !== undefined);
  if (fields.length) {
    await queryOne(`UPDATE projects SET ${fields.map(([k], i) => `${k} = $${i + 2}`).join(", ")} WHERE id = $1`, [id, ...fields.map(([, v]) => v)]);
  }
  await audit(null, user.id, "project.update", "project", id, { before, changes: Object.fromEntries(fields) });
  return NextResponse.json({ ok: true });
});
