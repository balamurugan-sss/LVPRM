"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Pencil, UserPlus, X } from "lucide-react";
import { api } from "@/lib/client";

type Opt = { id: number; name: string };
type Emp = { id: number; emp_code: string; name: string; email: string; role: string; title: string; department_id: number | null; manager_id: number | null; location: string; active: boolean; daily_hours: number | null };

export function EmployeeAdmin({ departments, managers, employee }: { departments: Opt[]; managers: Opt[]; employee?: Emp }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({
    empCode: employee?.emp_code ?? "", name: employee?.name ?? "", email: employee?.email ?? "", role: employee?.role ?? "employee",
    title: employee?.title ?? "", departmentId: employee?.department_id ?? 0, managerId: employee?.manager_id ?? 0,
    location: employee?.location ?? "", active: employee?.active ?? true, dailyHours: employee?.daily_hours ?? "", password: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (p: Partial<typeof v>) => setV((s) => ({ ...s, ...p }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = { ...v, departmentId: v.departmentId || null, managerId: v.managerId || null, dailyHours: v.dailyHours === "" ? null : Number(v.dailyHours) };
    try {
      if (employee) await api("/api/admin/employees", { method: "PATCH", body: { ...body, id: employee.id, password: undefined, empCode: undefined } });
      else await api("/api/admin/employees", { body });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {employee
        ? <button className="btn-ghost w-full py-1.5 text-xs" onClick={() => setOpen(true)}><Pencil className="h-3.5 w-3.5" />Edit profile</button>
        : <button className="btn-primary" onClick={() => setOpen(true)}><UserPlus className="h-4 w-4" />Add employee</button>}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
          <form onSubmit={submit} className="card grid max-h-[90vh] w-full max-w-lg grid-cols-2 gap-3 overflow-y-auto p-6">
            <div className="col-span-2 flex items-center justify-between"><h2 className="text-lg font-semibold">{employee ? `Edit ${employee.name}` : "New employee"}</h2>
              <button type="button" className="btn-ghost h-8 w-8 px-0" onClick={() => setOpen(false)} aria-label="Close"><X className="h-4 w-4" /></button></div>
            <div><label className="label">Employee ID</label><input required={!employee} disabled={!!employee} className="input" value={v.empCode} onChange={(e) => set({ empCode: e.target.value.toUpperCase() })} /></div>
            <div><label className="label">Role</label><select className="input" value={v.role} onChange={(e) => set({ role: e.target.value })}><option value="employee">Employee</option><option value="manager">Manager</option><option value="admin">Admin</option></select></div>
            <div className="col-span-2"><label className="label">Full name</label><input required className="input" value={v.name} onChange={(e) => set({ name: e.target.value })} /></div>
            <div className="col-span-2"><label className="label">Work email</label><input required type="email" className="input" value={v.email} onChange={(e) => set({ email: e.target.value })} /></div>
            <div><label className="label">Title</label><input className="input" value={v.title} onChange={(e) => set({ title: e.target.value })} /></div>
            <div><label className="label">Location</label><input className="input" value={v.location} onChange={(e) => set({ location: e.target.value })} /></div>
            <div><label className="label">Department</label><select className="input" value={v.departmentId || ""} onChange={(e) => set({ departmentId: Number(e.target.value) })}><option value="">—</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
            <div><label className="label">Reporting manager</label><select className="input" value={v.managerId || ""} onChange={(e) => set({ managerId: Number(e.target.value) })}><option value="">—</option>{managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
            <div><label className="label">Daily hours override</label><input type="number" step={0.5} min={1} max={12} className="input" placeholder="Org default" value={v.dailyHours} onChange={(e) => set({ dailyHours: e.target.value })} /></div>
            {!employee
              ? <div><label className="label">Initial password</label><input required minLength={8} type="password" className="input" value={v.password} onChange={(e) => set({ password: e.target.value })} /></div>
              : <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" className="accent-[rgb(var(--accent))]" checked={v.active} onChange={(e) => set({ active: e.target.checked })} />Active</label>}
            {error && <p role="alert" className="col-span-2 rounded-xl bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
            <div className="col-span-2 flex justify-end"><button className="btn-primary" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Save</button></div>
          </form>
        </div>
      )}
    </>
  );
}
