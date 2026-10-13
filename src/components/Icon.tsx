import {
  Bell, BarChart3, CheckCheck, Clock3, FolderKanban, History, Home, Layers, Settings, Users, type LucideIcon,
} from "lucide-react";

const MAP: Record<string, LucideIcon> = {
  home: Home, clock: Clock3, history: History, check: CheckCheck, chart: BarChart3, folder: FolderKanban,
  layers: Layers, users: Users, bell: Bell, settings: Settings,
};

export function NavIcon({ name, className }: { name: string; className?: string }) {
  const I = MAP[name] ?? Home;
  return <I className={className} strokeWidth={1.8} />;
}
