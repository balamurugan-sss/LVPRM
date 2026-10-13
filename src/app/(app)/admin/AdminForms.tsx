"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, Loader2, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/client";
import { DAY_NAMES, type Settings } from "@/lib/rules";
import { cx } from "@/components/ui";

function Status({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return <p role="status" className={cx("rounded-xl px-3 py-2 text-sm", msg.ok ? "bg-ok/10 text-ok" : "bg-bad/10 text-bad")}>{msg.ok && <CheckCircle2 className="mr-1 inline h-4 w-4" />}{msg.text}</p>;
}

export function SettingsForm({ settings }: { settings: Settings }) {
  const router = useRouter();
  const [v, setV] = useState(settings);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (p: Partial<Settings>) => setV((s) => ({ ...s, ...p }));
  const num = (k: keyof Settings, label: string, step = 0.5, hint?: string) => (
    <div><label className="label">{label}</label><input type="number" step={step} className="input" value={v[k] as number} onChange={(e) => set({ [k]: Number(e.target.value) } as Partial<Settings>)} />{hint && <p className="mt-1 text-[11px] text-subtle">{hint}</p>}</div>
  );
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/admin/settings", { method: "PUT", body: v });
      setMsg({ ok: true, text: "Settings saved." });
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        {num("standardDailyHours", "Standard daily hours")}
        {num("maxDailyHours", "Max hours / day")}
        {num("maxWeeklyHours", "Max hours / week", 1)}
        {num("submissionDeadlineDays", "Deadline (days after week)", 1, "Weeks become overdue after this")}
        {num("utilizationTarget", "Utilization target %", 1)}
      </div>
      <div>
        <label className="label">Working days</label>
        <div className="flex flex-wrap gap-2">
          {DAY_NAMES.map((d, i) => {
            const on = v.workingDays.includes(i + 1);
            return <button type="button" key={d} onClick={() => set({ workingDays: on ? v.workingDays.filter((x) => x !== i + 1) : [...v.workingDays, i + 1].sort() })}
              className={cx("rounded-xl border px-3 py-1.5 text-sm", on ? "border-accent/40 bg-accent/15 text-accent" : "hairline text-muted")}>{d}</button>;
          })}
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {([["allowWeekendEntry", "Allow entries on non-working days"], ["notifyDeadlineReminder", "Deadline reminders"], ["notifyMissingTimesheet", "Missing timesheet alerts"], ["notifyAssignmentChange", "Assignment change alerts"]] as const).map(([k, l]) => (
          <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-[rgb(var(--accent))]" checked={v[k]} onChange={(e) => set({ [k]: e.target.checked })} />{l}</label>
        ))}
      </div>
      <Status msg={msg} />
      <div className="flex justify-end"><button className="btn-primary" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Save settings</button></div>
    </form>
  );
}

export function HolidayManager({ holidays }: { holidays: { id: number; date: string; name: string; label: string; past: boolean }[] }) {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function add(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api("/api/admin/holidays", { body: { date, name } });
      setDate(""); setName(""); setMsg(null);
      router.refresh();
    } catch (err) { setMsg({ ok: false, text: (err as Error).message }); }
  }
  async function remove(id: number) {
    if (!window.confirm("Delete this holiday?")) return;
    await api(`/api/admin/holidays?id=${id}`, { method: "DELETE" }).catch((e) => setMsg({ ok: false, text: e.message }));
    router.refresh();
  }
  return (
    <div className="space-y-4">
      <form onSubmit={add} className="flex flex-wrap items-end gap-3">
        <div><label className="label">Date</label><input type="date" required className="input" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div className="flex-1"><label className="label">Name</label><input required maxLength={80} className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <button className="btn-primary"><Plus className="h-4 w-4" />Add holiday</button>
      </form>
      <Status msg={msg} />
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {holidays.map((h) => (
          <li key={h.id} className={cx("flex items-center justify-between rounded-xl border hairline bg-elev/40 px-3 py-2", h.past && "opacity-60")}>
            <div><div className="text-sm font-medium">{h.name}</div><div className="text-xs text-subtle">{h.label}</div></div>
            <button className="btn-ghost h-8 w-8 px-0 hover:text-bad" onClick={() => remove(h.id)} aria-label={`Delete ${h.name}`}><Trash2 className="h-4 w-4" /></button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ReopenTool() {
  const [id, setId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/api/timesheets/${Number(id)}/reopen`, { body: { comment: reason } });
      setMsg({ ok: true, text: `Timesheet #${id} reopened as draft. The employee was notified.` });
      setId(""); setReason("");
    } catch (err) { setMsg({ ok: false, text: (err as Error).message }); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-[120px_1fr] gap-3">
        <div><label className="label">Timesheet #</label><input required type="number" min={1} className="input" value={id} onChange={(e) => setId(e.target.value)} /></div>
        <div><label className="label">Reason</label><input required minLength={3} className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
      </div>
      <Status msg={msg} />
      <button className="btn-secondary" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Reopen</button>
      <p className="text-[11px] text-subtle">Timesheet numbers appear in the approval inbox detail and audit log.</p>
    </form>
  );
}
