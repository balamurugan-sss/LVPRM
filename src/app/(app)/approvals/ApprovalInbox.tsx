"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowDownUp, Check, CheckCheck, CheckCircle2, Download, Filter, Inbox, Loader2, X } from "lucide-react";
import { api } from "@/lib/client";
import { addDays, dayLabel, fmtDateTime, fmtShort, fmtWeek, weekDays } from "@/lib/dates";
import { dailyTotals, lineTotal } from "@/lib/rules";
import type { TimesheetView } from "@/lib/timesheets";
import { Avatar, cx, Empty, fmtH, StatusBadge } from "@/components/ui";

export type InboxRow = {
  id: number; employee_id: number; employee: string; emp_code: string; department: string | null; week_start: string;
  status: string; submitted_at: string | null; decided_at: string | null; approver: string | null; decision_comment: string | null;
  version: number; total: number; billable: number; projects: string[];
};
type Opt = { id: number; name: string };
type Recent = { id: number; action: string; actor: string; employee: string; week_start: string; comment: string | null; created_at: string; total_hours: number; timesheet_id: number };
type Detail = TimesheetView & { history: { id: number; action: string; actor_name: string; comment: string | null; version: number; total_hours: number; created_at: string }[] };
type SortKey = "submitted_at" | "employee" | "week_start" | "total";

