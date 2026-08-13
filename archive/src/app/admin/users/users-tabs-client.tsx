"use client";

import { useState } from "react";
import EmptyState from "@/components/shell/EmptyState";
import AdminUsersPanel, { type AdminRow } from "./admin-users-panel";
import RegularUsersPanel, { type UserRow } from "./regular-users-panel";

type Society = { id: number; name: string };

export default function UsersTabsClient({
  canManageAdmins,
  canManageUsers,
  currentAdminId,
  admins,
  users,
  societies,
}: {
  canManageAdmins: boolean;
  canManageUsers: boolean;
  currentAdminId: string;
  admins: AdminRow[];
  users: UserRow[];
  societies: Society[];
}) {
  const [tab, setTab] = useState<"users" | "admins">(canManageUsers ? "users" : "admins");

  if (!canManageAdmins && !canManageUsers) {
    return (
      <EmptyState
        title="No access to user management"
        description="Your admin account doesn't have the manage_admins or manage_users permission."
      />
    );
  }

  const showTabs = canManageAdmins && canManageUsers;

  return (
    <div className="w-full max-w-5xl space-y-5">
      {showTabs && (
        <div className="flex gap-2 border-b border-border">
          <TabButton active={tab === "users"} onClick={() => setTab("users")}>
            Users
          </TabButton>
          <TabButton active={tab === "admins"} onClick={() => setTab("admins")}>
            Admin Users
          </TabButton>
        </div>
      )}

      {(tab === "users" || !showTabs) && canManageUsers && (
        <RegularUsersPanel users={users} societies={societies} />
      )}

      {(tab === "admins" || !showTabs) && canManageAdmins && (
        <AdminUsersPanel admins={admins} currentAdminId={currentAdminId} />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="border-b-2 px-3.5 py-2.5 text-sm font-semibold transition-colors"
      style={{
        borderColor: active ? "var(--ac)" : "transparent",
        color: active ? "var(--ink)" : "var(--m2)",
      }}
    >
      {children}
    </button>
  );
}
