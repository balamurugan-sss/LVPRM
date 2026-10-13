// Date helpers operating on ISO 'YYYY-MM-DD' strings in UTC to avoid timezone drift.

export function parseISO(d: string): Date {
  return new Date(`${d}T00:00:00Z`);
}

export function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function todayISO(): string {
  return toISO(new Date());
}

export function addDays(d: string, n: number): string {
  const dt = parseISO(d);
  dt.setUTCDate(dt.getUTCDate() + n);
  return toISO(dt);
}

/** ISO weekday: 1 = Monday … 7 = Sunday */
export function isoWeekday(d: string): number {
  const day = parseISO(d).getUTCDay();
  return day === 0 ? 7 : day;
}

export function weekStart(d: string): string {
  return addDays(d, 1 - isoWeekday(d));
}

export function weekDays(start: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function isValidISODate(d: unknown): d is string {
  return typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(parseISO(d).getTime());
}

export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function fmtDay(d: string): string {
  const dt = parseISO(d);
  return `${DAYS[isoWeekday(d) - 1]}, ${MONTHS[dt.getUTCMonth()]} ${dt.getUTCDate()}`;
}

export function fmtShort(d: string): string {
  const dt = parseISO(d);
  return `${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()]}`;
}

export function fmtDate(d: string): string {
  const dt = parseISO(d);
  return `${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`;
}

export function fmtWeek(start: string): string {
  return `${fmtShort(start)} – ${fmtDate(addDays(start, 6))}`;
}

export function dayLabel(d: string): string {
  return DAYS[isoWeekday(d) - 1];
}

export function fmtDateTime(ts: string | Date | null | undefined): string {
  if (!ts) return "—";
  const dt = typeof ts === "string" ? new Date(ts) : ts;
  return dt.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }) + " UTC";
}

export function monthStart(d: string): string {
  return `${d.slice(0, 7)}-01`;
}

export function monthEnd(d: string): string {
  const dt = parseISO(monthStart(d));
  dt.setUTCMonth(dt.getUTCMonth() + 1);
  dt.setUTCDate(0);
  return toISO(dt);
}

export function monthLabel(d: string): string {
  const dt = parseISO(d);
  return `${MONTHS[dt.getUTCMonth()]} '${String(dt.getUTCFullYear()).slice(2)}`;
}
