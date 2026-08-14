import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { AdminRow } from "./admin-row";
import { NewAdminForm } from "./new-admin-form";

// FEAT-086: internal (AdminUser) account management. Gated to admins who
// hold `manage_admins` — checked here for what to render, and independently
// re-checked inside every Server Action in admin-actions.ts (FEAT-086-AC-4:
// "including to ordinary admins" — the UI check alone is never the gate).
export default async function UsersPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") redirect("/login");

  const canManageAdmins = session.user.adminPermissions?.includes("manage_admins") ?? false;
  const admins = await db.adminUser.findMany({ orderBy: { createdAt: "asc" } });

  return (
    <>
      <PageHeader title="Admin users" subtitle="Internal ops/support/management accounts." />

      {!canManageAdmins ? (
        <p className="max-w-xl text-[var(--text-muted)]">
          You don&apos;t have the <code>manage_admins</code> permission, so admin account management isn&apos;t
          available to you.
        </p>
      ) : (
        <div className="space-y-6 max-w-2xl">
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
