import { NextResponse } from "next/server";
import { HttpError, requireApiUser } from "@/lib/auth";
import { route, toInt } from "@/lib/api";
import { canViewEmployee } from "@/lib/data";
import { approvalHistory, getTimesheetById } from "@/lib/timesheets";

export const GET = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const user = await requireApiUser();
  const id = toInt((await params).id, "id");
  const sheet = await getTimesheetById(id);
  if (!sheet || !(await canViewEmployee(user, sheet.employeeId))) throw new HttpError(404, "Timesheet not found");
  return NextResponse.json({ ...sheet, history: await approvalHistory(id) });
});
