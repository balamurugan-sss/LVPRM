import { requirePageUser } from "@/lib/auth";
import { assignedProjects, getSettings } from "@/lib/data";
import { deadlineFor } from "@/lib/rules";
import { isValidISODate, todayISO, weekStart } from "@/lib/dates";
import { approvalHistory, getTimesheet, nonWorkingDays } from "@/lib/timesheets";
import { queryOne } from "@/lib/db";
import { TimesheetEditor } from "./TimesheetEditor";

export const metadata = { title: "Weekly timesheet" };

export default async function TimesheetPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const user = await requirePageUser();
  const ws = weekStart(isValidISODate(sp.week) ? sp.week : todayISO());
  const settings = await getSettings();
  const emp = await queryOne<{ daily_hours: number | null }>("SELECT daily_hours FROM employees WHERE id = $1", [user.id]);
  const dailyHours = emp?.daily_hours ?? settings.standardDailyHours;
  const [sheet, projects, off] = await Promise.all([
    getTimesheet(user.id, ws),
    assignedProjects(user.id, ws),
    nonWorkingDays(user.id, ws, dailyHours),
  ]);
  const history = sheet.id ? await approvalHistory(sheet.id) : [];

  return (
    <TimesheetEditor
      key={`${ws}-${sheet.status}-${sheet.version}`}
      initial={sheet}
      today={todayISO()}
      projects={projects.map((p) => ({ id: p.id, code: p.code, name: p.name, billable: p.billable, color: p.color, allocation: p.allocation_pct }))}
      settings={settings}
      dailyHours={dailyHours}
      deadline={deadlineFor(ws, settings.submissionDeadlineDays)}
      offDays={[...off.set]}
      holidays={off.holidays}
      leaves={off.leaves.map((l) => ({ date: l.date, hours: l.hours, type: l.type }))}
      history={history}
    />
  );
}
