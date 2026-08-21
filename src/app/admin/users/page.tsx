import Link from "next/link";
import { db } from "@/lib/db";
import { EmptyState, PageHeader, Stat, StatRow, StatusChip } from "@/components/ui";
import { AdminUsersClient } from "./admin-users-client";
import { requireAdminPage } from "@/lib/admin-permissions";

// FEAT-086: internal (AdminUser) account management. Gated to admins who
// hold `manage_admins` — checked here for what to render, and independently
// re-checked inside every Server Action in admin-actions.ts (FEAT-086-AC-4:
// "including to ordinary admins" — the UI check alone is never the gate).
export default async function UsersPage() {
  const session = await requireAdminPage();

  const canManageAdmins = session.user.adminPermissions?.includes("manage_admins") ?? false;
  const admins = await db.adminUser.findMany({ orderBy: [{ deletedAt: "asc" }, { createdAt: "asc" }] });

  // Removed accounts are excluded from every count — they cannot sign in and
  // cannot hold an authority.
  const liveAdmins = admins.filter((a) => !a.deletedAt);
  const active = liveAdmins.filter((a) => a.isActive);
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
        action={
          canManageAdmins ? (
            <Link href="/admin/users?new=1" className="btn-primary">
              Add admin
            </Link>
          ) : undefined
        }
      />

      {canManageAdmins && (
        <StatRow>
          {[
            { label: "Admin accounts", value: liveAdmins.length, detail: `${active.length} active` },
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
              value: liveAdmins.length - active.length,
              detail: liveAdmins.length === active.length ? "none" : "cannot sign in",
            },
          ].map((f) => (
            <Stat key={f.label} label={f.label} value={f.value} detail={f.detail} />
          ))}
        </StatRow>
      )}

      {!canManageAdmins ? (
        <p className="max-w-xl text-[var(--text-muted)]">
          You don&apos;t have the <code>manage_admins</code> permission, so admin account management isn&apos;t
          available to you.
        </p>
      ) : (
        <div className="space-y-6">
          {admins.length === 0 ? (
            <EmptyState title="No admin accounts">Create the first internal account.</EmptyState>
          ) : (
            <AdminUsersClient
              selfId={session.user.id}
              rows={admins.map((a) => ({
                id: a.id,
                email: a.email,
                name: a.name,
                isActive: a.isActive,
                removed: a.deletedAt !== null,
                permissions: a.permissions,
              }))}
            />
          )}
        </div>
      )}
    </>
  );
}
