import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { HttpError } from "./auth";

type Handler<C> = (req: NextRequest, ctx: C) => Promise<Response>;

/**
 * Wraps a route handler with JSON error handling and a same-origin check for
 * state-changing requests (defence in depth on top of SameSite cookies).
 */
export function route<C = unknown>(fn: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      if (req.method !== "GET" && req.method !== "HEAD") {
        const origin = req.headers.get("origin");
        const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
        if (origin && host && new URL(origin).host !== host) {
          throw new HttpError(403, "Cross-origin request rejected");
        }
      }
      return await fn(req, ctx);
    } catch (err) {
      if (err instanceof HttpError) {
        return NextResponse.json({ error: err.message, details: err.details ?? null }, { status: err.status });
      }
      console.error(err);
      return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
    }
  };
}

export async function readJson<T = Record<string, unknown>>(req: NextRequest): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}

export function toInt(v: unknown, field: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, `${field} must be a positive integer`);
  return n;
}

export function csvResponse(filename: string, header: string[], rows: (string | number | boolean | null | undefined)[][]) {
  const esc = (v: unknown) => {
    let s = v === null || v === undefined ? "" : String(v);
    // Neutralise spreadsheet formula injection.
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = "﻿" + [header, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
