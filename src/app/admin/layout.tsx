import { auth } from "@/lib/auth";
import { resolveTheme } from "@/lib/resolve-theme";
import { AppShell } from "@/components/app-shell";

// One shell for every /admin route — the sidebar nav from 05a-theme-system
// §3.7, replacing the per-page <AdminNav /> top-bar placeholder. This
// layout only decides what the nav shows; every page below it still runs
// its own auth() + permission check independently (proxy.ts is optimistic-
// only, per AGENTS.md — a layout is not an auth boundary either).
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [theme, session] = await Promise.all([resolveTheme(), auth()]);
  const perms = session?.user.adminPermissions ?? [];

  return (
    <AppShell
      theme={theme}
      email={session?.user.email ?? ""}
      showPipeline={perms.includes("manage_pipeline")}
      showMonitoring={perms.includes("manage_survey")}
      // The readings area is readable by anyone who can see a pipeline;
      // ingesting into it needs both permissions (the PER-01 proxy), which
      // each action checks for itself.
      showReadings={perms.includes("manage_pipeline")}
      showCatalog={perms.includes("manage_survey") || perms.includes("manage_pipeline")}
      showUsers={perms.includes("manage_admins")}
    >
      {children}
    </AppShell>
  );
}
