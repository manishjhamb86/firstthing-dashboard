"use client";

import { useState, useTransition } from "react";
import type { AdminPermission } from "@prisma/client";
import { updateAdminUser, deleteAdminUser } from "./admin-actions";

type Admin = {
  id: string;
  email: string;
  name: string | null;
  permissions: AdminPermission[];
  isActive: boolean;
};

export function AdminRow({ admin, isSelf }: { admin: Admin; isSelf: boolean }) {
  const [permissions, setPermissions] = useState<AdminPermission[]>(admin.permissions);
  const [isActive, setIsActive] = useState(admin.isActive);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();

  function toggle(p: AdminPermission) {
    setPermissions((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  function save() {
    startTransition(async () => {
      const result = await updateAdminUser({ id: admin.id, name: admin.name ?? "", permissions, isActive });
      setError(result.error);
    });
  }

  return (
    <li className="border-t border-[var(--border-subtle)] pt-3 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div>
          <p className="font-medium">
            {admin.name ?? admin.email} {isSelf && <span className="text-[var(--text-subtle)]">(you)</span>}
          </p>
          <p className="text-sm text-[var(--text-muted)]">{admin.email}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={permissions.includes("manage_admins")}
              onChange={() => toggle("manage_admins")}
              disabled={pending}
            />
            Manage admins
          </label>
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={permissions.includes("manage_users")}
              onChange={() => toggle("manage_users")}
              disabled={pending}
            />
            Manage users
          </label>
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              disabled={pending}
            />
            Active
          </label>
          <button
            onClick={save}
            disabled={pending}
            className="font-semibold disabled:opacity-60"
            style={{ color: "var(--accent)" }}
          >
            Save
          </button>
          {!isSelf && (
            <button
              onClick={() =>
                startTransition(async () => {
                  const result = await deleteAdminUser(admin.id);
                  setError(result.error);
                })
              }
              disabled={pending}
              className="text-[var(--text-subtle)] hover:text-[var(--bad-fg)] disabled:opacity-60"
            >
              Delete
            </button>
          )}
        </div>
      </div>
      {error && (
        <p className="text-xs mt-1" style={{ color: "var(--bad-fg)" }}>
          {error}
        </p>
      )}
    </li>
  );
}
