import { NextResponse } from "next/server";
import { destroySession, SESSION_COOKIE } from "@/lib/auth";
import { route } from "@/lib/api";

export const POST = route(async (req) => {
  await destroySession(req.cookies.get(SESSION_COOKIE)?.value);
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
});
