import { db } from "@/lib/db";
import { Card, EmptyState, PageHeader, StatusChip } from "@/components/ui";
import { AdminRow } from "./admin-row";
import { NewAdminForm } from "./new-admin-form";
import { requireAdminPage } from "@/lib/admin-permissions";

// FEAT-086: internal (AdminUser) account management. Gated to admins who
// hold `manage_admins` — checked here for what to render, and independently
// re-checked inside every Server Action in admin-actions.ts (FEAT-086-AC-4:
// "including to ordinary admins" — the UI check alone is never the gate).
export default async function UsersPage() {
  const session = await requireAdminPage();

  const canManageAdmins = session.user.adminPermissions?.includes("manage_admins") ?? false;
  const admins = await db.adminUser.findMany({ orderBy: { createdAt: "asc" } });

  const active = admins.filter((a) => a.isActive);
  // createAdmin/updateAdmin/deleteAdmin already refuse to remove the last
  // active manage_admins holder — a self-lockout nobody can undo from inside
  // the product. The screen never said how close to that edge it was, so the
  // refusal could only ever arrive as a surprise mid-edit.
  const adminManagers = active.filter((a) => a.permissions.includes("manage_admins")).length;
  const billingReleasers = active.filter((a) => a.permissions.includes("release_billing")).length;

  return (
    <>
      <PageHeader
        title="Admin users"
        subtitle="Internal ops/support/management accounts."
        chip={
          canManageAdmins && adminManagers === 1 ? (
            <StatusChip tone="warn">One admin manager</StatusChip>
          ) : undefined
        }
      />

      {canManageAdmins && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6 max-w-4xl">
          {[
            { label: "Admin accounts", value: admins.length, detail: `${active.length} active` },
            {
              label: "Can manage admins",
              value: adminManagers,
              detail: adminManagers === 1 ? "the last one — cannot be removed" : "hold manage_admins",
            },
            {
              label: "Can release billing",
              value: billingReleasers,
              detail: billingReleasers === 0 ? "nobody can release a month" : "hold release_billing",
            },
            {
              label: "Deactivated",
              value: admins.length - active.length,
              detail: admins.length === active.length ? "none" : "cannot sign in",
            },
          ].map((f) => (
            <div key={f.label} className="card p-4">
              <p className="lbl mb-1.5 min-h-[2.8em]">{f.label}</p>
              <p className="num text-[20px] font-semibold leading-none">{f.value}</p>
              <p className="mt-1.5 text-xs text-[var(--text-subtle)]">{f.detail}</p>
            </div>
          ))}
        </div>
      )}

      {!canManageAdmins ? (
        <p className="max-w-xl text-[var(--text-muted)]">
          You don&apos;t have the <code>manage_admins</code> permission, so admin account management isn&apos;t
          available to you.
        </p>
      ) : (
        <div className="space-y-6 max-w-4xl">
          {admins.length === 0 ? (
            <EmptyState title="No admin accounts">Create the first internal account below.</EmptyState>
          ) : (
            <Card className="p-6">
              <ul className="space-y-4">
                {admins.map((a) => (
                  <AdminRow key={a.id} admin={a} isSelf={a.id === session.user.id} />
                ))}
              </ul>
            </Card>
          )}

          <NewAdminForm />
        </div>
      )}
    </>
  );
}
