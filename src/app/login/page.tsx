import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { LoginForm } from "./LoginForm";
import { Logo } from "@/components/Sidebar";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  const demo = process.env.DEMO_MODE === "true";
  const personas = demo
    ? await query<{ name: string; email: string; role: string; title: string }>(
        `SELECT name, email, role, title FROM employees WHERE active AND email LIKE '%@demo.prm.local'
          ORDER BY CASE role WHEN 'employee' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END, name`,
      )
    : [];
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(1200px_600px_at_-10%_-10%,rgba(255,128,41,0.35),transparent_60%),radial-gradient(900px_600px_at_110%_110%,rgba(86,140,255,0.35),transparent_60%)]" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <div className="flex items-center gap-3"><Logo /><span className="text-lg font-semibold">PRM</span></div>
          <div className="max-w-lg">
            <h1 className="text-4xl font-semibold leading-tight tracking-tight">Project Resource Management<br /><span className="text-accent">Utilization Tracker</span></h1>
            <p className="mt-4 text-muted">Log hours in seconds, route timesheets for approval, and see real-time utilization across every project and team.</p>
            <ul className="mt-8 grid grid-cols-3 gap-3 text-sm">
              {[["Weekly", "timesheets"], ["1-click", "approvals"], ["Live", "utilization"]].map(([a, b]) => (
                <li key={a} className="card p-4"><div className="text-lg font-semibold">{a}</div><div className="text-muted">{b}</div></li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-subtle">© LatentView Analytics · Internal use only</p>
        </div>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden"><Logo size={40} /><span className="text-lg font-semibold">PRM</span></div>
          <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
          <p className="mt-1 text-sm text-muted">Use your company credentials. Single sign-on can be enabled by your administrator.</p>
          <LoginForm personas={personas} />
        </div>
      </div>
    </div>
  );
}
