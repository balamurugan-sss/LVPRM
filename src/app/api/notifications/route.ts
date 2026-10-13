import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { readJson, route } from "@/lib/api";
import { query } from "@/lib/db";

export const POST = route(async (req) => {
  const user = await requireApiUser();
  const body = await readJson<{ ids?: unknown; all?: boolean }>(req);
  if (body.all) {
    await query("UPDATE notifications SET read_at = now() WHERE recipient_id = $1 AND read_at IS NULL", [user.id]);
  } else if (Array.isArray(body.ids)) {
    const ids = body.ids.map(Number).filter(Number.isInteger);
    await query("UPDATE notifications SET read_at = now() WHERE recipient_id = $1 AND id = ANY($2) AND read_at IS NULL", [user.id, ids]);
  }
  return NextResponse.json({ ok: true });
});
