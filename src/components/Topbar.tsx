import Link from "next/link";
import { Bell, ChevronsRight, Search } from "lucide-react";
import type { SessionUser } from "@/lib/auth";
import { Avatar } from "./ui";

const ROLE_LABEL = { employee: "Employee", manager: "Manager", admin: "Resource Admin" } as const;

export function Topbar({ user, unread }: { user: SessionUser; unread: number }) {
  return (
    <header className="sticky top-0 z-20 -mx-4 mb-6 flex items-center gap-3 bg-bg/80 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 md:mx-0 md:px-0">
      <div className="hidden items-center gap-2 text-muted md:flex">
        <ChevronsRight className="h-4 w-4" />
        <span className="text-sm">Project Resource Management</span>
        <span className="text-subtle">·</span>
        <span className="text-sm text-fg">Utilization Tracker</span>
      </div>
      <form action="/directory" className="relative ml-12 flex-1 md:ml-auto md:max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-accent" />
        <input name="q" placeholder="Search people or projects" aria-label="Search people or projects" className="input rounded-full pl-9" />
      </form>
      <Link href="/notifications" className="relative flex h-10 w-10 items-center justify-center rounded-full border hairline bg-card text-muted hover:text-fg" aria-label={`Notifications (${unread} unread)`}>
        <Bell className="h-[18px] w-[18px]" strokeWidth={1.8} />
        {unread > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-accent px-1 text-center text-[10px] font-semibold leading-[18px] text-white">{unread}</span>}
      </Link>
      <div className="flex items-center gap-3 rounded-full border hairline bg-card py-1 pl-1 pr-4">
        <Avatar name={user.name} size={32} />
        <div className="hidden leading-tight sm:block">
          <div className="text-sm font-medium text-fg">{user.name}</div>
          <div className="text-[11px] text-muted">{ROLE_LABEL[user.role]} · {user.emp_code}</div>
        </div>
      </div>
    </header>
  );
}
