import "server-only";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { query, queryOne } from "./db";

export type Role = "employee" | "manager" | "admin";

export type SessionUser = {
  id: number;
  emp_code: string;
  name: string;
  email: string;
  role: Role;
  title: string;
  department: string | null;
  manager_id: number | null;
  manager_name: string | null;
};

export const SESSION_COOKIE = "prm_session";
const SESSION_TTL_HOURS = 12;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 32).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const candidate = scryptSync(password, salt, 32);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

export async function createSession(employeeId: number): Promise<{ token: string; expires: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_TTL_HOURS * 3600 * 1000);
  await query("INSERT INTO sessions (token, employee_id, expires_at) VALUES ($1, $2, $3)", [sha256(token), employeeId, expires]);
  await query("DELETE FROM sessions WHERE expires_at < now()");
  return { token, expires };
}

export async function destroySession(token: string | undefined) {
  if (token) await query("DELETE FROM sessions WHERE token = $1", [sha256(token)]);
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return queryOne<SessionUser>(
    `SELECT e.id, e.emp_code, e.name, e.email, e.role, e.title, d.name AS department,
            e.manager_id, m.name AS manager_name
       FROM sessions s
       JOIN employees e ON e.id = s.employee_id AND e.active
       LEFT JOIN departments d ON d.id = e.department_id
       LEFT JOIN employees m ON m.id = e.manager_id
      WHERE s.token = $1 AND s.expires_at > now()`,
    [sha256(token)],
  );
}

/** For server components/pages: redirect to login (or home) when not permitted. */
export async function requirePageUser(roles?: Role[]): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (roles && !roles.includes(user.role)) redirect("/dashboard?denied=1");
  return user;
}

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

/** For API route handlers: throw 401/403 when not permitted. */
export async function requireApiUser(roles?: Role[]): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new HttpError(401, "Not authenticated");
  if (roles && !roles.includes(user.role)) throw new HttpError(403, "You do not have permission to perform this action");
  return user;
}

export const isManager = (u: SessionUser) => u.role === "manager" || u.role === "admin";
