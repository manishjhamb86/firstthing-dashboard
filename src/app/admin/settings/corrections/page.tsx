import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdminPage, resolveAdmin } from "@/lib/admin-permissions";
import { isSuperAdmin } from "@/lib/super-admin";
import { Card, CardTitle, PageHeader, StatusChip } from "@/components/ui";
import { formatInstant } from "@/lib/format-date";
import { ToggleForm } from "./toggle-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Data corrections" };

/**
 * One temporary toggle (2026-10-12, user-asked): whether an operations lead
 * may correct a demo's own historical light count outside demo mode. Built
 * to fix one specific batch of wrong records; meant to be switched off
 * again once that cleanup is done, and switched back on only if genuinely
 * needed later — no redeploy either way. Bound to one named account
 * (2026-10-20, user-asked), not the broader ops permission it started on.
 */
export default async function DataCorrectionsPage() {
  await requireAdminPage();
  const actor = await resolveAdmin();
  if (!actor || !isSuperAdmin(actor.email)) redirect("/admin");

  const flag = await db.operationsFlag.findUnique({
    where: { id: "singleton" },
    include: { updatedBy: { select: { name: true, email: true } } },
  });
  const allowed = flag?.allowLiveDemoCountCorrection ?? true;

  return (
    <>
      <PageHeader
        backHref="/admin"
        title="Data corrections"
        subtitle="Temporary, operations-only switches for one-time cleanup work. Off the moment you switch them off, on the moment you switch them back on — no redeploy either way."
      />
      <Card className="max-w-xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Correct a demo&apos;s light count outside demo mode</CardTitle>
            <p className="mt-1 text-[13px]" style={{ color: "var(--text-muted)" }}>
              Lets an operations lead fix a demo&apos;s own recorded light count on a live circuit — the same
              &quot;Change&quot; control that is otherwise only offered in demo mode, with a reason required. Built to
              correct a specific batch of wrong historical counts; switch it off once that is done.
            </p>
          </div>
          <StatusChip tone={allowed ? "ok" : "neu"}>{allowed ? "On" : "Off"}</StatusChip>
        </div>
        {flag?.updatedBy && (
          <p className="mt-2 text-[12px]" style={{ color: "var(--text-subtle)" }}>
            Last changed by {flag.updatedBy.name ?? flag.updatedBy.email}, {formatInstant(flag.updatedAt)}.
          </p>
        )}
        <div className="mt-4">
          <ToggleForm allowed={allowed} />
        </div>
      </Card>
    </>
  );
}
