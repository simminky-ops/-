import { requirePage } from "@/lib/server/auth";
import { getSnapshot } from "@/lib/server/snapshot";
import { buildAlerts } from "@/lib/server/alerts";
import { Shell } from "@/components/shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePage();
  const snap = getSnapshot();
  const alerts = user.role === "EXTERNAL" ? [] : buildAlerts(snap, user).map((a) => ({ level: a.level, category: a.category, title: a.title, link: a.link, dday: a.dday }));
  return (
    <Shell
      user={user}
      projectName={snap.data.settings.project_name}
      baseDate={snap.data.settings.base_date}
      dataVersion={snap.version}
      alerts={alerts}
      canEditBaseDate={user.role === "PM" || user.role === "FINANCE"}
    >
      {children}
    </Shell>
  );
}
