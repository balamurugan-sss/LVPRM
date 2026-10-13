-- PRM — Project Resource Management & Utilization Tracker
-- PostgreSQL schema. Idempotent: safe to run repeatedly.

CREATE TABLE IF NOT EXISTS departments (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS employees (
  id            SERIAL PRIMARY KEY,
  emp_code      TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('employee', 'manager', 'admin')),
  title         TEXT NOT NULL DEFAULT '',
  department_id INTEGER REFERENCES departments(id),
  manager_id    INTEGER REFERENCES employees(id),
  location      TEXT NOT NULL DEFAULT '',
  daily_hours   NUMERIC(4,2),             -- per-employee override of the org standard
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  joined_on     DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  id            SERIAL PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  client        TEXT NOT NULL DEFAULT 'Internal',
  billable      BOOLEAN NOT NULL DEFAULT TRUE,
  manager_id    INTEGER REFERENCES employees(id),
  start_date    DATE NOT NULL,
  end_date      DATE,
  planned_hours NUMERIC(10,2) NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'on_hold', 'closed')),
  color         TEXT NOT NULL DEFAULT '#6366f1'
);

CREATE TABLE IF NOT EXISTS assignments (
  id             SERIAL PRIMARY KEY,
  employee_id    INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  project_id     INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  allocation_pct INTEGER NOT NULL DEFAULT 100 CHECK (allocation_pct BETWEEN 0 AND 100),
  weekly_hours   NUMERIC(5,2),             -- planned hours per week on this project
  start_date     DATE NOT NULL,
  end_date       DATE,
  UNIQUE (employee_id, project_id)
);

-- One timesheet per employee per week (weekly submission policy).
CREATE TABLE IF NOT EXISTS timesheets (
  id               SERIAL PRIMARY KEY,
  employee_id      INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  week_start       DATE NOT NULL,
  status           TEXT NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
  submitted_at     TIMESTAMPTZ,
  decided_at       TIMESTAMPTZ,
  decided_by       INTEGER REFERENCES employees(id),
  decision_comment TEXT,
  version          INTEGER NOT NULL DEFAULT 1,   -- incremented on each (re)submission
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, week_start)
);

CREATE TABLE IF NOT EXISTS timesheet_lines (
  id           SERIAL PRIMARY KEY,
  timesheet_id INTEGER NOT NULL REFERENCES timesheets(id) ON DELETE CASCADE,
  project_id   INTEGER NOT NULL REFERENCES projects(id),
  task         TEXT NOT NULL DEFAULT '',
  notes        TEXT NOT NULL DEFAULT '',
  billable     BOOLEAN NOT NULL DEFAULT TRUE,
  position     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS time_entries (
  id        SERIAL PRIMARY KEY,
  line_id   INTEGER NOT NULL REFERENCES timesheet_lines(id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  hours     NUMERIC(4,2) NOT NULL CHECK (hours >= 0 AND hours <= 24),
  UNIQUE (line_id, work_date)
);

-- Immutable history of every workflow transition, including a snapshot of what was submitted.
CREATE TABLE IF NOT EXISTS approval_records (
  id           SERIAL PRIMARY KEY,
  timesheet_id INTEGER NOT NULL REFERENCES timesheets(id) ON DELETE CASCADE,
  action       TEXT NOT NULL CHECK (action IN ('submitted', 'approved', 'rejected', 'reopened')),
  actor_id     INTEGER NOT NULL REFERENCES employees(id),
  comment      TEXT,
  version      INTEGER NOT NULL,
  total_hours  NUMERIC(6,2) NOT NULL DEFAULT 0,
  snapshot     JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS holidays (
  id   SERIAL PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS leaves (
  id          SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  hours       NUMERIC(4,2) NOT NULL,
  type        TEXT NOT NULL DEFAULT 'Annual',
  UNIQUE (employee_id, date)
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id           SERIAL PRIMARY KEY,
  recipient_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  type         TEXT NOT NULL,
  title        TEXT NOT NULL,
  body         TEXT NOT NULL DEFAULT '',
  link         TEXT,
  read_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id         SERIAL PRIMARY KEY,
  actor_id   INTEGER REFERENCES employees(id),
  action     TEXT NOT NULL,
  entity     TEXT NOT NULL,
  entity_id  INTEGER,
  details    JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT PRIMARY KEY,           -- SHA-256 of the cookie value
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_timesheets_status ON timesheets(status);
CREATE INDEX IF NOT EXISTS idx_timesheets_week ON timesheets(week_start);
CREATE INDEX IF NOT EXISTS idx_lines_timesheet ON timesheet_lines(timesheet_id);
CREATE INDEX IF NOT EXISTS idx_entries_date ON time_entries(work_date);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_id, read_at);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_employees_manager ON employees(manager_id);
