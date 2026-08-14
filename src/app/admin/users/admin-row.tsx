"use client";

import { useState, useTransition } from "react";
import type { AdminPermission } from "@prisma/client";
import { updateAdminUser, deleteAdminUser } from "./admin-actions";
import { PERMISSION_OPTIONS } from "./permission-options";
import { StatusChip } from "@/components/ui";

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
  const [saved, setSaved] = useState(false);

  const dirty =
    isActive !== admin.isActive ||
    permissions.length !== admin.permissions.length ||
    permissions.some((p) => !admin.permissions.includes(p));

  function toggle(p: AdminPermission) {
    setSaved(false);
    setPermissions((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  function save() {
    startTransition(async () => {
      const result = await updateAdminUser({ id: admin.id, name: admin.name ?? "", permissions, isActive });
      setError(result.error);
      setSaved(!result.error);
    });
  }

  return (
    <li className="border-t border-[var(--border-subtle)] pt-4 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div>
          <p className="font-medium">
            {admin.name ?? admin.email} {isSelf && <span className="text-[var(--text-subtle)]">(you)</span>}
          </p>
          <p className="text-sm text-[var(--text-muted)]">{admin.email}</p>
        </div>
        <div className="flex items-center gap-2">
          {!isActive && <StatusChip tone="neu">Inactive</StatusChip>}
          {saved && !dirty && <StatusChip tone="ok">Saved</StatusChip>}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        {PERMISSION_OPTIONS.map((p) => (
          <label key={p.value} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={permissions.includes(p.value)}
              onChange={() => toggle(p.value)}
              disabled={pending}
            />
            {p.label}
          </label>
        ))}
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => {
              setSaved(false);
              setIsActive(e.target.checked);
            }}
            disabled={pending}
          />
          Active
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button onClick={save} disabled={pending || !dirty} className="btn-secondary btn-sm">
          {pending ? "Saving…" : "Save changes"}
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
            className="btn-danger btn-sm"
          >
            Delete
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="text-xs mt-2" style={{ color: "var(--bad-fg)" }}>
          {error}
        </p>
      )}
    </li>
  );
}
