import Link from "next/link";
import { AlertTriangle, ArrowRight, BadgeCheck, CalendarClock, CheckCheck, Clock3, Gauge, Hourglass, Inbox, Sparkles } from "lucide-react";
import { requirePageUser, type SessionUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { approvableEmployeeIds, assignedProjects, getSettings, visibleEmployeeIds } from "@/lib/data";
import { addDays, dayLabel, fmtDate, fmtDateTime, fmtShort, fmtWeek, todayISO, weekDays, weekStart } from "@/lib/dates";
import { employeeUtilization, hoursRows, periodBreakdowns, weeklyTrend } from "@/lib/reports";
import { deadlineFor, isOverdue, round2, utilizationPct, type TimesheetStatus } from "@/lib/rules";
import { getTimesheet, nonWorkingDays } from "@/lib/timesheets";
import { Avatar, AvatarStack, Card, Empty, fmtH, Kpi, Pct, Progress, StatusBadge } from "@/components/ui";
import { DailyBars, StackedWeekChart, TrendArea } from "@/components/charts/Charts";
import { AnalysisPie } from "@/components/charts/AnalysisPie";

export const metadata = { title: "Dashboard" };

const WEEKDAY = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const user = await requirePageUser();
  const settings = await getSettings();
  const today = todayISO();
  const ws = weekStart(today);
  const from = addDays(ws, -7 * 7);
  const to = addDays(ws, 6);

  const [sheet, utilRows, rows, projects, notes, history, analysis] = await Promise.all([
    getTimesheet(user.id, ws),
    employeeUtilization([user.id], from, to),
    hoursRows([user.id], from, to),
    assignedProjects(user.id, ws),
    query<{ id: number; title: string; body: string; created_at: string; read_at: string | null; link: string | null; type: string }>(
      "SELECT id, title, body, created_at, read_at, link, type FROM notifications WHERE recipient_id = $1 ORDER BY created_at DESC LIMIT 4",
      [user.id],
    ),
    query<{ week_start: string; status: TimesheetStatus }>(
      "SELECT week_start, status FROM timesheets WHERE employee_id = $1 AND week_start >= $2",
      [user.id, addDays(ws, -7 * 12)],
    ),
    periodBreakdowns([user.id], today),
  ]);
  const me = utilRows[0];
  const dailyHours = settings.standardDailyHours;
  const { set: offDays, holidays } = await nonWorkingDays(user.id, ws, dailyHours);
  const days = weekDays(ws);
  const dayTotals = days.map((_, i) => round2(sheet.lines.reduce((s, l) => s + (l.hours[i] || 0), 0)));
  const expectedWeek = settings.workingDays.filter((d) => !offDays.has(d - 1)).length * dailyHours;
  const deadline = deadlineFor(ws, settings.submissionDeadlineDays);

  // Compliance: share of the last 12 completed weeks submitted on time or approved.
  const completedWeeks = Array.from({ length: 12 }, (_, i) => addDays(ws, -7 * (i + 1)));
  const compliant = completedWeeks.filter((w) => {
    const s = history.find((h) => h.week_start === w)?.status;
    return s === "submitted" || s === "approved";
  }).length;
  const compliance = Math.round((compliant / completedWeeks.length) * 100);
  const overdue = completedWeeks.filter((w) => isOverdue(w, history.find((h) => h.week_start === w)?.status ?? null, today, settings.submissionDeadlineDays));
  const rejected = history.filter((h) => h.status === "rejected");

  const trend = weeklyTrend(rows, from, to);
  const trendUtil = trend.map((t) => ({ label: fmtShort(t.week), value: utilizationPct(t.billable, expectedWeekFor()) }));
  function expectedWeekFor() {
    return dailyHours * settings.workingDays.length;
  }
  const firstName = user.name.split(" ")[0];
  const weekdayName = WEEKDAY[(new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7];
  const isMgr = user.role !== "employee";

  return (
    <div className="space-y-6">
      {sp.denied && (
        <p role="alert" className="rounded-xl bg-warn/10 px-4 py-2 text-sm text-warn">You do not have access to that page.</p>
      )}

      <div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-[34px]">Hello, {firstName}</h1>
        <p className="mt-1 text-sm text-muted">
          It&apos;s {weekdayName}, {fmtDate(today)}. {sheet.total > 0 ? `You've logged ${fmtH(sheet.total)}h of ${expectedWeek}h this week.` : "You haven't logged any hours this week yet."}
          {rejected.length > 0 && <> <span className="text-bad">{rejected.length} timesheet{rejected.length > 1 ? "s need" : " needs"} changes.</span></>}
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.35fr_1fr_1fr]">
        {/* Hero: this week's timesheet */}
        <section className="relative overflow-hidden rounded-3xl p-6 text-white shadow-[0_20px_50px_-20px_rgba(255,100,40,0.6)]"
          style={{ background: "linear-gradient(120deg,#ff3d3d 0%,#ff7a1a 38%,#f59e8b 70%,#8b7cf6 100%)" }}>
          <div className="relative flex h-full flex-col justify-between gap-6">
            <div>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">This week&apos;s timesheet</h2>
                <span className="rounded-full bg-black/25 px-3 py-1 text-xs font-medium backdrop-blur">
                  {sheet.status ? sheet.status === "rejected" ? "Changes requested" : sheet.status[0].toUpperCase() + sheet.status.slice(1) : "Not started"}
                </span>
              </div>
              <p className="mt-1 text-xs font-medium uppercase tracking-wider text-white/80">
                {fmtWeek(ws)} · due {fmtDate(deadline)}
              </p>
            </div>
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="text-4xl font-semibold tabular-nums">{fmtH(sheet.total)}<span className="text-lg text-white/75"> / {expectedWeek}h</span></div>
                <div className="mt-3 h-1.5 w-48 overflow-hidden rounded-full bg-black/20">
                  <div className="h-full rounded-full bg-white" style={{ width: `${Math.min(100, (sheet.total / (expectedWeek || 1)) * 100)}%` }} />
                </div>
              </div>
              <Link href="/timesheet" className="inline-flex items-center gap-2 rounded-xl bg-[#14161d] px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-black">
                {sheet.status === "submitted" || sheet.status === "approved" ? "View timesheet" : "Log hours"} <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* Profile card */}
        <section className="flex flex-col overflow-hidden rounded-3xl bg-white text-[#10131a] shadow-card">
          <div className="p-5">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-600"><span className="h-2.5 w-2.5 rounded-full bg-[#10131a]" /> {user.department ?? "LatentView Analytics"}</div>
            <div className="mt-3 flex items-center gap-3">
              <Avatar name={user.name} size={44} className="ring-white" />
              <div>
                <div className="text-xl font-semibold leading-tight">{user.name}</div>
                <div className="text-xs font-medium text-sky-700">{user.title}</div>
              </div>
            </div>
          </div>
          <dl className="grid flex-1 grid-cols-2 content-center gap-x-4 gap-y-3 bg-gradient-to-b from-sky-100 to-sky-200 px-5 py-4 text-xs">
            <div><dt className="text-slate-500">Employee ID</dt><dd className="font-semibold">{user.emp_code}</dd></div>
            <div><dt className="text-slate-500">Reporting manager</dt><dd className="font-semibold">{user.manager_name ?? "—"}</dd></div>
            <div><dt className="text-slate-500">Projects</dt><dd className="font-semibold">{projects.length}</dd></div>
            <div><dt className="text-slate-500">Billing status</dt><dd className="font-semibold">{projects.some((p) => p.billable) ? `Billable · ${projects.filter((p) => p.billable).reduce((s, p) => s + p.allocation_pct, 0)}%` : "Internal · 100%"}</dd></div>
          </dl>
        </section>

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-4">
          <Kpi label="Compliance" value={`${compliance}%`} hint="Last 12 weeks on time" tone={compliance >= 90 ? "ok" : compliance >= 70 ? "warn" : "bad"} icon={<BadgeCheck className="h-4 w-4" />} href="/history" />
          <Kpi label="Billable util." value={<Pct value={me?.utilization ?? 0} target={settings.utilizationTarget} />} hint={`Target ${settings.utilizationTarget}% · 8 wks`} tone="accent" icon={<Gauge className="h-4 w-4" />} />
          <Kpi label="Approved" value={fmtH(me?.approved ?? 0)} unit="h" hint="Last 8 weeks" tone="ok" icon={<CheckCheck className="h-4 w-4" />} href="/history?status=approved" />
          <Kpi label="Pending" value={fmtH(me?.pending ?? 0)} unit="h" hint={overdue.length ? <span className="text-warn">{overdue.length} overdue week(s)</span> : "Awaiting manager"} tone="info" icon={<Hourglass className="h-4 w-4" />} href="/history?status=submitted" />
        </div>
      </div>

      {isMgr && <TeamSnapshot user={user} />}

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <Card title="Utilization summary" subtitle={`${fmtWeek(ws)} · daily hours vs ${dailyHours}h standard`}
          action={<Link href="/timesheet" className="btn-secondary py-1.5 text-xs">Add / edit timesheet</Link>}>
          <DailyBars
            target={dailyHours}
            data={days.map((d, i) => ({ label: `${dayLabel(d)} ${fmtShort(d).split(" ")[0]}`, hours: dayTotals[i], color: offDays.has(i) ? "#f87171" : undefined }))}
          />
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted">
            <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-accent" />Met standard</span>
            <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-amber-500" />Below standard</span>
            <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-bad" />Holiday / leave</span>
            {holidays.map((h) => <span key={h.date} className="text-bad">{fmtShort(h.date)}: {h.name}</span>)}
          </div>
        </Card>

        <Card title={`My allocations (${String(projects.length).padStart(2, "0")})`} subtitle="Current assignments" action={<Link href="/allocation" className="chip bg-elev text-muted hover:text-fg">See all</Link>}>
          {projects.length === 0 ? <Empty title="No active assignments">Ask your resource manager to assign you to a project.</Empty> : (
            <ul className="divide-y divide-line/5">
              {projects.map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl text-xs font-bold text-[#0b0c10]" style={{ background: p.color }}>{p.code.slice(0, 2)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{p.code}</div>
                    <div className="text-xs text-subtle">{p.billable ? "Billable" : "Internal"} · {fmtH(p.weekly_hours ?? 0)}h / week</div>
                  </div>
                  <div className="w-20 text-right">
                    <div className="text-sm font-semibold tabular-nums">{p.allocation_pct}%</div>
                    <Progress value={p.allocation_pct} tone={p.color} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr_1fr]">
        <Card title="Weekly hours" subtitle="Approved billable vs non-billable, and pending approval">
          <StackedWeekChart data={trend.map((t) => ({ label: fmtShort(t.week), billable: t.billable, nonBillable: t.nonBillable, pending: t.pending }))} />
        </Card>
        <Card title="Billable utilization trend" subtitle={`Approved billable ÷ ${expectedWeekFor()}h available per week`}>
          <TrendArea data={trendUtil} target={settings.utilizationTarget} height={260} />
        </Card>
        <AnalysisPie data={analysis} title="My time analysis" size={190} />
      </div>

      <Card title="Recent activity" action={<Link href="/notifications" className="chip bg-elev text-muted hover:text-fg">All notifications</Link>}>
        {notes.length === 0 ? <Empty title="You're all caught up" icon={<Sparkles className="h-6 w-6" />} /> : (
          <ul className="grid gap-3 md:grid-cols-2">
            {notes.map((n) => (
              <li key={n.id}>
                <Link href={n.link ?? "/notifications"} className="flex gap-3 rounded-xl border hairline bg-elev/40 p-3 transition hover:border-accent/30">
                  <NoteIcon type={n.type} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-medium">{n.title}{!n.read_at && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}</div>
                    <p className="line-clamp-2 text-xs text-muted">{n.body}</p>
                    <p className="mt-1 text-[11px] text-subtle">{fmtDateTime(n.created_at)}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function NoteIcon({ type }: { type: string }) {
  const map: Record<string, [React.ReactNode, string]> = {
    approved: [<CheckCheck key="a" className="h-4 w-4" />, "bg-ok/15 text-ok"],
    rejected: [<AlertTriangle key="r" className="h-4 w-4" />, "bg-bad/15 text-bad"],
    pending_approval: [<Inbox key="p" className="h-4 w-4" />, "bg-info/15 text-info"],
    submitted: [<Clock3 key="s" className="h-4 w-4" />, "bg-info/15 text-info"],
    missing: [<CalendarClock key="m" className="h-4 w-4" />, "bg-warn/15 text-warn"],
  };
  const [icon, cls] = map[type] ?? [<Sparkles key="d" className="h-4 w-4" />, "bg-accent/15 text-accent"];
  return <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${cls}`}>{icon}</span>;
}

async function TeamSnapshot({ user }: { user: SessionUser }) {
  const userId = user.id;
  const settings = await getSettings();
  const [approvable, visible] = await Promise.all([approvableEmployeeIds(user), visibleEmployeeIds(user)]);
  const today = todayISO();
  const ws = weekStart(today);
  const from = addDays(ws, -7 * 3);
  const team = visible.filter((id) => id !== userId);
  const [pending, util, teamAnalysis] = await Promise.all([
    approvable.length
      ? query<{ id: number; name: string; week_start: string; submitted_at: string; total: number }>(
          `SELECT t.id, e.name, t.week_start, t.submitted_at,
                  COALESCE((SELECT SUM(te.hours) FROM time_entries te JOIN timesheet_lines l ON l.id = te.line_id WHERE l.timesheet_id = t.id),0)::float AS total
             FROM timesheets t JOIN employees e ON e.id = t.employee_id
            WHERE t.status = 'submitted' AND t.employee_id = ANY($1) ORDER BY t.submitted_at LIMIT 6`,
          [approvable],
        )
      : Promise.resolve([]),
    employeeUtilization(team, from, addDays(ws, -1)),
    periodBreakdowns(team, today),
  ]);
  const avail = util.reduce((s, u) => s + u.available, 0);
  const teamUtil = utilizationPct(util.reduce((s, u) => s + u.approvedBillable, 0), avail);
  const overdue = util.filter((u) => u.overdueWeeks > 0);
  const pendingHours = round2(pending.reduce((s, p) => s + p.total, 0));

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_1.4fr]">
      <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <Kpi label="Awaiting your approval" value={pending.length} hint={`${fmtH(pendingHours)}h submitted`} tone="info" icon={<Inbox className="h-4 w-4" />} href="/approvals" />
        <Kpi label="Team billable util." value={<Pct value={teamUtil} target={settings.utilizationTarget} />} hint={`${team.length} people · last 3 weeks`} tone="accent" icon={<Gauge className="h-4 w-4" />} href="/reports/employees" />
        <Kpi label="Overdue submitters" value={overdue.length} hint={overdue.length ? <AvatarStack names={overdue.map((o) => o.name)} /> : "Everyone is on time"} tone={overdue.length ? "warn" : "ok"} icon={<CalendarClock className="h-4 w-4" />} href="/reports/employees?sort=overdue" />
        <Kpi label="Team approved hours" value={fmtH(round2(util.reduce((s, u) => s + u.approved, 0)))} unit="h" hint="Last 3 weeks" tone="ok" icon={<CheckCheck className="h-4 w-4" />} href="/reports/projects" />
      </div>
      <AnalysisPie data={teamAnalysis} title="Team time analysis" size={180} />
      </div>
      <Card title={`Approval inbox (${String(pending.length).padStart(2, "0")})`} subtitle="Oldest submissions first" action={<Link href="/approvals" className="chip bg-elev text-muted hover:text-fg">Review all</Link>}>
        {pending.length === 0 ? <Empty title="Nothing waiting for you" icon={<CheckCheck className="h-6 w-6" />}>New submissions from your team will appear here.</Empty> : (
          <ul className="divide-y divide-line/5">
            {pending.map((p) => (
              <li key={p.id}>
                <Link href={`/approvals?id=${p.id}`} className="flex items-center gap-3 py-2.5 hover:opacity-90">
                  <Avatar name={p.name} size={34} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{p.name}</div>
                    <div className="text-xs text-subtle">{fmtWeek(p.week_start)} · submitted {fmtDateTime(p.submitted_at)}</div>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">{fmtH(p.total)}h</span>
                  <StatusBadge status="submitted" className="hidden sm:inline-flex" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
