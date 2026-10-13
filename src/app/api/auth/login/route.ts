import { NextResponse } from "next/server";
import { createSession, HttpError, SESSION_COOKIE, verifyPassword } from "@/lib/auth";
import { readJson, route } from "@/lib/api";
import { queryOne } from "@/lib/db";
import { audit } from "@/lib/data";

// Simple in-memory throttle per email (per server instance).
const attempts = new Map<string, { n: number; until: number }>();

export const POST = route(async (req) => {
  const body = await readJson<{ email?: string; password?: string }>(req);
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!email || !password) throw new HttpError(400, "Email and password are required");

  const a = attempts.get(email);
  if (a && a.n >= 5 && a.until > Date.now()) throw new HttpError(429, "Too many attempts. Try again in a minute.");

  const user = await queryOne<{ id: number; password_hash: string }>(
    "SELECT id, password_hash FROM employees WHERE lower(email) = $1 AND active",
    [email],
  );
  if (!user || !verifyPassword(password, user.password_hash)) {
    attempts.set(email, { n: (a?.n ?? 0) + 1, until: Date.now() + 60_000 });
    throw new HttpError(401, "Invalid email or password");
  }
  attempts.delete(email);
  const { token, expires } = await createSession(user.id);
  await audit(null, user.id, "auth.login", "employee", user.id);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "true",
    path: "/",
    expires,
  });
  return res;
});
