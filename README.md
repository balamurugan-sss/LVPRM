# PRM — Project Resource Management & Utilization Tracker

An MVP for recording weekly hours against assigned projects, routing timesheets to managers for approval, and reporting utilization. The default look is a dark, modern dashboard; a light theme is available from the sidebar toggle.

> **All demo data is fictional.** The people, clients and projects in the seed script are made up.

## Features

| Area | What's included |
|---|---|
| **Employee** | Weekly timesheet grid (one row per allocation, hours only, decimal/quarter-hour support), daily and weekly totals, markers for incomplete days, holidays and leave, Save draft, Submit with a confirmation dialog, Copy last week, read-only after submit, edit and resubmit after rejection, history, notifications |
| **Manager** | Approval inbox with filters (status, employee, project, department, date range), sortable columns, a detail drawer, single or bulk approve, reject with a required reason, a recent-decisions audit trail, team KPIs |
| **Resource admin** | Employee profiles (create, edit, deactivate), project creation and editing, assignments with allocation %, working days and hour limits, submission deadline, utilization target, notification toggles, holiday calendar, reopening a submitted or approved timesheet, full audit log, CSV export |
| **Analytics** | Reported, approved, pending and rejected hours; billable and total utilization; billable vs non-billable; planned vs actual by project; allocation matrix; weekly trends; overdue timesheets; **Week / Month / Year pie-chart time analysis** |
| **Security** | Server-side RBAC on every API route, data scoped by reporting line, DB-backed HttpOnly sessions, scrypt password hashing, same-origin check on mutations, row locks against duplicate submission, CSV formula-injection guard, immutable approval history and audit log |

**Utilization formula (configurable):** `Billable utilization % = Approved billable hours ÷ Available working hours × 100`. Available hours = working days × standard daily hours, minus holidays and approved leave. Total utilization uses all approved hours.

## Stack

Next.js 15 (App Router, TypeScript) · Tailwind CSS · Recharts · PostgreSQL (`pg`, plain SQL) · lucide icons.

## Run locally

```bash
cp .env.example .env.local          # set DATABASE_URL
npm install
npm run db:reset                    # create the schema and load fictional demo data
npm run dev                         # http://localhost:3000
```

Demo accounts (password `demo1234`). With `DEMO_MODE=true` they can be picked from the login page:

| Role | Email |
|---|---|
| Employee | `arjun.menon@demo.prm.local` |
| Manager | `priya.raman@demo.prm.local` |
| Resource admin | `riya.kapoor@demo.prm.local` |

## Tests

```bash
npm test                 # unit tests for validation, workflow transitions and utilization maths
npm run test:e2e         # full API flow against a running server: log → submit → reject → resubmit → approve → reports
npm run db:seed          # reset demo data afterwards
npm run typecheck && npm run lint
```

## Deploy

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). For Vercel you need a hosted PostgreSQL database such as Neon, Vercel Postgres or Supabase.

## Project layout

```
db/schema.sql              relational schema (employees, projects, assignments, timesheets, lines, entries,
                           approval_records, holidays, leaves, settings, notifications, audit_logs, sessions)
scripts/                   migrate + seed (fictional data)
src/lib/rules.ts           pure business rules (validation, transitions, utilization)
src/lib/timesheets.ts      save / submit / approve / reject / reopen (transactional, audited)
src/lib/reports.ts         utilization and analysis queries
src/app/api/**             REST endpoints (server-side authorization)
src/app/(app)/**           pages: dashboard, timesheet, history, approvals, reports, allocation,
                           directory, notifications, admin
```

## Next phases
- Company SSO (OIDC/SAML) to replace the password login; `createSession()` in `src/lib/auth.ts` is the hook
- Email / Teams notifications and scheduled deadline reminders
- Leave-system integration (the `leaves` table is already used in the availability maths)
