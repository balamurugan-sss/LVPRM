import { readFileSync } from "fs";
import { join } from "path";
import { Pool } from "pg";

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://prm:prm@localhost:5432/prm" });
  if (process.argv.includes("--reset")) {
    console.log("Dropping all PRM tables…");
    await pool.query(`DROP TABLE IF EXISTS sessions, audit_logs, notifications, settings, leaves, holidays,
      approval_records, time_entries, timesheet_lines, timesheets, assignments, projects, employees, departments CASCADE`);
  }
  const sql = readFileSync(join(__dirname, "..", "db", "schema.sql"), "utf8");
  await pool.query(sql);
  console.log("Schema is up to date.");
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
