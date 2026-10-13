import { NextResponse } from "next/server";
import { hashPassword, HttpError, requireApiUser } from "@/lib/auth";
import { readJson, route, toInt } from "@/lib/api";
import { queryOne } from "@/lib/db";
import { audit } from "@/lib/data";

type Body = {
  id?: number; name?: string; email?: string; empCode?: string; role?: string; title?: string;
  departmentId?: number | null; managerId?: number | null; location?: string; active?: boolean; dailyHours?: number | null;
};

function clean(b: Body, creating: boolean) {
  const name = String(b.name ?? "").trim();
  const email = String(b.email ?? "").trim().toLowerCase();
  const empCode = String(b.empCode ?? "").trim().toUpperCase();
  if (creating || b.name !== undefined) if (!name || name.length > 100) throw new HttpError(422, "Name is required");
  if (creating || b.email !== undefined) if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(422, "A valid email is required");
  if (creating && !/^[A-Z0-9-]{2,20}$/.test(empCode)) throw new HttpError(422, "Employee ID must be 2-20 letters/digits");
  if (b.role !== undefined && !["employee", "manager", "admin"].includes(b.role)) throw new HttpError(422, "Invalid role");
  if (b.dailyHours !== undefined && b.dailyHours !== null && (Number(b.dailyHours) <= 0 || Number(b.dailyHours) > 12)) {
    throw new HttpError(422, "Daily hours must be between 0 and 12");
  }
  return { name, email, empCode };
}

export const POST = route(async (req) => {
  const user = await requireApiUser(["admin"]);
  const b = await readJson<Body & { password?: string }>(req);
  const { name, email, empCode } = clean(b, true);
  const password = String(b.password ?? "");
  if (password.length < 8) throw new HttpError(422, "Initial password must be at least 8 characters");
  try {
    const row = await queryOne<{ id: number }>(
      `INSERT INTO employees (emp_code, name, email, password_hash, role, title, department_id, manager_id, location, daily_hours)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [empCode, name, email, hashPassword(password), b.role ?? "employee", String(b.title ?? ""), b.departmentId ?? null, b.managerId ?? null, String(b.location ?? ""), b.dailyHours ?? null],
    );
    await audit(null, user.id, "employee.create", "employee", row!.id, { empCode, name, role: b.role ?? "employee" });
    return NextResponse.json({ id: row!.id });
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw new HttpError(409, "Employee ID or email already exists");
    throw e;
  }
});

export const PATCH = route(async (req) => {
  const user = await requireApiUser(["admin"]);
  const b = await readJson<Body>(req);
  const id = toInt(b.id, "id");
  clean(b, false);
  if (b.managerId === id) throw new HttpError(422, "An employee cannot report to themselves");
  if (b.managerId) {
    // Prevent reporting cycles.
    const cycle = await queryOne(
      `WITH RECURSIVE chain AS (SELECT id, manager_id FROM employees WHERE id = $1
         UNION SELECT e.id, e.manager_id FROM employees e JOIN chain c ON e.id = c.manager_id)
       SELECT 1 FROM chain WHERE id = $2`,
      [b.managerId, id],
    );
    if (cycle) throw new HttpError(422, "That change would create a reporting cycle");
  }
  if (id === user.id && (b.role !== undefined && b.role !== "admin" || b.active === false)) {
    throw new HttpError(422, "You cannot remove your own administrator access");
  }
  const before = await queryOne("SELECT name, email, role, title, department_id, manager_id, location, active, daily_hours FROM employees WHERE id = $1", [id]);
  if (!before) throw new HttpError(404, "Employee not found");
  const fields: [string, unknown][] = [];
  if (b.name !== undefined) fields.push(["name", String(b.name).trim()]);
  if (b.email !== undefined) fields.push(["email", String(b.email).trim().toLowerCase()]);
  if (b.role !== undefined) fields.push(["role", b.role]);
  if (b.title !== undefined) fields.push(["title", String(b.title)]);
  if (b.departmentId !== undefined) fields.push(["department_id", b.departmentId]);
  if (b.managerId !== undefined) fields.push(["manager_id", b.managerId]);
  if (b.location !== undefined) fields.push(["location", String(b.location)]);
  if (b.active !== undefined) fields.push(["active", Boolean(b.active)]);
  if (b.dailyHours !== undefined) fields.push(["daily_hours", b.dailyHours]);
  if (!fields.length) return NextResponse.json({ ok: true });
  const set = fields.map(([k], i) => `${k} = $${i + 2}`).join(", ");
  try {
    await queryOne(`UPDATE employees SET ${set} WHERE id = $1`, [id, ...fields.map(([, v]) => v)]);
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw new HttpError(409, "Email already exists");
    throw e;
  }
  if (b.active === false) await queryOne("DELETE FROM sessions WHERE employee_id = $1", [id]);
  await audit(null, user.id, "employee.update", "employee", id, { before, changes: Object.fromEntries(fields) });
  return NextResponse.json({ ok: true });
});
