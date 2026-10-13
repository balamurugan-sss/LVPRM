import { NextResponse } from "next/server";
import { HttpError, requireApiUser } from "@/lib/auth";
import { readJson, route } from "@/lib/api";
import { canViewEmployee } from "@/lib/data";
import { isValidISODate } from "@/lib/dates";
import { getTimesheet, saveTimesheet } from "@/lib/timesheets";

export const GET = route(async (req) => {
  const user = await requireApiUser();
  const week = req.nextUrl.searchParams.get("week");
  if (!isValidISODate(week)) throw new HttpError(400, "week must be YYYY-MM-DD");
  const employeeId = Number(req.nextUrl.searchParams.get("employeeId") ?? user.id);
  if (!(await canViewEmployee(user, employeeId))) throw new HttpError(403, "Not authorised");
  return NextResponse.json(await getTimesheet(employeeId, week));
});

// Employees can only write their own timesheet; the owner is always the session user.
export const PUT = route(async (req) => {
  const user = await requireApiUser();
  const body = await readJson<{ week?: string; lines?: unknown; action?: string }>(req);
  if (!isValidISODate(body.week)) throw new HttpError(400, "week must be YYYY-MM-DD");
  if (body.action !== "save" && body.action !== "submit") throw new HttpError(400, "action must be save or submit");
  const result = await saveTimesheet(user, body.week, body.lines, body.action);
  return NextResponse.json({ ...result, timesheet: await getTimesheet(user.id, body.week) });
});
