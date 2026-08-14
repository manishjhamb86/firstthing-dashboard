import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { isPortalRole } from "@/lib/roles";
import { TransferButton } from "./transfer-button";
import { BrandMark } from "@/components/brand-mark";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { resolveTheme } from "@/lib/resolve-theme";

const AUTHORITY_LABEL: Record<string, string> = {
  office_bearer: "Office-bearer",
  committee: "Committee",
  manager: "Manager",
};

// MS-02's demoable outcome, made literal: a society office-bearer/committee/
// manager account logs in and lands on a role-scoped page reading its own
// society's data (INV-05), with one real binding act (FEAT-108-AC-5,
// GATE-04) — transferring the office-bearer designation — available only to
// the account that actually holds it, checked server-side in actions.ts, not
// just by this page choosing not to render the button.
export default async function PortalHomePage() {
  const session = await auth();
  if (!session?.user || !isPortalRole(session.user.role) || !session.user.societyId) {
    redirect("/login");
  }

  const societyId = session.user.societyId;
  const [society, accounts] = await Promise.all([
    db.society.findUnique({ where: { id: societyId } }),
    db.profile.findMany({
      where: { societyId, isActive: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!society) redirect("/login");

  const isOfficeBearer = session.user.role === "office_bearer";
  const theme = await resolveTheme();

  return (
    <div className="min-h-screen p-10">
      <div
        className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 sm:px-6 py-3 mb-8 rounded-[var(--r-lg)]"
        style={{ background: "var(--chrome)", color: "var(--chrome-text)" }}
      >
        <BrandMark variant={theme === "light" ? "light" : "dark"} className="h-7" />
        <ThemeSwitcher current={theme} />
      </div>
      <h1 className="text-2xl font-bold mb-1">{society.name}</h1>
      <p className="mb-8 text-[var(--text-muted)]">
        Signed in as {session.user.email} · {AUTHORITY_LABEL[session.user.role]}
      </p>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-[var(--r-lg)] p-6 max-w-xl">
        <p className="text-sm mb-4 text-[var(--text-muted)]">Portal accounts</p>
        <ul className="space-y-3">
          {accounts.map((account) => {
            const isSelf = account.id === session.user.id;
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
                  <p className="text-sm text-[var(--text-muted)]">
                    {account.portalAuthority ? AUTHORITY_LABEL[account.portalAuthority] : "—"}
                  </p>
                </div>
                {!isTargetOfficeBearer &&
                  (isOfficeBearer ? (
                    <TransferButton profileId={account.id} />
                  ) : (
                    <p className="text-xs text-[var(--text-subtle)]">Only the office-bearer can change this</p>
                  ))}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
