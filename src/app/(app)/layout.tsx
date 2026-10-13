import { requirePageUser } from "@/lib/auth";
import { pendingApprovalCount, unreadCount } from "@/lib/data";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  const [unread, approvals] = await Promise.all([unreadCount(user.id), pendingApprovalCount(user)]);
  return (
    <div className="min-h-screen">
      <Sidebar role={user.role} counts={{ approvals, notifications: unread }} />
      <div className="px-4 pb-10 sm:px-6 md:pl-[116px] md:pr-8">
        <Topbar user={user} unread={unread} />
        <main id="main" className="mx-auto max-w-[1440px]">{children}</main>
        <footer className="mx-auto mt-10 max-w-[1440px] text-center text-xs text-subtle">
          PRM Utilization Tracker · Demo environment — all people, clients and projects shown are fictional.
        </footer>
      </div>
    </div>
  );
}
