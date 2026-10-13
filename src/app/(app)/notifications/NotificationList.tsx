"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { api } from "@/lib/client";
import { fmtDateTime } from "@/lib/dates";
import { Card, cx, Empty } from "@/components/ui";

type Item = { id: number; type: string; title: string; body: string; link: string | null; read_at: string | null; created_at: string };
const TONE: Record<string, string> = { approved: "bg-ok", rejected: "bg-bad", pending_approval: "bg-info", submitted: "bg-info", missing: "bg-warn", deadline: "bg-warn", assignment: "bg-accent", reopened: "bg-warn" };

export function NotificationList({ items }: { items: Item[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const shown = items.filter((i) => filter === "all" || !i.read_at);

  async function open(i: Item) {
    if (!i.read_at) await api("/api/notifications", { body: { ids: [i.id] } }).catch(() => {});
    if (i.link) router.push(i.link);
    else router.refresh();
  }
  async function readAll() {
    await api("/api/notifications", { body: { all: true } });
    router.refresh();
  }
  return (
    <Card bodyClass="p-0" title={
      <div className="flex rounded-xl border hairline bg-elev/40 p-1">
        {(["all", "unread"] as const).map((f) => <button key={f} onClick={() => setFilter(f)} className={cx("rounded-lg px-3 py-1 text-xs font-medium capitalize", filter === f ? "bg-accent text-white" : "text-muted")}>{f}</button>)}
      </div>} action={<button className="btn-secondary py-1.5 text-xs" onClick={readAll}><CheckCheck className="h-4 w-4" />Mark all read</button>}>
      {shown.length === 0 ? <Empty title="No notifications" icon={<Bell className="h-6 w-6" />} /> : (
        <ul className="mt-4 divide-y divide-line/5">
          {shown.map((i) => (
            <li key={i.id}>
              <button onClick={() => open(i)} className={cx("flex w-full gap-3 px-5 py-4 text-left transition hover:bg-elev/40", !i.read_at && "bg-accent/[0.04]")}>
                <span className={cx("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", TONE[i.type] ?? "bg-subtle")} />
                <div className="min-w-0 flex-1">
                  <div className={cx("text-sm", !i.read_at ? "font-semibold" : "font-medium text-muted")}>{i.title}</div>
                  <p className="text-sm text-muted">{i.body}</p>
                  <p className="mt-1 text-xs text-subtle">{fmtDateTime(i.created_at)}</p>
                </div>
                {!i.read_at && <span className="chip h-fit bg-accent/15 text-accent">New</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
