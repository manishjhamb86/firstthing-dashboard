import { resolveTheme } from "@/lib/resolve-theme";
import { resolveAdmin } from "@/lib/admin-permissions";
import { AppShell } from "@/components/app-shell";
import { unreadNotificationCount } from "@/lib/notifications";
import { demoModeAvailable } from "@/lib/demo-mode";
import { db } from "@/lib/db";
import { isSuperAdmin } from "@/lib/super-admin";
import type { ApprovalCounts } from "@/components/app-shell";

/**
 * What waits on THIS viewer in each approvals queue (2026-11-19). A count is
 * a promise that the viewer can act on it, so each one follows the queue's
 * own rule: corrections only for the named account; date changes for
 * "Approve date changes", never one's own (the named account may); visits
 * for "Approve visits", never one's own; release for the accountant.
 */
async function approvalCounts(admin: { id: string; email: string | null; permissions: string[] } | null): Promise<ApprovalCounts> {
  if (!admin) return { corrections: 0, dates: 0, visits: 0, release: 0 };
  const perms = admin.permissions;
  const superAdmin = isSuperAdmin(admin.email);
  const zero = Promise.resolve(0);
  const [corrections, dates, visits, release] = await Promise.all([
    superAdmin ? db.pendingApproval.count({ where: { status: "pending" } }) : zero,
    perms.includes("approve_date_changes")
      ? db.dateChangeRequest.count({ where: { status: "pending", ...(superAdmin ? {} : { requestedById: { not: admin.id } }) } })
      : zero,
    perms.includes("approve_visits")
      ? db.customerVisit.count({ where: { status: "pending", voidedAt: null, loggedById: { not: admin.id } } })
      : zero,
    perms.includes("release_billing")
      ? db.monthlyCalculation.count({ where: { source: "invoice", status: "submitted", supersededById: null } })
      : zero,
  ]);
  return { corrections, dates, visits, release };
}

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
  const [theme, admin, unreadCount] = await Promise.all([
    resolveTheme(),
    resolveAdmin(),
    // Read in the layout, not the shell: AppShell is a client component and
    // cannot touch the database. Every admin page renders this layout, so the
    // badge is current on all of them without a per-page call site.
    unreadNotificationCount(),
  ]);
  // The env var decides whether the toggle exists at all; the account's own
  // column decides whether it is on.
  const demoAvailable = demoModeAvailable();
  const demoOn = demoAvailable && admin?.demoMode === true;
  const perms = (admin?.permissions ?? []) as string[];
  // The jump-to search's societies — a few dozen rows, read once per page.
  const [approvals, societies] = await Promise.all([
    approvalCounts(admin ? { id: admin.id, email: admin.email, permissions: perms } : null),
    admin ? db.society.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, location: true } }) : Promise.resolve([]),
  ]);

  return (
    <AppShell
      unreadCount={unreadCount}
      theme={theme}
      email={admin?.email ?? ""}
      demoAvailable={demoAvailable}
      demoMode={demoOn}
      showPipeline={perms.includes("manage_pipeline")}
      showField={perms.includes("manage_survey")}
      showMonitoring={perms.includes("manage_survey")}
      // Tanks are society infrastructure: the same permission that manages
      // societies and their portal accounts manages what those portals see.
      showTanks={perms.includes("manage_users")}
      showMeters={perms.includes("manage_users") || perms.includes("manage_pipeline")}
      // The readings area is readable by anyone who can see a pipeline;
      // ingesting into it needs both permissions (the PER-01 proxy), which
      // each action checks for itself.
      showReadings={perms.includes("manage_pipeline")}
      showCatalog={perms.includes("manage_survey") || perms.includes("manage_pipeline")}
      // Either hat opens billing — ops runs the month, the accountant
      // releases it — which is exactly requireBillingReader's own rule.
      showBilling={perms.includes("manage_pipeline") || perms.includes("release_billing")}
      showUsers={perms.includes("manage_admins")}
      showSupport={perms.includes("manage_users")}
      showFounders={perms.includes("view_founder_dashboard")}
      showVisitApprovals={perms.includes("approve_visits")}
      showRelease={perms.includes("release_billing")}
      approvals={approvals}
      jumpSocieties={societies}
    >
      {children}
    </AppShell>
  );
}
