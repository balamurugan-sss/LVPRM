"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  AlertCircle, AlertTriangle, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Copy, Loader2, Lock, MessageSquareText, Save, Send, X,
} from "lucide-react";
import { api, ApiError } from "@/lib/client";
import { addDays, dayLabel, fmtDate, fmtDateTime, fmtShort, fmtWeek, weekDays, weekStart } from "@/lib/dates";
import { dailyTotals, lineTotal, validateGrid, weekTotal, type GridLine, type Settings, type ValidationIssue } from "@/lib/rules";
import type { TimesheetView } from "@/lib/timesheets";
import { cx, fmtH, StatusBadge } from "@/components/ui";

type ProjectOpt = { id: number; code: string; name: string; billable: boolean; color: string; allocation: number };
type HistoryItem = { id: number; action: string; actor_name: string; comment: string | null; version: number; total_hours: number; created_at: string };
type Row = GridLine & { key: string; showNotes?: boolean };

let keySeq = 0;
const newKey = () => `r${++keySeq}`;

export function TimesheetEditor(props: {
  initial: TimesheetView;
  today: string;
  projects: ProjectOpt[];
  settings: Settings;
  dailyHours: number;
  deadline: string;
  offDays: number[];
  holidays: { date: string; name: string }[];
  leaves: { date: string; hours: number; type: string }[];
  history: HistoryItem[];
}) {
  const { initial, projects, settings, dailyHours } = props;
  const router = useRouter();
  const ws = initial.weekStart;
  const days = weekDays(ws);
  const editable = initial.status === null || initial.status === "draft" || initial.status === "rejected";
  const hasWeekendData = initial.lines.some((l) => l.hours[5] > 0 || l.hours[6] > 0);
  const [showWeekend, setShowWeekend] = useState(hasWeekendData || settings.workingDays.some((d) => d > 5));
  const visibleDays = days.map((_, i) => i).filter((i) => showWeekend || i < 5);

  // One row per allocation: employees only enter hours (no project/task typing).
  const seedRows = (): Row[] => {
    const merged = new Map<number, Row>();
    for (const l of initial.lines) {
      const r = merged.get(l.projectId);
      if (r) {
        r.hours = r.hours.map((h, i) => Math.round((h + l.hours[i]) * 100) / 100);
        if (l.notes) r.notes = [r.notes, l.notes].filter(Boolean).join("; ");
      } else merged.set(l.projectId, { key: newKey(), projectId: l.projectId, task: "", notes: l.notes, billable: l.billable, hours: [...l.hours] });
    }
    if (editable) {
      for (const p of projects) {
        if (!merged.has(p.id)) merged.set(p.id, { key: newKey(), projectId: p.id, task: "", notes: "", billable: p.billable, hours: [0, 0, 0, 0, 0, 0, 0] });
      }
    }
    return [...merged.values()];
  };
  const [rows, setRows] = useState<Row[]>(seedRows);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<null | "save" | "submit" | "copy">(null);
  const [serverIssues, setServerIssues] = useState<ValidationIssue[]>([]);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [confirm, setConfirm] = useState(false);

  const offSet = useMemo(() => new Set(props.offDays), [props.offDays]);
  const totals = dailyTotals(rows);
  const total = weekTotal(rows);
  const expected = settings.workingDays.filter((d) => !offSet.has(d - 1)).length * dailyHours;
  const issues = useMemo(
    () => validateGrid(rows, settings, { mode: "submit", nonWorking: offSet, allowedProjectIds: new Set(projects.map((p) => p.id)), dailyHours }),
    [rows, settings, offSet, projects, dailyHours],
  );
  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");

  function update(key: string, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setDirty(true);
    setMessage(null);
  }
  function setHour(key: string, day: number, value: string) {
    const v = value === "" ? 0 : Number(value);
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, hours: r.hours.map((h, i) => (i === day ? (Number.isNaN(v) ? h : v) : h)) } : r)));
    setDirty(true);
    setMessage(null);
  }
  async function copyLastWeek() {
    setBusy("copy");
    try {
      const prev = await api<TimesheetView>(`/api/timesheets?week=${addDays(ws, -7)}`);
      if (!prev.lines.length) {
        setMessage({ tone: "bad", text: "Last week has no hours to copy." });
      } else {
        setRows(projects.map((p) => {
          const hours = [0, 0, 0, 0, 0, 0, 0];
          prev.lines.filter((l) => l.projectId === p.id).forEach((l) => l.hours.forEach((h, i) => { if (!offSet.has(i)) hours[i] = Math.round((hours[i] + h) * 100) / 100; }));
          return { key: newKey(), projectId: p.id, task: "", notes: "", billable: p.billable, hours };
        }));
        setDirty(true);
        setMessage({ tone: "ok", text: "Copied hours from last week. Review before submitting." });
      }
    } catch (e) {
      setMessage({ tone: "bad", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function persist(action: "save" | "submit") {
    setBusy(action);
    setServerIssues([]);
    try {
      await api("/api/timesheets", {
        method: "PUT",
        body: { week: ws, action, lines: rows.map(({ projectId, task, notes, billable, hours }) => ({ projectId, task, notes, billable, hours })) },
      });
      setDirty(false);
      setConfirm(false);
      setMessage({ tone: "ok", text: action === "save" ? "Draft saved." : "Timesheet submitted for approval. Your manager has been notified." });
      router.refresh();
    } catch (e) {
      const err = e as ApiError;
      const details = err.details as { issues?: ValidationIssue[] } | null;
      if (details?.issues) setServerIssues(details.issues.filter((i) => i.level === "error"));
      setMessage({ tone: "bad", text: err.message });
      setConfirm(false);
    } finally {
      setBusy(null);
    }
  }

  const go = (w: string) => {
    if (dirty && !window.confirm("You have unsaved changes. Leave this week without saving?")) return;
    router.push(`/timesheet?week=${w}`);
  };
  const isCurrentWeek = weekStart(props.today) === ws;
  const projectById = (id: number) => projects.find((p) => p.id === id);
  const holidayOn = (d: string) => props.holidays.find((h) => h.date === d);
  const leaveOn = (d: string) => props.leaves.find((l) => l.date === d);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">Weekly timesheet</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            <StatusBadge status={initial.status ?? "missing"} />
            <span>{fmtWeek(ws)}</span>
            <span className="text-subtle">·</span>
            <span>Due {fmtDate(props.deadline)}</span>
            {initial.version > 1 && <span className="chip bg-elev text-muted">v{initial.version}</span>}
            {dirty && <span className="chip bg-warn/15 text-warn">Unsaved changes</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-xl border hairline bg-card p-1">
            <button onClick={() => go(addDays(ws, -7))} className="btn-ghost h-8 w-8 px-0" aria-label="Previous week"><ChevronLeft className="h-4 w-4" /></button>
            <label className="relative flex items-center gap-2 px-2 text-sm">
              <CalendarDays className="h-4 w-4 text-accent" />
              <span className="tabular-nums">{fmtShort(ws)} – {fmtShort(days[6])}</span>
              <input type="date" aria-label="Pick a week" className="absolute inset-0 cursor-pointer opacity-0" value={ws} onChange={(e) => e.target.value && go(weekStart(e.target.value))} />
            </label>
            <button onClick={() => go(addDays(ws, 7))} className="btn-ghost h-8 w-8 px-0" aria-label="Next week"><ChevronRight className="h-4 w-4" /></button>
          </div>
          {!isCurrentWeek && <button onClick={() => go(weekStart(props.today))} className="btn-secondary py-2">This week</button>}
        </div>
      </div>

      {initial.status === "rejected" && initial.decisionComment && (
        <div className="flex gap-3 rounded-2xl border border-bad/30 bg-bad/10 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-bad" />
          <div>
            <div className="font-medium text-fg">Changes requested by {initial.decidedByName}</div>
            <p className="mt-0.5 text-muted">“{initial.decisionComment}”</p>
            <p className="mt-1 text-xs text-subtle">Update the entries below and resubmit. The original submission is kept in the history.</p>
          </div>
        </div>
      )}
      {initial.status === "draft" && initial.decisionComment && (
        <div className="flex gap-3 rounded-2xl border border-warn/30 bg-warn/10 p-4 text-sm"><AlertCircle className="h-5 w-5 text-warn" />{initial.decisionComment}</div>
      )}
      {!editable && (
        <div className="flex items-center gap-3 rounded-2xl border hairline bg-card p-4 text-sm text-muted">
          <Lock className="h-4 w-4 text-subtle" />
          {initial.status === "submitted"
            ? `Submitted ${fmtDateTime(initial.submittedAt)} — read-only while awaiting approval.`
            : `Approved by ${initial.decidedByName} on ${fmtDateTime(initial.decidedAt)}. Contact an administrator if a correction is required.`}
        </div>
      )}
      {message && (
        <div role="status" className={cx("flex items-center gap-2 rounded-2xl px-4 py-3 text-sm", message.tone === "ok" ? "bg-ok/10 text-ok" : "bg-bad/10 text-bad")}>
          {message.tone === "ok" ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}{message.text}
          <button className="ml-auto opacity-70 hover:opacity-100" onClick={() => setMessage(null)} aria-label="Dismiss"><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b hairline px-5 py-3">
            <div className="flex items-center gap-4 text-sm">
              <span className="font-semibold">Hours</span>
              <span className="text-muted">Expected <b className="text-fg tabular-nums">{expected}h</b></span>
              <span className="text-muted">Logged <b className={cx("tabular-nums", total >= expected ? "text-ok" : "text-warn")}>{fmtH(total)}h</b></span>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
              <input type="checkbox" className="accent-[rgb(var(--accent))]" checked={showWeekend} onChange={(e) => setShowWeekend(e.target.checked)} /> Show weekend
            </label>
          </div>

          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="text-xs text-subtle">
                  <th className="w-[26%] px-4 py-3 text-left font-medium uppercase tracking-wide">Allocation</th>
                  {visibleDays.map((i) => {
                    const d = days[i];
                    const hol = holidayOn(d);
                    const lv = leaveOn(d);
                    const isToday = d === props.today;
                    return (
                      <th key={i} className={cx("px-1 py-3 text-center font-medium", i >= 5 && "bg-elev/30")} title={hol?.name ?? (lv ? `${lv.type} leave (${lv.hours}h)` : undefined)}>
                        <div className={cx("uppercase tracking-wide", isToday && "text-accent")}>{dayLabel(d)}</div>
                        <div className={cx("text-[11px] tabular-nums", isToday ? "text-accent" : "text-subtle")}>{fmtShort(d)}</div>
                        {(hol || lv) && <div className="mt-0.5 truncate text-[10px] font-medium text-bad">{hol ? "Holiday" : "Leave"}</div>}
                      </th>
                    );
                  })}
                  <th className="px-3 py-3 text-right font-medium uppercase tracking-wide">Total</th>
                                  </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => {
                  const p = projectById(r.projectId);
                  const rowErr = [...errors, ...serverIssues].some((e) => e.line === idx);
                  return (
                    <tr key={r.key} className={cx("border-t hairline align-top", rowErr && "bg-bad/5")}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 pt-1.5">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p?.color ?? "rgb(var(--subtle))" }} />
                          <span className="whitespace-nowrap font-medium">{p?.code ?? "Allocation"}</span>
                          <span className={cx("chip py-0.5", r.billable ? "bg-accent/15 text-accent" : "bg-elev text-subtle")}>{r.billable ? "Billable" : "Internal"}</span>
                          {p && <span className="text-xs text-subtle">{p.allocation}%</span>}
                          <button type="button" title="Add a comment (optional)" onClick={() => update(r.key, { showNotes: !r.showNotes })} className={cx("btn-ghost ml-auto h-8 w-8 shrink-0 px-0", r.notes && "text-accent")}>
                            <MessageSquareText className="h-4 w-4" />
                          </button>
                        </div>
                        {r.showNotes && (
                          <textarea
                            aria-label={`Comment for row ${idx + 1}`}
                            className="input mt-2 min-h-[56px] py-1.5 text-xs"
                            placeholder="Comment (optional)"
                            maxLength={1000}
                            disabled={!editable}
                            value={r.notes}
                            onChange={(e) => update(r.key, { notes: e.target.value })}
                          />
                        )}
                      </td>
                      {visibleDays.map((i) => {
                        const cellErr = [...errors, ...serverIssues].some((e) => e.line === idx && e.day === i);
                        return (
                          <td key={i} className={cx("px-1 py-3", i >= 5 && "bg-elev/30")}>
                            <input
                              type="number"
                              inputMode="decimal"
                              min={0}
                              max={24}
                              step={0.25}
                              aria-label={`${dayLabel(days[i])} hours for row ${idx + 1}`}
                              disabled={!editable}
                              value={r.hours[i] === 0 ? "" : r.hours[i]}
                              placeholder="0"
                              onChange={(e) => setHour(r.key, i, e.target.value)}
                              className={cx(
                                "h-10 w-full min-w-[56px] rounded-xl border bg-elev/60 text-center text-sm tabular-nums text-fg placeholder:text-subtle/60 focus:outline-none focus:ring-2 focus:ring-accent/50 disabled:opacity-70",
                                cellErr ? "border-bad" : "hairline",
                                offSet.has(i) && "bg-bad/5",
                              )}
                            />
                          </td>
                        );
                      })}
                      <td className="px-3 py-3 text-right"><div className="pt-2 font-semibold tabular-nums">{fmtH(lineTotal(r))}</div></td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr className="border-t hairline"><td colSpan={visibleDays.length + 2} className="px-4 py-10 text-center text-sm text-muted">No allocations for this week. Ask your resource manager to assign you.</td></tr>
                )}
              </tbody>
              <tfoot>
                <tr className="border-t hairline bg-elev/30 text-sm">
                  <td className="px-4 py-3 font-semibold">Daily total</td>
                  {visibleDays.map((i) => {
                    const t = totals[i];
                    const working = settings.workingDays.includes(i + 1) && !offSet.has(i);
                    const tone = t > settings.maxDailyHours ? "text-bad" : working ? (t >= dailyHours ? "text-ok" : t > 0 ? "text-warn" : "text-subtle") : "text-muted";
                    return (
                      <td key={i} className={cx("px-1 py-3 text-center", i >= 5 && "bg-elev/30")}>
                        <span className={cx("font-semibold tabular-nums", tone)}>{fmtH(t)}</span>
                        {working && t < dailyHours && <div className="mx-auto mt-1 h-1 w-6 rounded-full bg-warn/60" title="Incomplete day" />}
                      </td>
                    );
                  })}
                  <td className="px-3 py-3 text-right text-base font-semibold tabular-nums text-accent">{fmtH(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {editable && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t hairline px-5 py-4">
              <div className="flex flex-wrap gap-2">
                <button onClick={copyLastWeek} className="btn-ghost" disabled={!!busy}>{busy === "copy" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />} Copy last week</button>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => persist("save")} className="btn-secondary" disabled={!!busy || errors.some((e) => !e.message.includes("at least one hour"))}>
                  {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save draft
                </button>
                <button onClick={() => setConfirm(true)} className="btn-primary" disabled={!!busy || errors.length > 0}>
                  <Send className="h-4 w-4" /> {initial.status === "rejected" ? "Resubmit" : "Submit for approval"}
                </button>
              </div>
            </div>
          )}
        </section>

        <aside className="space-y-5">
          <section className="card p-5">
            <h2 className="text-sm font-semibold">Checks</h2>
            {editable ? (
              issues.length === 0 && serverIssues.length === 0 ? (
                <p className="mt-3 flex items-center gap-2 text-sm text-ok"><CheckCircle2 className="h-4 w-4" />Ready to submit.</p>
              ) : (
                <ul className="mt-3 space-y-2 text-xs">
                  {[...serverIssues, ...errors].map((e, i) => <li key={`e${i}`} className="flex gap-2 text-bad"><AlertCircle className="h-4 w-4 shrink-0" />{e.message}</li>)}
                  {warnings.map((w, i) => <li key={`w${i}`} className="flex gap-2 text-warn"><AlertTriangle className="h-4 w-4 shrink-0" />{w.message}</li>)}
                </ul>
              )
            ) : <p className="mt-3 text-sm text-muted">Editing is locked for this week.</p>}
            <div className="mt-4 space-y-1 border-t hairline pt-3 text-xs text-subtle">
              <p>Standard day: {dailyHours}h · daily limit {settings.maxDailyHours}h · weekly limit {settings.maxWeeklyHours}h</p>
              <p>Use quarter-hour increments, e.g. 1.25, 1.5, 7.75.</p>
            </div>
          </section>

          <section className="card p-5">
            <h2 className="text-sm font-semibold">Approval history</h2>
            {props.history.length === 0 ? <p className="mt-3 text-sm text-muted">Not submitted yet.</p> : (
              <ol className="mt-3 space-y-3 border-l hairline pl-4">
                {props.history.map((h) => (
                  <li key={h.id} className="relative">
                    <span className={cx("absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full ring-4 ring-card",
                      h.action === "approved" ? "bg-ok" : h.action === "rejected" ? "bg-bad" : h.action === "reopened" ? "bg-warn" : "bg-info")} />
                    <div className="text-sm"><span className="font-medium capitalize">{h.action}</span> <span className="text-muted">by {h.actor_name}</span></div>
                    <div className="text-[11px] text-subtle">{fmtDateTime(h.created_at)} · v{h.version} · {fmtH(h.total_hours)}h</div>
                    {h.comment && <p className="mt-1 rounded-lg bg-elev/60 px-2 py-1 text-xs text-muted">{h.comment}</p>}
                  </li>
                ))}
              </ol>
            )}
          </section>
          <Link href="/history" className="btn-ghost w-full">View all my timesheets</Link>
        </aside>
      </div>

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <div className="card w-full max-w-md p-6">
            <h2 id="confirm-title" className="text-lg font-semibold">Submit timesheet?</h2>
            <p className="mt-1 text-sm text-muted">
              You are submitting <b className="text-fg">{fmtH(total)}h</b> for {fmtWeek(ws)}. It will be read-only until your manager reviews it.
            </p>
            {warnings.length > 0 && (
              <ul className="mt-4 space-y-1.5 rounded-xl bg-warn/10 p-3 text-xs text-warn">
                {warnings.map((w, i) => <li key={i} className="flex gap-2"><AlertTriangle className="h-4 w-4 shrink-0" />{w.message}</li>)}
              </ul>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setConfirm(false)} disabled={!!busy}>Cancel</button>
              <button className="btn-primary" onClick={() => persist("submit")} disabled={!!busy}>
                {busy === "submit" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Confirm & submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
