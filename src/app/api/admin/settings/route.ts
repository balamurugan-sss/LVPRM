import { NextResponse } from "next/server";
import { HttpError, requireApiUser } from "@/lib/auth";
import { readJson, route } from "@/lib/api";
import { tx } from "@/lib/db";
import { audit, getSettings } from "@/lib/data";
import { DEFAULT_SETTINGS, type Settings } from "@/lib/rules";

function validate(input: Record<string, unknown>): Partial<Settings> {
  const out: Partial<Settings> = {};
  const num = (k: keyof Settings, min: number, max: number) => {
    if (input[k] === undefined) return;
    const n = Number(input[k]);
    if (!Number.isFinite(n) || n < min || n > max) throw new HttpError(422, `${k} must be between ${min} and ${max}`);
    (out as Record<string, unknown>)[k] = n;
  };
  num("standardDailyHours", 1, 12);
  num("maxDailyHours", 1, 24);
  num("maxWeeklyHours", 1, 100);
  num("submissionDeadlineDays", 0, 14);
  num("utilizationTarget", 1, 100);
  if (input.workingDays !== undefined) {
    const wd = input.workingDays;
    if (!Array.isArray(wd) || !wd.length || wd.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) {
      throw new HttpError(422, "workingDays must be a non-empty list of ISO weekdays (1-7)");
    }
    out.workingDays = [...new Set(wd as number[])].sort();
  }
  for (const k of ["allowWeekendEntry", "notifyDeadlineReminder", "notifyMissingTimesheet", "notifyAssignmentChange"] as const) {
    if (input[k] !== undefined) out[k] = Boolean(input[k]);
  }
  return out;
}

export const PUT = route(async (req) => {
  const user = await requireApiUser(["admin"]);
  const changes = validate(await readJson(req));
  const current = await getSettings();
  const next = { ...current, ...changes };
  if (next.maxDailyHours < next.standardDailyHours) throw new HttpError(422, "Max daily hours cannot be below the standard daily hours");
  await tx(async (db) => {
    for (const [k, v] of Object.entries(changes)) {
      if (!(k in DEFAULT_SETTINGS)) continue;
      await db.query("INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [k, JSON.stringify(v)]);
    }
    await audit(db, user.id, "settings.update", "settings", null, { before: current, changes });
  });
  return NextResponse.json(next);
});
