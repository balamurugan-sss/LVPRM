/**
 * Seeds FICTIONAL demo data. None of these people, clients or projects are real.
 * Dates are generated relative to "today" so the demo always shows recent activity.
 */
import { randomBytes, scryptSync } from "crypto";
import { Pool, types } from "pg";
import { addDays, isoWeekday, todayISO, weekStart } from "../src/lib/dates";
import { DEFAULT_SETTINGS } from "../src/lib/rules";

types.setTypeParser(1082, (v) => v);

const DEMO_PASSWORD = "demo1234";

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${scryptSync(password, salt, 32).toString("hex")}`;
}

// Deterministic PRNG so every reseed produces the same story.
let seed = 42;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);

const DEPARTMENTS = ["Analytics Delivery", "Data Engineering", "Marketing Analytics", "Resource Management"];

type Person = { code: string; name: string; role: "employee" | "manager" | "admin"; title: string; dept: number; manager?: string; location: string };

const PEOPLE: Person[] = [
  { code: "D1000", name: "Riya Kapoor", role: "admin", title: "Resource Manager", dept: 3, location: "Chennai" },
  { code: "D1001", name: "Priya Raman", role: "manager", title: "Engagement Manager", dept: 0, manager: "D1000", location: "Chennai" },
  { code: "D1002", name: "Daniel Brooks", role: "manager", title: "Delivery Manager", dept: 1, manager: "D1000", location: "Bengaluru" },
  { code: "D1003", name: "Meera Iyer", role: "manager", title: "Practice Lead", dept: 2, manager: "D1000", location: "Chennai" },
  { code: "D1101", name: "Arjun Menon", role: "employee", title: "Senior Analyst", dept: 0, manager: "D1001", location: "Chennai" },
  { code: "D1102", name: "Kavya Nair", role: "employee", title: "Analyst", dept: 0, manager: "D1001", location: "Chennai" },
  { code: "D1103", name: "Rahul Verma", role: "employee", title: "Data Scientist", dept: 0, manager: "D1001", location: "Pune" },
  { code: "D1104", name: "Sneha Pillai", role: "employee", title: "Data Engineer", dept: 1, manager: "D1002", location: "Bengaluru" },
  { code: "D1105", name: "Vikram Rao", role: "employee", title: "Senior Data Engineer", dept: 1, manager: "D1002", location: "Bengaluru" },
  { code: "D1106", name: "Ananya Sharma", role: "employee", title: "ML Engineer", dept: 1, manager: "D1002", location: "Chennai" },
  { code: "D1107", name: "Karthik Subramani", role: "employee", title: "Analytics Consultant", dept: 1, manager: "D1002", location: "Chennai" },
  { code: "D1108", name: "Divya Krishnan", role: "employee", title: "Marketing Analyst", dept: 2, manager: "D1003", location: "Chennai" },
  { code: "D1109", name: "Rohan Das", role: "employee", title: "BI Developer", dept: 2, manager: "D1003", location: "Kolkata" },
  { code: "D1110", name: "Lakshmi Prasad", role: "employee", title: "Associate Analyst", dept: 2, manager: "D1003", location: "Chennai" },
];

const PROJECTS = [
  { code: "NWF-RGM", name: "Revenue Growth Analytics", client: "Northwind Foods", billable: true, manager: "D1001", planned: 4200, color: "#38bdf8" },
  { code: "CTB-RISK", name: "Credit Risk Modelling", client: "Contoso Bank", billable: true, manager: "D1002", planned: 3600, color: "#a78bfa" },
  { code: "FBR-C360", name: "Customer 360 Platform", client: "Fabrikam Retail", billable: true, manager: "D1003", planned: 3800, color: "#f97316" },
  { code: "TSP-MLOPS", name: "MLOps Accelerator", client: "Tailspin Air", billable: true, manager: "D1002", planned: 2400, color: "#34d399" },
  { code: "INT-COE", name: "Analytics CoE & Training", client: "Internal", billable: false, manager: "D1003", planned: 1500, color: "#f472b6" },
];

// [employee, project, allocation %]
const ASSIGNMENTS: [string, string, number][] = [
  ["D1101", "NWF-RGM", 100],
  ["D1102", "NWF-RGM", 75], ["D1102", "INT-COE", 25],
  ["D1103", "NWF-RGM", 50], ["D1103", "TSP-MLOPS", 50],
  ["D1104", "CTB-RISK", 100],
  ["D1105", "CTB-RISK", 60], ["D1105", "TSP-MLOPS", 40],
  ["D1106", "TSP-MLOPS", 80], ["D1106", "INT-COE", 20],
  ["D1107", "CTB-RISK", 50], ["D1107", "FBR-C360", 50],
  ["D1108", "FBR-C360", 100],
  ["D1109", "FBR-C360", 70], ["D1109", "INT-COE", 30],
  ["D1110", "INT-COE", 100],
  ["D1001", "NWF-RGM", 60], ["D1001", "INT-COE", 40],
  ["D1002", "CTB-RISK", 40], ["D1002", "TSP-MLOPS", 30], ["D1002", "INT-COE", 30],
  ["D1003", "FBR-C360", 50], ["D1003", "INT-COE", 50],
];

const TASKS: Record<string, string[]> = {
  "NWF-RGM": ["Price elasticity model", "Promo effectiveness dashboard", "Client workshop prep", "Data validation"],
  "CTB-RISK": ["PD model feature engineering", "Model validation report", "Pipeline maintenance", "Stakeholder review"],
  "FBR-C360": ["Identity resolution", "Segmentation analysis", "Dashboard build", "Data quality checks"],
  "TSP-MLOPS": ["CI/CD for models", "Monitoring setup", "Feature store integration", "Documentation"],
  "INT-COE": ["Internal training", "Knowledge sharing session", "Hiring interviews", "Accelerator R&D"],
};

const HOLIDAYS: [string, string][] = [
  ["2026-01-01", "New Year's Day"], ["2026-01-26", "Republic Day"], ["2026-05-01", "Labour Day"],
  ["2026-08-15", "Independence Day"], ["2026-10-02", "Gandhi Jayanti"], ["2026-10-20", "Dussehra"],
  ["2026-11-09", "Diwali"], ["2026-12-25", "Christmas"], ["2027-01-01", "New Year's Day"],
  ["2027-01-15", "Pongal"], ["2027-01-26", "Republic Day"],
];

async function main() {
  if (!process.env.DATABASE_URL && (process.env.VERCEL || process.env.CI)) {
    console.error("\n✖ DATABASE_URL is not set.\n  Add it in Vercel → Project → Settings → Environment Variables (a hosted Postgres URL, e.g. Neon), then redeploy.\n");
    process.exit(1);
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://prm:prm@localhost:5432/prm" });
  const db = await pool.connect();
  const today = todayISO();
  const thisWeek = weekStart(today);
  const WEEKS = 12;
  const firstWeek = addDays(thisWeek, -7 * WEEKS);

  try {
    if (process.argv.includes("--if-empty")) {
      const { rows } = await db.query("SELECT count(*)::int AS n FROM employees");
      if (rows[0].n > 0) {
        console.log("Database already has data; skipping seed.");
        return;
      }
    }
    await db.query("BEGIN");
    await db.query(`TRUNCATE sessions, audit_logs, notifications, settings, leaves, holidays, approval_records,
      time_entries, timesheet_lines, timesheets, assignments, projects, employees, departments RESTART IDENTITY CASCADE`);

    for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
      await db.query("INSERT INTO settings (key, value) VALUES ($1, $2)", [k, JSON.stringify(v)]);
    }
    const deptIds: number[] = [];
    for (const d of DEPARTMENTS) deptIds.push((await db.query("INSERT INTO departments (name) VALUES ($1) RETURNING id", [d])).rows[0].id);

    const empId = new Map<string, number>();
    const pw = hashPassword(DEMO_PASSWORD);
    for (const p of PEOPLE) {
      const email = `${p.name.split(" ")[0].toLowerCase()}.${p.name.split(" ").slice(-1)[0].toLowerCase()}@demo.prm.local`;
      const r = await db.query(
        `INSERT INTO employees (emp_code, name, email, password_hash, role, title, department_id, location, joined_on)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [p.code, p.name, email, pw, p.role, p.title, deptIds[p.dept], p.location, addDays(today, -400 - Math.floor(rand() * 900))],
      );
      empId.set(p.code, r.rows[0].id);
    }
    for (const p of PEOPLE) {
      if (p.manager) await db.query("UPDATE employees SET manager_id = $1 WHERE emp_code = $2", [empId.get(p.manager), p.code]);
    }

    const projId = new Map<string, number>();
    for (const p of PROJECTS) {
      const r = await db.query(
        `INSERT INTO projects (code, name, client, billable, manager_id, start_date, end_date, planned_hours, color)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [p.code, p.name, p.client, p.billable, empId.get(p.manager), addDays(firstWeek, -60), p.billable ? addDays(today, 180) : null, p.planned, p.color],
      );
      projId.set(p.code, r.rows[0].id);
    }
    const stdWeek = DEFAULT_SETTINGS.standardDailyHours * DEFAULT_SETTINGS.workingDays.length;
    for (const [e, p, pct] of ASSIGNMENTS) {
      await db.query(
        "INSERT INTO assignments (employee_id, project_id, allocation_pct, weekly_hours, start_date) VALUES ($1,$2,$3,$4,$5)",
        [empId.get(e), projId.get(p), pct, (stdWeek * pct) / 100, addDays(firstWeek, -60)],
      );
    }
    for (const [d, n] of HOLIDAYS) await db.query("INSERT INTO holidays (date, name) VALUES ($1,$2)", [d, n]);
    const holidaySet = new Set(HOLIDAYS.map((h) => h[0]));

    // A few days of approved leave.
    const leave: [string, number, string][] = [
      ["D1102", -17, "Annual"], ["D1102", -16, "Annual"], ["D1105", -30, "Sick"], ["D1108", -9, "Annual"],
      ["D1110", -44, "Annual"], ["D1103", -24, "Sick"],
    ];
    const leaveSet = new Set<string>();
    for (const [code, offset, type] of leave) {
      let d = addDays(today, offset);
      while (isoWeekday(d) > 5) d = addDays(d, -1);
      await db.query("INSERT INTO leaves (employee_id, date, hours, type) VALUES ($1,$2,8,$3) ON CONFLICT DO NOTHING", [empId.get(code), d, type]);
      leaveSet.add(`${code}:${d}`);
    }

    const admin = empId.get("D1000")!;
    const managerOf = (code: string) => PEOPLE.find((p) => p.code === code)?.manager;

    // Scripted exceptions so the demo shows every state.
    const lastWeek = addDays(thisWeek, -7);
    const special: Record<string, Record<string, "missing" | "rejected" | "submitted" | "draft">> = {
      [lastWeek]: { D1101: "submitted", D1102: "submitted", D1104: "submitted", D1106: "submitted", D1107: "rejected", D1108: "submitted", D1109: "draft", D1110: "missing", D1003: "submitted" },
      [addDays(thisWeek, -14)]: { D1103: "rejected", D1110: "missing", D1105: "submitted" },
      [addDays(thisWeek, -28)]: { D1109: "missing" },
    };

    const timesheetsByCode: { code: string; week: string; id: number; status: string }[] = [];

    for (const p of PEOPLE) {
      if (p.role === "admin") continue;
      const projects = ASSIGNMENTS.filter((a) => a[0] === p.code);
      for (let w = firstWeek; w <= thisWeek; w = addDays(w, 7)) {
        let status: "approved" | "submitted" | "rejected" | "draft" | "missing" = special[w]?.[p.code] ?? "approved";
        if (w === thisWeek) {
          status = rand() < 0.6 ? "draft" : "missing";
          if (p.code === "D1101") status = "draft";
        } else if (w === lastWeek && !special[w]?.[p.code]) {
          status = rand() < 0.5 ? "approved" : "submitted";
        }
        if (status === "missing") continue;

        const tsr = await db.query("INSERT INTO timesheets (employee_id, week_start, status) VALUES ($1,$2,$3) RETURNING id", [empId.get(p.code), w, status]);
        const tsId = tsr.rows[0].id as number;
        let total = 0;
        const snapshot: unknown[] = [];
        let pos = 0;
        for (const [, proj, pct] of projects) {
          const tasks = TASKS[proj];
          const taskCount = 1;
          for (let t = 0; t < taskCount; t++) {
            const task = "";
            void tasks;
            if (snapshot.some((s) => (s as { project: string; task: string }).project === proj && (s as { task: string }).task === task)) continue;
            const line = await db.query(
              "INSERT INTO timesheet_lines (timesheet_id, project_id, task, notes, billable, position) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
              [tsId, projId.get(proj), task, "", PROJECTS.find((x) => x.code === proj)!.billable, pos++],
            );
            const hours: number[] = [];
            for (let d = 0; d < 7; d++) {
              const date = addDays(w, d);
              let h = 0;
              const isWork = d < 5 && !holidaySet.has(date) && !leaveSet.has(`${p.code}:${date}`) && (w !== thisWeek || date <= today);
              if (isWork) {
                const dayTotal = 8 + (rand() < 0.15 ? 0.5 : 0) - (rand() < 0.1 ? 0.5 : 0);
                h = Math.round(((dayTotal * pct) / 100 / taskCount) * 4) / 4;
                if (status === "rejected" && d === 2) h = Math.round(h * 1.6 * 4) / 4; // the "mistake" a manager rejects
              }
              hours.push(h);
              if (h > 0) await db.query("INSERT INTO time_entries (line_id, work_date, hours) VALUES ($1,$2,$3)", [line.rows[0].id, date, h]);
              total += h;
            }
            snapshot.push({ project: proj, task, hours });
          }
        }
        const mgrCode = managerOf(p.code)!;
        const mgr = empId.get(mgrCode)!;
        const submittedAt = `${addDays(w, 4 + Math.floor(rand() * 3))}T${String(12 + Math.floor(rand() * 6)).padStart(2, "0")}:15:00Z`;
        const decidedAt = `${addDays(w, 7 + Math.floor(rand() * 2))}T10:${String(10 + Math.floor(rand() * 40))}:00Z`;
        if (status !== "draft") {
          await db.query("UPDATE timesheets SET submitted_at = $2, updated_at = $2 WHERE id = $1", [tsId, submittedAt]);
          await db.query(
            "INSERT INTO approval_records (timesheet_id, action, actor_id, version, total_hours, snapshot, created_at) VALUES ($1,'submitted',$2,1,$3,$4,$5)",
            [tsId, empId.get(p.code), total, JSON.stringify(snapshot), submittedAt],
          );
          await db.query("INSERT INTO audit_logs (actor_id, action, entity, entity_id, details, created_at) VALUES ($1,'timesheet.submit','timesheet',$2,$3,$4)", [
            empId.get(p.code), tsId, JSON.stringify({ week: w, total }), submittedAt,
          ]);
        }
        if (status === "approved" || status === "rejected") {
          const comment = status === "rejected" ? "Wednesday hours look too high for this project — please split across the correct tasks and resubmit." : null;
          await db.query("UPDATE timesheets SET decided_at = $2, decided_by = $3, decision_comment = $4 WHERE id = $1", [tsId, decidedAt, mgr, comment]);
          await db.query(
            "INSERT INTO approval_records (timesheet_id, action, actor_id, comment, version, total_hours, created_at) VALUES ($1,$2,$3,$4,1,$5,$6)",
            [tsId, status, mgr, comment, total, decidedAt],
          );
          await db.query("INSERT INTO audit_logs (actor_id, action, entity, entity_id, details, created_at) VALUES ($1,$2,'timesheet',$3,$4,$5)", [
            mgr, status === "approved" ? "timesheet.approve" : "timesheet.reject", tsId, JSON.stringify({ week: w, total, comment: comment ?? undefined }), decidedAt,
          ]);
          if (w >= addDays(thisWeek, -14)) {
            await db.query(
              "INSERT INTO notifications (recipient_id, type, title, body, link, created_at) VALUES ($1,$2,$3,$4,$5,$6)",
              [
                empId.get(p.code),
                status,
                status === "approved" ? "Timesheet approved" : "Changes requested on your timesheet",
                status === "approved"
                  ? `${PEOPLE.find((x) => x.code === mgrCode)!.name} approved ${total}h for the week of ${w}.`
                  : `${PEOPLE.find((x) => x.code === mgrCode)!.name} returned your timesheet for the week of ${w}: “${comment}”`,
                `/timesheet?week=${w}`,
                decidedAt,
              ],
            );
          }
        }
        if (status === "submitted") {
          await db.query("INSERT INTO notifications (recipient_id, type, title, body, link, created_at) VALUES ($1,'pending_approval','Timesheet awaiting approval',$2,$3,$4)", [
            mgr, `${p.name} submitted ${total}h for the week of ${w}.`, `/approvals?id=${tsId}`, submittedAt,
          ]);
        }
        timesheetsByCode.push({ code: p.code, week: w, id: tsId, status });
      }
    }

    // Deadline / missing reminders.
    for (const code of ["D1110", "D1109"]) {
      await db.query("INSERT INTO notifications (recipient_id, type, title, body, link) VALUES ($1,'missing','Missing timesheet',$2,$3)", [
        empId.get(code), `You have not submitted a timesheet for the week of ${lastWeek}. It becomes overdue soon.`, `/timesheet?week=${lastWeek}`,
      ]);
    }
    await db.query("INSERT INTO notifications (recipient_id, type, title, body, link) VALUES ($1,'assignment','Project assignment updated',$2,'/allocation')", [
      empId.get("D1103"), "You were assigned to TSP-MLOPS (MLOps Accelerator) at 50% allocation.",
    ]);
    await db.query("INSERT INTO audit_logs (actor_id, action, entity, entity_id, details) VALUES ($1,'seed.demo_data','system',NULL,$2)", [
      admin, JSON.stringify({ note: "Fictional demo data loaded" }),
    ]);

    await db.query("COMMIT");
    console.log(`Seeded ${PEOPLE.length} fictional people, ${PROJECTS.length} projects, ${timesheetsByCode.length} timesheets.`);
    console.log(`Demo password for every account: ${DEMO_PASSWORD}`);
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
