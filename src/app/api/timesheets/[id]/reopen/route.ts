import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { readJson, route, toInt } from "@/lib/api";
import { reopenTimesheet } from "@/lib/timesheets";

export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const user = await requireApiUser(["admin"]);
  const id = toInt((await params).id, "id");
  const body = await readJson<{ comment?: string }>(req);
  return NextResponse.json(await reopenTimesheet(user, id, String(body.comment ?? "")));
});
