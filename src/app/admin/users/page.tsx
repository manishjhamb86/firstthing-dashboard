import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminNav } from "../admin-nav";
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
    <div className="min-h-screen p-10">
      <AdminNav />
      <h1 className="text-2xl font-bold mb-1">Admin users</h1>
      <p className="mb-8 text-[var(--text-muted)]">Internal ops/support/management accounts.</p>

      {!canManageAdmins ? (
        <p className="max-w-xl text-[var(--text-muted)]">
          You don&apos;t have the <code>manage_admins</code> permission, so admin account management isn&apos;t
          available to you.
        </p>
      ) : (
        <div className="space-y-8 max-w-xl">
          {admins.length === 0 ? (
            <div className="border border-dashed border-[var(--border)] rounded-[var(--r-lg)] p-10 text-center">
              <p className="font-semibold">No admin accounts</p>
            </div>
          ) : (
            <ul className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-[var(--r-lg)] p-6 space-y-3">
              {admins.map((a) => (
                <AdminRow key={a.id} admin={a} isSelf={a.id === session.user.id} />
              ))}
            </ul>
          )}

          <NewAdminForm />
        </div>
      )}
    </div>
  );
}
