import Link from "next/link";
import { Search, Users } from "lucide-react";
import { requirePageUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { Avatar, Card, cx, Empty, PageHeader } from "@/components/ui";
import { EmployeeAdmin } from "./EmployeeAdmin";

export const metadata = { title: "Employee directory" };

export default async function DirectoryPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const user = await requirePageUser();
  const q = (sp.q ?? "").trim().slice(0, 80);
  const dept = Number(sp.dept) || null;
  const people = await query<{
    id: number; emp_code: string; name: string; email: string; role: string; title: string; department: string | null; department_id: number | null;
    manager_id: number | null; manager: string | null; location: string; active: boolean; daily_hours: number | null; projects: string[];
  }>(
    `SELECT e.id, e.emp_code, e.name, e.email, e.role, e.title, d.name AS department, e.department_id, e.manager_id, m.name AS manager,
            e.location, e.active, e.daily_hours,
            COALESCE(array_agg(p.code ORDER BY p.code) FILTER (WHERE p.code IS NOT NULL), '{}') AS projects
       FROM employees e
       LEFT JOIN departments d ON d.id = e.department_id
       LEFT JOIN employees m ON m.id = e.manager_id
       LEFT JOIN assignments a ON a.employee_id = e.id
       LEFT JOIN projects p ON p.id = a.project_id
      WHERE ($1 = '' OR e.name ILIKE '%' || $1 || '%' OR e.emp_code ILIKE '%' || $1 || '%' OR e.title ILIKE '%' || $1 || '%'
             OR p.code ILIKE '%' || $1 || '%' OR p.name ILIKE '%' || $1 || '%')
        AND ($2::int IS NULL OR e.department_id = $2)
        AND (e.active OR $3)
      GROUP BY e.id, d.name, m.name ORDER BY e.name`,
    [q, dept, user.role === "admin"],
  );
  const departments = await query<{ id: number; name: string }>("SELECT id, name FROM departments ORDER BY name");
  const isAdmin = user.role === "admin";

  return (
    <>
      <PageHeader title="Employee directory" subtitle={`${people.length} people${q ? ` matching “${q}”` : ""}`}
        actions={isAdmin ? <EmployeeAdmin departments={departments} managers={people.filter((p) => p.role !== "employee").map((p) => ({ id: p.id, name: p.name }))} /> : undefined} />
      <form className="card mb-5 flex flex-wrap items-end gap-3 p-4">
        <div className="relative min-w-[240px] flex-1">
          <label className="label" htmlFor="q">Search</label>
          <Search className="pointer-events-none absolute bottom-2.5 left-3 h-4 w-4 text-accent" />
          <input id="q" name="q" defaultValue={q} className="input pl-9" placeholder="Name, ID, title or project" />
        </div>
        <div className="min-w-[180px]">
          <label className="label" htmlFor="dept">Department</label>
          <select id="dept" name="dept" defaultValue={dept ?? ""} className="input">
            <option value="">All</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <button className="btn-primary">Search</button>
        {(q || dept) && <Link href="/directory" className="btn-ghost">Clear</Link>}
      </form>
      {people.length === 0 ? <Card><Empty title="No one found" icon={<Users className="h-6 w-6" />}>Try a different name or project.</Empty></Card> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {people.map((p) => (
            <section key={p.id} className={cx("card p-5", !p.active && "opacity-60")}>
              <div className="flex items-start gap-3">
                <Avatar name={p.name} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{p.name}</div>
                  <div className="truncate text-xs text-accent">{p.title}</div>
                  <div className="text-xs text-subtle">{p.emp_code} · {p.location}</div>
                </div>
                <span className={cx("chip", p.role === "admin" ? "bg-accent/15 text-accent" : p.role === "manager" ? "bg-info/15 text-info" : "bg-elev text-muted")}>{p.active ? p.role : "inactive"}</span>
              </div>
              <dl className="mt-4 space-y-1 text-xs">
                <div className="flex justify-between gap-2"><dt className="text-subtle">Department</dt><dd className="truncate">{p.department ?? "—"}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-subtle">Reports to</dt><dd className="truncate">{p.manager ?? "—"}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-subtle">Email</dt><dd className="truncate">{p.email}</dd></div>
              </dl>
              <div className="mt-3 flex flex-wrap gap-1">{p.projects.map((c) => <span key={c} className="chip bg-elev text-muted">{c}</span>)}</div>
              {isAdmin && <div className="mt-3"><EmployeeAdmin departments={departments} managers={people.filter((m) => m.role !== "employee" && m.id !== p.id).map((m) => ({ id: m.id, name: m.name }))} employee={p} /></div>}
            </section>
          ))}
        </div>
      )}
    </>
  );
}
