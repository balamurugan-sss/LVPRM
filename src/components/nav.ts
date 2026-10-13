import type { Role } from "@/lib/auth";

export type NavItem = { href: string; label: string; icon: string; roles?: Role[]; badge?: "approvals" | "notifications" };

export const NAV: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: "home" },
  { href: "/timesheet", label: "Timesheet", icon: "clock" },
  { href: "/history", label: "History", icon: "history" },
  { href: "/approvals", label: "Approvals", icon: "check", roles: ["manager", "admin"], badge: "approvals" },
  { href: "/reports/employees", label: "People", icon: "chart", roles: ["manager", "admin"] },
  { href: "/reports/projects", label: "Projects", icon: "folder", roles: ["manager", "admin"] },
  { href: "/allocation", label: "Allocation", icon: "layers" },
  { href: "/directory", label: "Directory", icon: "users" },
  { href: "/notifications", label: "Alerts", icon: "bell", badge: "notifications" },
  { href: "/admin", label: "Admin", icon: "settings", roles: ["admin"] },
];
