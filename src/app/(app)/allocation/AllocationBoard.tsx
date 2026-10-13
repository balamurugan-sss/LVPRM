"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { api } from "@/lib/client";
import { fmtDate, todayISO } from "@/lib/dates";
import type { Project } from "@/lib/data";
import { Avatar, cx, fmtH, Progress } from "@/components/ui";

export type AssignmentRow = {
  id: number; employee_id: number; employee: string; emp_code: string; title: string; project_id: number; code: string; project: string;
  color: string; billable: boolean; allocation_pct: number; weekly_hours: number | null; start_date: string; end_date: string | null;
};
type Opt = { id: number; name: string };

export function AllocationBoard({ isAdmin, assignments, employees, managers, projects }: {
  isAdmin: boolean; assignments: AssignmentRow[]; employees: Opt[]; managers: Opt[]; projects: Project[];
}) {
  const router = useRouter();
  const [view, setView] = useState<"people" | "projects">("people");
  const [form, setForm] = useState<null | { mode: "assign"; employeeId?: number } | { mode: "edit"; row: AssignmentRow } | { mode: "project"; project?: Project }>(null);
  const [error, setError] = useState<string | null>(null);

  const byEmployee = new Map<number, AssignmentRow[]>();
  assignments.forEach((a) => byEmployee.set(a.employee_id, [...(byEmployee.get(a.employee_id) ?? []), a]));
  const people = [...byEmployee.entries()].map(([id, rows]) => ({ id, rows, total: rows.reduce((s, r) => s + r.allocation_pct, 0) }));
  const unassigned = employees.filter((e) => !byEmployee.has(e.id));

  async function remove(row: AssignmentRow) {
    if (!window.confirm(`Remove ${row.employee} from ${row.code}?`)) return;
    try {
      await api(`/api/admin/assignments?id=${row.id}`, { method: "DELETE" });
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-xl border hairline bg-card p-1">
          {(["people", "projects"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className={cx("rounded-lg px-4 py-1.5 text-sm font-medium capitalize", view === v ? "bg-accent text-white" : "text-muted hover:text-fg")}>By {v}</button>
          ))}
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => setForm({ mode: "project" })}><Plus className="h-4 w-4" />New project</button>
            <button className="btn-primary" onClick={() => setForm({ mode: "assign" })}><Plus className="h-4 w-4" />Assign resource</button>
          </div>
        )}
      </div>
      {error && <p role="alert" className="rounded-xl bg-bad/10 px-4 py-2 text-sm text-bad">{error}</p>}

      {view === "people" ? (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {people.map((p) => (
            <section key={p.id} className="card p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Avatar name={p.rows[0].employee} size={38} />
                  <div><div className="font-medium">{p.rows[0].employee}</div><div className="text-xs text-subtle">{p.rows[0].emp_code} · {p.rows[0].title}</div></div>
                </div>
                <div className="text-right">
                  <div className={cx("text-lg font-semibold tabular-nums", p.total > 100 ? "text-bad" : p.total < 100 ? "text-warn" : "text-ok")}>{p.total}%</div>
                  <div className="text-[11px] text-subtle">allocated</div>
                </div>
              </div>
              <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-elev">
                {p.rows.map((r) => <div key={r.id} style={{ width: `${Math.min(100, r.allocation_pct)}%`, background: r.color }} title={`${r.code} ${r.allocation_pct}%`} />)}
              </div>
              {p.total > 100 && <p className="mt-2 flex items-center gap-1.5 text-xs text-bad"><AlertTriangle className="h-3.5 w-3.5" />Over-allocated</p>}
              <ul className="mt-4 space-y-2">
                {p.rows.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 rounded-xl bg-elev/40 px-3 py-2">
                    <i className="h-2.5 w-2.5 rounded-full" style={{ background: r.color }} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">{r.code} <span className="text-muted">· {r.project}</span></div>
                      <div className="text-[11px] text-subtle">{fmtH(r.weekly_hours ?? 0)}h/week · from {fmtDate(r.start_date)}{r.end_date ? ` to ${fmtDate(r.end_date)}` : ""} · {r.billable ? "Billable" : "Non-billable"}</div>
                    </div>
                    <span className="text-sm font-semibold tabular-nums">{r.allocation_pct}%</span>
                    {isAdmin && (
                      <>
                        <button className="btn-ghost h-8 w-8 px-0" aria-label={`Edit ${r.code} allocation`} onClick={() => setForm({ mode: "edit", row: r })}><Pencil className="h-3.5 w-3.5" /></button>
                        <button className="btn-ghost h-8 w-8 px-0 hover:text-bad" aria-label={`Remove from ${r.code}`} onClick={() => remove(r)}><Trash2 className="h-3.5 w-3.5" /></button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
              {isAdmin && <button className="btn-ghost mt-3 w-full text-xs" onClick={() => setForm({ mode: "assign", employeeId: p.id })}><Plus className="h-3.5 w-3.5" />Add project</button>}
            </section>
          ))}
          {isAdmin && unassigned.length > 0 && (
            <section className="card border-dashed p-5">
              <div className="font-medium">Unassigned ({unassigned.length})</div>
              <p className="text-xs text-muted">Available for allocation</p>
              <ul className="mt-3 space-y-2">
                {unassigned.map((u) => (
                  <li key={u.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2"><Avatar name={u.name} size={24} />{u.name}</span>
                    <button className="btn-ghost py-1 text-xs" onClick={() => setForm({ mode: "assign", employeeId: u.id })}>Assign</button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {projects.map((p) => {
            const team = assignments.filter((a) => a.project_id === p.id);
            const weekly = team.reduce((s, a) => s + (a.weekly_hours ?? 0), 0);
            return (
              <section key={p.id} className="card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl text-xs font-bold text-[#0b0c10]" style={{ background: p.color }}>{p.code.slice(0, 3)}</span>
                    <div><div className="font-medium">{p.name}</div><div className="text-xs text-subtle">{p.code} · {p.client}</div></div>
                  </div>
                  <span className={cx("chip", p.status === "active" ? "bg-ok/15 text-ok" : p.status === "on_hold" ? "bg-warn/15 text-warn" : "bg-elev text-muted")}>{p.status.replace("_", " ")}</span>
                </div>
                <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
                  <div><dt className="text-subtle">Manager</dt><dd className="truncate font-medium">{p.manager_name ?? "—"}</dd></div>
                  <div><dt className="text-subtle">Timeline</dt><dd className="font-medium">{fmtDate(p.start_date).slice(0, -5)} – {p.end_date ? fmtDate(p.end_date).slice(0, -5) : "ongoing"}</dd></div>
                  <div><dt className="text-subtle">Planned</dt><dd className="font-medium">{fmtH(weekly)}h/wk</dd></div>
                </dl>
                <div className="mt-4 space-y-2">
                  {team.map((a) => (
                    <div key={a.id} className="flex items-center gap-2 text-sm">
                      <Avatar name={a.employee} size={24} />
                      <span className="flex-1 truncate">{a.employee}</span>
                      <span className="w-24"><Progress value={a.allocation_pct} tone={p.color} /></span>
                      <span className="w-10 text-right text-xs tabular-nums text-muted">{a.allocation_pct}%</span>
                    </div>
                  ))}
                  {team.length === 0 && <p className="text-xs text-subtle">No one assigned{isAdmin ? "" : " in your scope"}.</p>}
                </div>
                {isAdmin && <button className="btn-ghost mt-3 w-full text-xs" onClick={() => setForm({ mode: "project", project: p })}><Pencil className="h-3.5 w-3.5" />Edit project</button>}
              </section>
            );
          })}
        </div>
      )}

      {form && (
        <Modal onClose={() => setForm(null)} title={form.mode === "assign" ? "Assign resource" : form.mode === "edit" ? `Edit allocation · ${form.row.employee} on ${form.row.code}` : form.project ? `Edit ${form.project.code}` : "New project"}>
          {form.mode === "project"
            ? <ProjectForm project={form.project} managers={managers} onDone={() => { setForm(null); router.refresh(); }} />
            : <AssignForm form={form} employees={employees} projects={projects.filter((p) => p.status !== "closed")} onDone={() => { setForm(null); router.refresh(); }} />}
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="card max-h-[90vh] w-full max-w-lg overflow-y-auto p-6">
        <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">{title}</h2><button className="btn-ghost h-8 w-8 px-0" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></button></div>
        {children}
      </div>
    </div>
  );
}

function AssignForm({ form, employees, projects, onDone }: {
  form: { mode: "assign"; employeeId?: number } | { mode: "edit"; row: AssignmentRow }; employees: Opt[]; projects: Project[]; onDone: () => void;
}) {
  const edit = form.mode === "edit" ? form.row : null;
  const [employeeId, setEmployeeId] = useState<number>(edit?.employee_id ?? (form.mode === "assign" ? form.employeeId ?? 0 : 0));
  const [projectId, setProjectId] = useState<number>(edit?.project_id ?? 0);
  const [pct, setPct] = useState<number>(edit?.allocation_pct ?? 100);
  const [start, setStart] = useState(edit?.start_date ?? todayISO());
  const [end, setEnd] = useState(edit?.end_date ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (edit) await api("/api/admin/assignments", { method: "PATCH", body: { id: edit.id, allocationPct: pct, endDate: end || null } });
      else await api("/api/admin/assignments", { body: { employeeId, projectId, allocationPct: pct, startDate: start, endDate: end || null } });
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      {!edit && (
        <>
          <div><label className="label">Employee</label>
            <select required className="input" value={employeeId || ""} onChange={(e) => setEmployeeId(Number(e.target.value))}>
              <option value="">Select…</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select></div>
          <div><label className="label">Project</label>
            <select required className="input" value={projectId || ""} onChange={(e) => setProjectId(Number(e.target.value))}>
              <option value="">Select…</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
            </select></div>
        </>
      )}
      <div><label className="label">Allocation: {pct}%</label><input type="range" min={5} max={100} step={5} value={pct} onChange={(e) => setPct(Number(e.target.value))} className="w-full accent-[rgb(var(--accent))]" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Start date</label><input type="date" className="input" value={start} disabled={!!edit} onChange={(e) => setStart(e.target.value)} /></div>
        <div><label className="label">End date (optional)</label><input type="date" className="input" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
      </div>
      {error && <p role="alert" className="rounded-xl bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
      <div className="flex justify-end gap-2"><button className="btn-primary" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{edit ? "Save" : "Assign"}</button></div>
    </form>
  );
}

function ProjectForm({ project, managers, onDone }: { project?: Project; managers: Opt[]; onDone: () => void }) {
  const [v, setV] = useState({
    code: project?.code ?? "", name: project?.name ?? "", client: project?.client ?? "", billable: project?.billable ?? true,
    managerId: project?.manager_id ?? 0, startDate: project?.start_date ?? todayISO(), endDate: project?.end_date ?? "",
    plannedHours: project?.planned_hours ?? 0, status: project?.status ?? "active", color: project?.color ?? "#38bdf8",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<typeof v>) => setV((s) => ({ ...s, ...patch }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = { ...v, managerId: v.managerId || null, endDate: v.endDate || null, plannedHours: Number(v.plannedHours) };
      if (project) await api("/api/admin/projects", { method: "PATCH", body: { ...body, id: project.id } });
      else await api("/api/admin/projects", { body });
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="grid grid-cols-2 gap-3">
      <div><label className="label">Code</label><input required className="input" disabled={!!project} value={v.code} onChange={(e) => set({ code: e.target.value.toUpperCase() })} placeholder="ABC-PROJ" /></div>
      <div><label className="label">Client</label><input className="input" value={v.client} onChange={(e) => set({ client: e.target.value })} placeholder="Internal" /></div>
      <div className="col-span-2"><label className="label">Name</label><input required className="input" value={v.name} onChange={(e) => set({ name: e.target.value })} /></div>
      <div><label className="label">Manager</label>
        <select className="input" value={v.managerId || ""} onChange={(e) => set({ managerId: Number(e.target.value) })}>
          <option value="">—</option>{managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select></div>
      <div><label className="label">Status</label>
        <select className="input" value={v.status} onChange={(e) => set({ status: e.target.value })}>
          <option value="active">Active</option><option value="on_hold">On hold</option><option value="closed">Closed</option>
        </select></div>
      <div><label className="label">Start date</label><input type="date" required className="input" value={v.startDate} onChange={(e) => set({ startDate: e.target.value })} /></div>
      <div><label className="label">End date</label><input type="date" className="input" value={v.endDate} onChange={(e) => set({ endDate: e.target.value })} /></div>
      <div><label className="label">Budget (planned hours)</label><input type="number" min={0} className="input" value={v.plannedHours} onChange={(e) => set({ plannedHours: Number(e.target.value) })} /></div>
      <div><label className="label">Colour</label><input type="color" className="input h-10 p-1" value={v.color} onChange={(e) => set({ color: e.target.value })} /></div>
      <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" className="accent-[rgb(var(--accent))]" checked={v.billable} onChange={(e) => set({ billable: e.target.checked })} />Billable project</label>
      {error && <p role="alert" className="col-span-2 rounded-xl bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
      <div className="col-span-2 flex justify-end"><button className="btn-primary" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{project ? "Save project" : "Create project"}</button></div>
    </form>
  );
}
