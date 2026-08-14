import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { STALE_SESSION_EXIT } from "@/lib/admin-permissions";
import { resolvePortalViewer } from "@/lib/portal-viewer";
import { TransferButton } from "./transfer-button";
import { BrandMark } from "@/components/brand-mark";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { SignOutButton } from "@/components/sign-out-button";
import { resolveTheme } from "@/lib/resolve-theme";
import { Card, CardTitle, PageHeader, StatusChip } from "@/components/ui";
import { PORTAL_AUTHORITY_LABEL } from "@/lib/status-maps";

// MS-02's demoable outcome, made literal: a society office-bearer/committee/
// manager account logs in and lands on a role-scoped page reading its own
// society's data (INV-05), with one real binding act (FEAT-108-AC-5,
// GATE-04) — transferring the office-bearer designation — available only to
// the account that actually holds it, checked server-side in actions.ts, not
// just by this page choosing not to render the button.
export default async function PortalHomePage() {
  // Resolved from the Profile row, not the token — see src/lib/portal-viewer.ts:
  // the authority this page renders for must be the one in force now, or the
  // screen and the Server Action disagree about who may act.
  const viewer = await resolvePortalViewer();
  if (!viewer?.societyId) redirect(STALE_SESSION_EXIT);

  const societyId = viewer.societyId;
  const [society, accounts] = await Promise.all([
    db.society.findUnique({ where: { id: societyId } }),
    db.profile.findMany({
      where: { societyId, isActive: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!society) redirect("/login");

  const isOfficeBearer = viewer.role === "office_bearer";
  const theme = await resolveTheme();

  return (
    <div className="min-h-screen">
      <div
        className="sticky top-0 z-20"
        style={{ background: "var(--chrome)", borderBottom: "1px solid var(--chrome-border)" }}
      >
        <div className="mx-auto max-w-3xl flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-5 sm:px-8 py-3">
          <BrandMark variant={theme === "light" ? "light" : "dark"} className="h-7" />
          <div className="flex items-center gap-4">
            <ThemeSwitcher current={theme} />
            <SignOutButton className="text-sm font-medium hover:opacity-80" style={{ color: "var(--chrome-muted)" }} />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl p-5 sm:p-8">
        <PageHeader
          title={society.name}
          subtitle={`Signed in as ${viewer.email} · ${PORTAL_AUTHORITY_LABEL[viewer.role]}`}
        />

        <Card className="p-6">
          <CardTitle>Portal accounts</CardTitle>
          <ul className="space-y-3">
            {accounts.map((account) => {
              const isSelf = account.id === viewer.id;
              const isTargetOfficeBearer = account.portalAuthority === "office_bearer";
              return (
                <li
                  key={account.id}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-[var(--border-subtle)] pt-3 first:border-t-0 first:pt-0"
                >
                  <div>
                    <p className="font-medium">
                      {account.name ?? account.email}{" "}
                      {isSelf && <span className="text-[var(--text-subtle)]">(you)</span>}
                    </p>
                    <p className="text-sm text-[var(--text-muted)]">{account.email}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {isTargetOfficeBearer ? (
                      <StatusChip tone="ok">Office-bearer</StatusChip>
                    ) : (
                      <StatusChip tone="neu">
                        {account.portalAuthority ? PORTAL_AUTHORITY_LABEL[account.portalAuthority] : "—"}
                      </StatusChip>
                    )}
                    {!isTargetOfficeBearer &&
                      (isOfficeBearer ? (
                        <TransferButton profileId={account.id} />
                      ) : (
                        <p className="text-xs text-[var(--text-subtle)]">Only the office-bearer can change this</p>
                      ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </div>
  );
}
