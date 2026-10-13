"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOut, Menu, X } from "lucide-react";
import { NAV } from "./nav";
import { NavIcon } from "./Icon";
import { cx } from "./ui";
import { ThemeToggle } from "./ThemeToggle";
import type { Role } from "@/lib/auth";

export function Logo({ size = 44 }: { size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-br from-sky-300 to-blue-500 text-[#0b1020] shadow-[0_10px_30px_-10px_rgba(56,189,248,0.6)]"
      style={{ width: size, height: size }}
      aria-label="PRM"
    >
      <svg viewBox="0 0 24 24" width={size * 0.5} height={size * 0.5} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M4 18V6h6a4 4 0 0 1 0 8H4" />
        <path d="M14 18l6-6" />
      </svg>
    </span>
  );
}

export function Sidebar({ role, counts }: { role: Role; counts: { approvals: number; notifications: number } }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  const items = NAV.filter((n) => !n.roles || n.roles.includes(role));

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const list = (
    <nav aria-label="Main" className="flex flex-1 flex-col gap-1.5">
      {items.map((item) => {
        const active = path === item.href || (item.href !== "/dashboard" && path.startsWith(item.href));
        const badge = item.badge ? counts[item.badge] : 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            title={item.label}
            aria-current={active ? "page" : undefined}
            className={cx(
              "group relative flex items-center gap-3 rounded-xl px-2 py-1.5 text-sm transition md:flex-col md:gap-1 md:px-0 md:py-1.5",
              active ? "text-fg" : "text-muted hover:text-fg",
            )}
          >
            <span
              className={cx(
                "flex h-10 w-10 items-center justify-center rounded-xl transition",
                active ? "bg-accent text-white shadow-glow" : "bg-elev/70 group-hover:bg-elev",
              )}
            >
              <NavIcon name={item.icon} className="h-[18px] w-[18px]" />
            </span>
            <span className="md:text-[10px] md:font-medium md:leading-none">{item.label}</span>
            {badge > 0 && (
              <span className="absolute left-9 top-0.5 min-w-[18px] rounded-full bg-bad px-1 text-center text-[10px] font-semibold leading-[18px] text-white md:left-auto md:right-2">
                {badge > 99 ? "99+" : badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );

  const footer = (
    <div className="flex flex-row items-center gap-2 md:flex-col">
      <ThemeToggle />
      <button onClick={logout} title="Sign out" className="flex h-10 w-10 items-center justify-center rounded-xl bg-elev/70 text-muted transition hover:bg-elev hover:text-fg">
        <LogOut className="h-[18px] w-[18px]" strokeWidth={1.8} />
        <span className="sr-only">Sign out</span>
      </button>
    </div>
  );

  return (
    <>
      {/* Desktop rail */}
      <aside className="fixed inset-y-3 left-3 z-30 hidden w-[84px] flex-col items-center gap-6 rounded-3xl border hairline bg-rail py-5 md:flex">
        <Link href="/dashboard" aria-label="Home"><Logo /></Link>
        <div className="scrollbar-thin flex w-full flex-1 flex-col overflow-y-auto px-2">{list}</div>
        {footer}
      </aside>

      {/* Mobile top bar trigger */}
      <button
        onClick={() => setOpen(true)}
        className="fixed left-3 top-3 z-40 flex h-10 w-10 items-center justify-center rounded-xl border hairline bg-rail text-fg md:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col gap-5 overflow-y-auto border-r hairline bg-rail p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3"><Logo size={36} /><span className="font-semibold">PRM</span></div>
              <button onClick={() => setOpen(false)} aria-label="Close menu" className="btn-ghost h-9 w-9 px-0"><X className="h-5 w-5" /></button>
            </div>
            {list}
            {footer}
          </aside>
        </div>
      )}
    </>
  );
}