export function ApprovalInbox(props: {
  rows: InboxRow[];
  filters: { status: string; from: string; to: string; employee: number | null; project: number | null; dept: number | null };
  people: Opt[]; projects: Opt[]; departments: Opt[]; recent: Recent[]; openId: number | null; today: string; deadlineDays: number;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [modal, setModal] = useState<null | { decision: "approve" | "reject"; ids: number[] }>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [openId, setOpenId] = useState<number | null>(props.openId);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "submitted_at", dir: 1 });
  const f = props.filters;

  const rows = useMemo(() => {
    const out = [...props.rows];
    out.sort((a, b) => {
      const av = a[sort.key] ?? "";
      const bv = b[sort.key] ?? "";
      return (av < bv ? -1 : av > bv ? 1 : 0) * sort.dir;
    });
    return out;
  }, [props.rows, sort]);
  const pending = rows.filter((r) => r.status === "submitted");
  const allSelected = pending.length > 0 && pending.every((r) => selected.has(r.id));

  useEffect(() => {
    if (!openId) return setDetail(null);
    let cancel = false;
    api<Detail>(`/api/timesheets/${openId}`).then((d) => !cancel && setDetail(d)).catch(() => !cancel && setDetail(null));
    return () => { cancel = true; };
  }, [openId]);

  function setFilter(patch: Record<string, string | number | null>) {
    const q = new URLSearchParams();
    const merged = { ...f, ...patch };
    Object.entries(merged).forEach(([k, v]) => v !== null && v !== "" && q.set(k, String(v)));
    router.push(`/approvals?${q.toString()}`);
  }

  async function decide() {
    if (!modal) return;
    setBusy(true);
    try {
      const res = await api<{ results: { id: number; ok: boolean; error?: string }[] }>("/api/approvals", {
        body: { ids: modal.ids, decision: modal.decision, comment },
      });
      const ok = res.results.filter((r) => r.ok).length;
      const failed = res.results.filter((r) => !r.ok);
      setFlash({
        tone: failed.length ? "bad" : "ok",
        text: `${ok} timesheet${ok === 1 ? "" : "s"} ${modal.decision === "approve" ? "approved" : "returned for changes"}.` + (failed.length ? ` ${failed.length} skipped: ${failed[0].error}` : ""),
      });
      setSelected(new Set());
      setModal(null);
      setComment("");
      setOpenId(null);
      router.refresh();
    } catch (e) {
      setFlash({ tone: "bad", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const sortBtn = (key: SortKey, label: string, cls = "") => (
    <button className={cx("inline-flex items-center gap-1 uppercase tracking-wide hover:text-fg", cls)} onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))}>
      {label}<ArrowDownUp className={cx("h-3 w-3", sort.key === key ? "text-accent" : "opacity-40")} />
    </button>
  );
  const ageDays = (r: InboxRow) => Math.floor((Date.parse(props.today) - Date.parse(r.submitted_at ?? props.today)) / 86400000);
  const exportHref = `/api/export?type=timesheets&from=${f.from}&to=${addDays(f.to, 6)}${f.status !== "all" ? `&status=${f.status}` : ""}`;

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div className="flex items-center gap-2 self-center text-sm font-medium text-muted"><Filter className="h-4 w-4 text-accent" />Filters</div>
        <div className="flex rounded-xl border hairline bg-elev/40 p-1">
          {["submitted", "approved", "rejected", "all"].map((s) => (
            <button key={s} onClick={() => setFilter({ status: s })} className={cx("rounded-lg px-3 py-1.5 text-xs font-medium capitalize", f.status === s ? "bg-accent text-white" : "text-muted hover:text-fg")}>
              {s === "submitted" ? "Pending" : s === "rejected" ? "Returned" : s}
            </button>
          ))}
        </div>
        <Select label="Employee" value={f.employee} options={props.people} onChange={(v) => setFilter({ employee: v })} />
        <Select label="Project" value={f.project} options={props.projects} onChange={(v) => setFilter({ project: v })} />
        <Select label="Department" value={f.dept} options={props.departments} onChange={(v) => setFilter({ dept: v })} />
        <div><label className="label">Week from</label><input type="date" className="input py-1.5" value={f.from} onChange={(e) => setFilter({ from: e.target.value })} /></div>
        <div><label className="label">to</label><input type="date" className="input py-1.5" value={f.to} onChange={(e) => setFilter({ to: e.target.value })} /></div>
        <Link href="/approvals" className="btn-ghost py-1.5 text-xs">Reset</Link>
        <a href={exportHref} className="btn-secondary ml-auto py-1.5 text-xs"><Download className="h-4 w-4" />Export</a>
      </div>

      {flash && (
        <div role="status" className={cx("flex items-center gap-2 rounded-2xl px-4 py-3 text-sm", flash.tone === "ok" ? "bg-ok/10 text-ok" : "bg-bad/10 text-bad")}>
          {flash.tone === "ok" ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}{flash.text}
          <button className="ml-auto" onClick={() => setFlash(null)} aria-label="Dismiss"><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b hairline px-5 py-3">
            <div className="text-sm"><span className="font-semibold">{rows.length}</span> <span className="text-muted">timesheets · {pending.length} pending</span></div>
            <div className={cx("flex items-center gap-2 transition", selected.size ? "opacity-100" : "pointer-events-none opacity-40")}>
              <span className="text-xs text-muted">{selected.size} selected</span>
              <button className="btn-ok py-1.5 text-xs" onClick={() => setModal({ decision: "approve", ids: [...selected] })}><Check className="h-4 w-4" />Approve</button>
              <button className="btn-danger py-1.5 text-xs" onClick={() => setModal({ decision: "reject", ids: [...selected] })}><X className="h-4 w-4" />Request changes</button>
            </div>
          </div>
          {rows.length === 0 ? (
            <Empty title={f.status === "submitted" ? "Inbox zero — nothing awaiting approval" : "No timesheets match these filters"} icon={<Inbox className="h-6 w-6" />} />
          ) : (
            <div className="scrollbar-thin overflow-x-auto">
              <table className="table-base min-w-[1040px]">
                <thead>
                  <tr>
                    <th className="w-10">
                      <input type="checkbox" aria-label="Select all pending" className="accent-[rgb(var(--accent))]" checked={allSelected} disabled={!pending.length}
                        onChange={(e) => setSelected(e.target.checked ? new Set(pending.map((r) => r.id)) : new Set())} />
                    </th>
                    <th>{sortBtn("employee", "Employee")}</th>
                    <th>{sortBtn("week_start", "Week")}</th>
                    <th>Projects</th>
                    <th className="text-right">{sortBtn("total", "Hours", "justify-end")}</th>
                    <th>{sortBtn("submitted_at", "Submitted")}</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const age = ageDays(r);
                    return (
                      <tr key={r.id} className={cx("cursor-pointer", openId === r.id && "bg-accent/5")} onClick={() => setOpenId(r.id)}>
                        <td onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" aria-label={`Select ${r.employee} ${r.week_start}`} className="accent-[rgb(var(--accent))]" disabled={r.status !== "submitted"} checked={selected.has(r.id)}
                            onChange={(e) => setSelected((s) => { const n = new Set(s); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n; })} />
                        </td>
                        <td>
                          <div className="flex items-center gap-3">
                            <Avatar name={r.employee} size={32} />
                            <div className="whitespace-nowrap"><div className="font-medium">{r.employee}</div><div className="text-xs text-subtle">{r.emp_code} · {r.department}</div></div>
                          </div>
                        </td>
                        <td className="whitespace-nowrap">{fmtWeek(r.week_start)}{r.version > 1 && <span className="ml-1.5 chip bg-elev text-muted">v{r.version}</span>}</td>
                        <td><div className="flex flex-wrap gap-1">{r.projects.map((p) => <span key={p} className="chip whitespace-nowrap bg-elev text-muted">{p}</span>)}</div></td>
                        <td className="text-right tabular-nums"><div className="font-semibold">{fmtH(r.total)}h</div><div className="text-xs text-subtle">{fmtH(r.billable)}h billable</div></td>
                        <td className="whitespace-nowrap text-xs text-muted">
                          {fmtDateTime(r.submitted_at)}
                          {r.status === "submitted" && age > props.deadlineDays && <div className="text-warn">Waiting {age} days</div>}
                        </td>
                        <td><StatusBadge status={r.status} /></td>
                        <td className="text-right" onClick={(e) => e.stopPropagation()}>
                          {r.status === "submitted" && (
                            <div className="flex justify-end gap-1">
                              <button title="Approve" aria-label={`Approve ${r.employee}`} className="btn-ok h-8 w-8 px-0" onClick={() => setModal({ decision: "approve", ids: [r.id] })}><Check className="h-4 w-4" /></button>
                              <button title="Request changes" aria-label={`Reject ${r.employee}`} className="btn-danger h-8 w-8 px-0" onClick={() => setModal({ decision: "reject", ids: [r.id] })}><X className="h-4 w-4" /></button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="card p-5">
          <h2 className="text-sm font-semibold">Recent decisions</h2>
          <p className="text-xs text-muted">Audit trail for your team</p>
          <ol className="mt-4 space-y-3">
            {props.recent.map((r) => (
              <li key={r.id} className="flex gap-3">
                <span className={cx("mt-1 h-2 w-2 shrink-0 rounded-full", r.action === "approved" ? "bg-ok" : r.action === "rejected" ? "bg-bad" : r.action === "reopened" ? "bg-warn" : "bg-info")} />
                <div className="min-w-0 text-xs">
                  <div className="text-sm"><b className="font-medium">{r.actor}</b> <span className="text-muted">{r.action}</span> {r.action === "submitted" ? "" : <>{r.employee}&apos;s</>} <span className="text-muted">week of {fmtShort(r.week_start)}</span></div>
                  <div className="text-subtle">{fmtDateTime(r.created_at)} · {fmtH(r.total_hours)}h</div>
                  {r.comment && <div className="mt-0.5 truncate text-muted" title={r.comment}>“{r.comment}”</div>}
                </div>
              </li>
            ))}
            {props.recent.length === 0 && <li className="text-sm text-muted">No activity yet.</li>}
          </ol>
        </aside>
      </div>

      {/* Detail drawer */}
      {openId && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/50" onClick={() => setOpenId(null)} role="dialog" aria-modal="true" aria-label="Timesheet detail">
          <div className="scrollbar-thin h-full w-full max-w-3xl overflow-y-auto border-l hairline bg-panel p-6" onClick={(e) => e.stopPropagation()}>
            {!detail ? <div className="flex h-40 items-center justify-center text-muted"><Loader2 className="h-5 w-5 animate-spin" /></div> : (
              <DetailView detail={detail} onClose={() => setOpenId(null)} onDecide={(decision) => setModal({ decision, ids: [detail.id!] })} />
            )}
          </div>
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="decide-title">
          <div className="card w-full max-w-md p-6">
            <h2 id="decide-title" className="text-lg font-semibold">
              {modal.decision === "approve" ? `Approve ${modal.ids.length} timesheet${modal.ids.length > 1 ? "s" : ""}?` : `Request changes on ${modal.ids.length} timesheet${modal.ids.length > 1 ? "s" : ""}`}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {modal.decision === "approve" ? "Approved hours count towards utilization reports immediately." : "The employee will be notified and can edit and resubmit. A reason is required."}
            </p>
            <label className="label mt-4" htmlFor="decision-comment">{modal.decision === "approve" ? "Comment (optional)" : "Reason (required)"}</label>
            <textarea id="decision-comment" className="input min-h-[96px]" maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)}
              placeholder={modal.decision === "approve" ? "Looks good, thanks!" : "e.g. Wednesday hours should be split between the two tasks."} />
            <div className="mt-6 flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => { setModal(null); setComment(""); }} disabled={busy}>Cancel</button>
              <button className={modal.decision === "approve" ? "btn-primary" : "btn bg-bad text-white hover:brightness-110"} onClick={decide} disabled={busy || (modal.decision === "reject" && comment.trim().length < 3)}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : modal.decision === "approve" ? <CheckCheck className="h-4 w-4" /> : <X className="h-4 w-4" />}
                {modal.decision === "approve" ? "Approve" : "Send back"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Select({ label, value, options, onChange }: { label: string; value: number | null; options: Opt[]; onChange: (v: number | null) => void }) {
  return (
    <div className="min-w-[150px]">
      <label className="label">{label}</label>
      <select className="input py-1.5" value={value ?? ""} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
        <option value="">All</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </div>
  );
}

function DetailView({ detail, onClose, onDecide }: { detail: Detail; onClose: () => void; onDecide: (d: "approve" | "reject") => void }) {
  const days = weekDays(detail.weekStart);
  const totals = dailyTotals(detail.lines);
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar name={detail.employeeName} size={44} />
          <div>
            <h2 className="text-lg font-semibold">{detail.employeeName}</h2>
            <p className="flex items-center gap-2 text-sm text-muted"><StatusBadge status={detail.status} />{fmtWeek(detail.weekStart)} · v{detail.version} · #{detail.id}</p>
          </div>
        </div>
        <button onClick={onClose} className="btn-ghost h-9 w-9 px-0" aria-label="Close"><X className="h-5 w-5" /></button>
      </div>

      <div className="scrollbar-thin overflow-x-auto rounded-2xl border hairline">
        <table className="w-full min-w-[640px] text-sm">
          <thead><tr className="bg-elev/40 text-xs text-subtle">
            <th className="px-3 py-2 text-left font-medium">Allocation</th>
            {days.map((d) => <th key={d} className="px-2 py-2 text-center font-medium">{dayLabel(d)}<div className="text-[10px]">{fmtShort(d)}</div></th>)}
            <th className="px-3 py-2 text-right font-medium">Total</th>
          </tr></thead>
          <tbody>
            {detail.lines.map((l, i) => (
              <tr key={i} className="border-t hairline align-top">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2 font-medium"><i className="h-2 w-2 rounded-full" style={{ background: l.color }} />{l.projectCode}
                    <span className={cx("chip py-0", l.billable ? "bg-accent/15 text-accent" : "bg-elev text-subtle")}>{l.billable ? "Billable" : "Non-billable"}</span></div>
                  {l.notes && <div className="mt-1 rounded-lg bg-elev/60 px-2 py-1 text-xs text-muted">{l.notes}</div>}
                </td>
                {l.hours.map((h, d) => <td key={d} className={cx("px-2 py-2 text-center tabular-nums", h === 0 && "text-subtle")}>{h ? fmtH(h) : "–"}</td>)}
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmtH(lineTotal(l))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr className="border-t hairline bg-elev/30 font-semibold">
            <td className="px-3 py-2">Daily total</td>
            {totals.map((t, i) => <td key={i} className="px-2 py-2 text-center tabular-nums">{fmtH(t)}</td>)}
            <td className="px-3 py-2 text-right tabular-nums text-accent">{fmtH(detail.total)}</td>
          </tr></tfoot>
        </table>
      </div>

      {detail.status === "submitted" && (
        <div className="flex justify-end gap-2">
          <button className="btn-danger" onClick={() => onDecide("reject")}><X className="h-4 w-4" />Request changes</button>
          <button className="btn-primary" onClick={() => onDecide("approve")}><CheckCheck className="h-4 w-4" />Approve</button>
        </div>
      )}

      <div>
        <h3 className="mb-3 text-sm font-semibold">History</h3>
        <ol className="space-y-3 border-l hairline pl-4">
          {detail.history.map((h) => (
            <li key={h.id} className="relative text-sm">
              <span className={cx("absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-panel", h.action === "approved" ? "bg-ok" : h.action === "rejected" ? "bg-bad" : h.action === "reopened" ? "bg-warn" : "bg-info")} />
              <span className="font-medium capitalize">{h.action}</span> <span className="text-muted">by {h.actor_name} · {fmtDateTime(h.created_at)} · v{h.version} · {fmtH(h.total_hours)}h</span>
              {h.comment && <p className="mt-1 rounded-lg bg-elev/60 px-2 py-1 text-xs text-muted">{h.comment}</p>}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
