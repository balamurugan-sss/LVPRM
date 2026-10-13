import Link from "next/link";
import { Download } from "lucide-react";
import { requirePageUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { getSettings } from "@/lib/data";
import { fmtDate, fmtDateTime, todayISO } from "@/lib/dates";
import { Card, cx, PageHeader } from "@/components/ui";
import { SettingsForm, HolidayManager, ReopenTool } from "./AdminForms";

export const metadata = { title: "Admin settings" };

export default async function AdminPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  await requirePageUser(["admin"]);
  const tab = ["settings", "holidays", "audit"].includes(sp.tab) ? sp.tab : "settings";
  const page = Math.max(1, Number(sp.page) || 1);
  const action = (sp.action ?? "").slice(0, 60);
  const [settings, holidays, logs, actions] = await Promise.all([
    getSettings(),
    query<{ id: number; date: string; name: string }>("SELECT id, date, name FROM holidays ORDER BY date"),
    query<{ id: number; actor: string | null; action: string; entity: string; entity_id: number | null; details: unknown; created_at: string }>(
      `SELECT l.id, e.name AS actor, l.action, l.entity, l.entity_id, l.details, l.created_at
         FROM audit_logs l LEFT JOIN employees e ON e.id = l.actor_id
        WHERE ($1 = '' OR l.action = $1) ORDER BY l.created_at DESC, l.id DESC LIMIT 50 OFFSET $2`,
      [action, (page - 1) * 50],
    ),
    query<{ action: string }>("SELECT DISTINCT action FROM audit_logs ORDER BY action"),
  ]);

  return (
    <>
      <PageHeader title="Administration" subtitle="Working calendar, submission policy, holidays and audit trail" />
      <div className="mb-5 flex rounded-xl border hairline bg-card p-1 w-fit">
        {["settings", "holidays", "audit"].map((t) => (
          <Link key={t} href={`/admin?tab=${t}`} className={cx("rounded-lg px-4 py-1.5 text-sm font-medium capitalize", tab === t ? "bg-accent text-white" : "text-muted hover:text-fg")}>{t === "audit" ? "Audit log" : t}</Link>
        ))}
      </div>
      {tab === "settings" && (
        <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
          <Card title="Timesheet policy"><SettingsForm settings={settings} /></Card>
          <div className="space-y-5">
            <Card title="Reopen a timesheet" subtitle="Move a submitted or approved timesheet back to draft (audited)"><ReopenTool /></Card>
            <Card title="Data export">
              <div className="flex flex-wrap gap-2">
                <a className="btn-secondary" href="/api/export?type=timesheets"><Download className="h-4 w-4" />Timesheets</a>
                <a className="btn-secondary" href="/api/export?type=employees"><Download className="h-4 w-4" />Employee utilization</a>
                <a className="btn-secondary" href="/api/export?type=projects"><Download className="h-4 w-4" />Project utilization</a>
              </div>
              <p className="mt-2 text-xs text-subtle">CSV (UTF-8) — opens directly in Excel. Default range is the last 8 weeks; use the report pages for custom ranges.</p>
            </Card>
          </div>
        </div>
      )}
      {tab === "holidays" && <Card title="Holiday calendar" subtitle="Holidays are excluded from available hours"><HolidayManager holidays={holidays.map((h) => ({ ...h, label: fmtDate(h.date), past: h.date < todayISO() }))} /></Card>}
      {tab === "audit" && (
        <Card bodyClass="p-0" title="Audit log" subtitle="Every approval, rejection, edit and configuration change"
          action={
            <form className="flex gap-2"><input type="hidden" name="tab" value="audit" />
              <select name="action" defaultValue={action} className="input py-1.5"><option value="">All actions</option>{actions.map((a) => <option key={a.action}>{a.action}</option>)}</select>
              <button className="btn-secondary py-1.5">Filter</button></form>}>
          <div className="scrollbar-thin mt-4 overflow-x-auto">
            <table className="table-base min-w-[900px]">
              <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td className="whitespace-nowrap text-xs text-muted">{fmtDateTime(l.created_at)}</td>
                    <td>{l.actor ?? "System"}</td>
                    <td><span className="chip bg-elev font-mono text-[11px] text-fg">{l.action}</span></td>
                    <td className="text-muted">{l.entity}{l.entity_id ? ` #${l.entity_id}` : ""}</td>
                    <td className="max-w-[420px] truncate font-mono text-[11px] text-subtle" title={JSON.stringify(l.details)}>{l.details ? JSON.stringify(l.details) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-between px-5 py-4 text-sm">
            {page > 1 ? <Link className="btn-ghost" href={`/admin?tab=audit&action=${action}&page=${page - 1}`}>← Newer</Link> : <span />}
            {logs.length === 50 && <Link className="btn-ghost" href={`/admin?tab=audit&action=${action}&page=${page + 1}`}>Older →</Link>}
          </div>
        </Card>
      )}
    </>
  );
}
