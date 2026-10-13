import { requirePageUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { NotificationList } from "./NotificationList";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const user = await requirePageUser();
  const items = await query<{ id: number; type: string; title: string; body: string; link: string | null; read_at: string | null; created_at: string }>(
    "SELECT id, type, title, body, link, read_at, created_at FROM notifications WHERE recipient_id = $1 ORDER BY created_at DESC LIMIT 200",
    [user.id],
  );
  return (
    <>
      <PageHeader title="Notifications" subtitle={`${items.filter((i) => !i.read_at).length} unread`} />
      <NotificationList items={items} />
    </>
  );
}
