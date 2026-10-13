import { NextResponse } from "next/server";
import { HttpError, requireApiUser } from "@/lib/auth";
import { readJson, route } from "@/lib/api";
import { decideTimesheets } from "@/lib/timesheets";

export const POST = route(async (req) => {
  const user = await requireApiUser(["manager", "admin"]);
  const body = await readJson<{ ids?: unknown; decision?: string; comment?: string }>(req);
  if (!Array.isArray(body.ids)) throw new HttpError(400, "ids must be an array");
  const ids = [...new Set(body.ids.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (body.decision !== "approve" && body.decision !== "reject") throw new HttpError(400, "decision must be approve or reject");
  const results = await decideTimesheets(user, ids, body.decision, String(body.comment ?? ""));
  const failed = results.filter((r) => !r.ok);
  return NextResponse.json({ results, ok: failed.length === 0 }, { status: failed.length && failed.length === results.length ? 409 : 200 });
});
