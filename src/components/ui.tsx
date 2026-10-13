import clsx from "clsx";
import type { ReactNode } from "react";

export const cx = clsx;

const STATUS: Record<string, { label: string; cls: string; dot: string }> = {
  draft: { label: "Draft", cls: "bg-subtle/15 text-muted", dot: "bg-subtle" },
  submitted: { label: "Submitted", cls: "bg-info/15 text-info", dot: "bg-info" },
  approved: { label: "Approved", cls: "bg-ok/15 text-ok", dot: "bg-ok" },
  rejected: { label: "Changes requested", cls: "bg-bad/15 text-bad", dot: "bg-bad" },
  overdue: { label: "Overdue", cls: "bg-warn/15 text-warn", dot: "bg-warn" },
  missing: { label: "Not started", cls: "bg-subtle/10 text-subtle", dot: "bg-subtle/60" },
};

export function StatusBadge({ status, className }: { status: string | null; className?: string }) {
  const s = STATUS[status ?? "missing"] ?? STATUS.missing;
  return (
    <span className={cx("chip", s.cls, className)}>
      <span className={cx("h-1.5 w-1.5 rounded-full", s.dot)} aria-hidden />
      {s.label}
    </span>
  );
}

const AVATAR_COLORS = ["#f97316", "#38bdf8", "#a78bfa", "#34d399", "#f472b6", "#facc15", "#60a5fa", "#fb7185"];

export function Avatar({ name, size = 32, className }: { name: string; size?: number; className?: string }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
  const color = AVATAR_COLORS[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR_COLORS.length];
  return (
    <span
      className={cx("inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-[#0b0c10] ring-2 ring-card", className)}
      style={{ width: size, height: size, background: color, fontSize: size * 0.38 }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

export function AvatarStack({ names, max = 4 }: { names: string[]; max?: number }) {
  return (
    <div className="flex -space-x-2">
      {names.slice(0, max).map((n) => <Avatar key={n} name={n} size={28} />)}
      {names.length > max && (
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-elev text-[11px] font-semibold text-muted ring-2 ring-card">
          +{names.length - max}
        </span>
      )}
    </div>
  );
}

export function Card({ title, subtitle, action, children, className, bodyClass }: {
  title?: ReactNode; subtitle?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; bodyClass?: string;
}) {
  return (
    <section className={cx("card", className)}>
      {(title || action) && (
        <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
          <div>
            {title && <h2 className="text-[15px] font-semibold text-fg">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={cx("p-5", bodyClass)}>{children}</div>
    </section>
  );
}

export function Kpi({ label, value, unit, hint, tone = "default", icon, href }: {
  label: string; value: ReactNode; unit?: string; hint?: ReactNode; tone?: "default" | "accent" | "ok" | "warn" | "bad" | "info"; icon?: ReactNode; href?: string;
}) {
  const toneCls = {
    default: "text-fg", accent: "text-accent", ok: "text-ok", warn: "text-warn", bad: "text-bad", info: "text-info",
  }[tone];
  const iconBg = {
    default: "bg-elev text-muted", accent: "bg-accent/15 text-accent", ok: "bg-ok/15 text-ok", warn: "bg-warn/15 text-warn", bad: "bg-bad/15 text-bad", info: "bg-info/15 text-info",
  }[tone];
  const inner = (
    <div className="card group flex h-full flex-col gap-3 p-4 transition hover:border-accent/30">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted">{label}</span>
        {icon && <span className={cx("flex h-8 w-8 items-center justify-center rounded-lg", iconBg)}>{icon}</span>}
      </div>
      <div className={cx("text-2xl font-semibold tabular-nums tracking-tight", toneCls)}>
        {value}
        {unit && <span className="ml-1 text-sm font-medium text-muted">{unit}</span>}
      </div>
      {hint && <div className="text-xs text-subtle">{hint}</div>}
    </div>
  );
  return href ? <a href={href} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 rounded-2xl">{inner}</a> : inner;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-fg sm:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Empty({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      {icon && <div className="mb-1 text-subtle">{icon}</div>}
      <p className="text-sm font-medium text-fg">{title}</p>
      {children && <div className="max-w-sm text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Progress({ value, max = 100, tone }: { value: number; max?: number; tone?: string }) {
  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  const color = tone ?? (pct >= 80 ? "rgb(var(--ok))" : pct >= 50 ? "rgb(var(--warn))" : "rgb(var(--bad))");
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-elev" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function fmtH(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, "");
}

export function Pct({ value, target }: { value: number; target?: number }) {
  const tone = target === undefined ? "text-fg" : value >= target ? "text-ok" : value >= target * 0.75 ? "text-warn" : "text-bad";
  return <span className={cx("tabular-nums font-medium", tone)}>{value.toFixed(1)}%</span>;
}
