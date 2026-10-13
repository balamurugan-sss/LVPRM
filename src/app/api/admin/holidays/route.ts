import { NextResponse } from "next/server";
import { HttpError, requireApiUser } from "@/lib/auth";
import { readJson, route, toInt } from "@/lib/api";
import { queryOne } from "@/lib/db";
import { audit } from "@/lib/data";
import { isValidISODate } from "@/lib/dates";

export const POST = route(async (req) => {
  const user = await requireApiUser(["admin"]);
  const body = await readJson<{ date?: string; name?: string }>(req);
  const name = String(body.name ?? "").trim();
  if (!isValidISODate(body.date) || !name || name.length > 80) throw new HttpError(422, "A valid date and name are required");
  const row = await queryOne<{ id: number }>(
    "INSERT INTO holidays (date, name) VALUES ($1, $2) ON CONFLICT (date) DO UPDATE SET name = EXCLUDED.name RETURNING id",
    [body.date, name],
  );
  await audit(null, user.id, "holiday.upsert", "holiday", row!.id, { date: body.date, name });
  return NextResponse.json({ ok: true });
});

export const DELETE = route(async (req) => {
  const user = await requireApiUser(["admin"]);
  const id = toInt(req.nextUrl.searchParams.get("id"), "id");
  const row = await queryOne("DELETE FROM holidays WHERE id = $1 RETURNING date, name", [id]);
  if (!row) throw new HttpError(404, "Holiday not found");
  await audit(null, user.id, "holiday.delete", "holiday", id, row);
  return NextResponse.json({ ok: true });
});
