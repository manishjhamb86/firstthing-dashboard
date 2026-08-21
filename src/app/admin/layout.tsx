import { resolveTheme } from "@/lib/resolve-theme";
import { resolveAdmin } from "@/lib/admin-permissions";
import { AppShell } from "@/components/app-shell";
import { demoModeAvailable } from "@/lib/demo-mode";

// One shell for every /admin route — the sidebar nav from 05a-theme-system
// §3.7. This layout only decides what the nav shows; every page below it
// still runs its own permission check independently (proxy.ts is optimistic-
// only, per AGENTS.md — a layout is not an auth boundary either).
//
// Permissions come from resolveAdmin(), NOT from auth()'s JWT (fixed
// 2026-08-17, user-reported: "I don't see a link to the above page").
// PROJECT_CONTEXT's own rule is "the token proves who signed in; the row
// proves what they may do now" — every gate was converted to the DB-resolved
// helper, but this nav was missed. A JWT is minted at login and never
// refreshes, so an account granted manage_pipeline afterwards could open
// /admin/pipeline by URL and pass its check, while the sidebar kept hiding
// the link until the next sign-in. resolveAdmin() is cache()d, so this costs
// nothing beyond the lookup the pages below already make.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [theme, admin] = await Promise.all([resolveTheme(), resolveAdmin()]);
  // The env var decides whether the toggle exists at all; the account's own
  // column decides whether it is on.
  const demoAvailable = demoModeAvailable();
  const demoOn = demoAvailable && admin?.demoMode === true;
  const perms = (admin?.permissions ?? []) as string[];

  return (
    <AppShell
      theme={theme}
      email={admin?.email ?? ""}
      demoAvailable={demoAvailable}
      demoMode={demoOn}
      showPipeline={perms.includes("manage_pipeline")}
      showMonitoring={perms.includes("manage_survey")}
      // The readings area is readable by anyone who can see a pipeline;
      // ingesting into it needs both permissions (the PER-01 proxy), which
      // each action checks for itself.
      showReadings={perms.includes("manage_pipeline")}
      showCatalog={perms.includes("manage_survey") || perms.includes("manage_pipeline")}
      // Either hat opens billing — ops runs the month, the accountant
      // releases it — which is exactly requireBillingReader's own rule.
      showBilling={perms.includes("manage_pipeline") || perms.includes("release_billing")}
      showUsers={perms.includes("manage_admins")}
    >
      {children}
    </AppShell>
  );
}
