"use client";

import { useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { api } from "@/lib/client";
import { Avatar, cx } from "@/components/ui";

type Persona = { name: string; email: string; role: string; title: string };

export function LoginForm({ personas }: { personas: Persona[] }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn(e?: React.FormEvent, creds?: { email: string; password: string }) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/login", { body: creds ?? { email, password } });
      window.location.href = "/dashboard";
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const groups = ["employee", "manager", "admin"].map((r) => ({ role: r, people: personas.filter((p) => p.role === r) }));

  return (
    <>
      <form onSubmit={signIn} className="mt-6 space-y-4">
        <div>
          <label className="label" htmlFor="email">Work email</label>
          <input id="email" type="email" autoComplete="username" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="current-password" required className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <p role="alert" className="rounded-xl bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
        <button className="btn-primary w-full py-2.5" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Sign in <ArrowRight className="h-4 w-4" /></>}
        </button>
      </form>

      {personas.length > 0 && (
        <div className="mt-8">
          <div className="mb-3 flex items-center gap-3 text-xs text-subtle">
            <span className="h-px flex-1 bg-line/10" />Demo accounts (fictional) · password <code className="text-muted">demo1234</code><span className="h-px flex-1 bg-line/10" />
          </div>
          <div className="space-y-3">
            {groups.map((g) => g.people.length > 0 && (
              <div key={g.role}>
                <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-subtle">{g.role === "admin" ? "Resource manager / admin" : `${g.role}s`}</div>
                <div className="flex flex-wrap gap-2">
                  {g.people.slice(0, g.role === "employee" ? 4 : 3).map((p) => (
                    <button
                      key={p.email}
                      type="button"
                      disabled={busy}
                      onClick={() => signIn(undefined, { email: p.email, password: "demo1234" })}
                      className={cx("flex items-center gap-2 rounded-full border hairline bg-card py-1 pl-1 pr-3 text-left text-xs transition hover:border-accent/40")}
                      title={`${p.title} — sign in as ${p.name}`}
                    >
                      <Avatar name={p.name} size={24} />
                      <span className="font-medium text-fg">{p.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
