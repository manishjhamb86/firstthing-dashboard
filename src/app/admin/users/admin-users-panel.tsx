"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminPermission } from "@prisma/client";
import StatusChip from "@/components/shell/StatusChip";
import EmptyState from "@/components/shell/EmptyState";
import { createAdmin, deleteAdmin, resetAdminPassword, updateAdmin } from "./admin-actions";

export type AdminRow = {
  id: string;
  email: string;
  name: string | null;
  isActive: boolean;
  permissions: AdminPermission[];
  createdByEmail: string | null;
  createdAt: string;
};

const inputClass =
  "w-full rounded-[10px] border border-border bg-card px-3.5 py-2.5 text-sm text-ink placeholder:text-m2 focus:outline-none";

const PERMISSION_LABELS: Record<AdminPermission, string> = {
  manage_admins: "Manage admins",
  manage_users: "Manage users",
};

export default function AdminUsersPanel({
  admins,
  currentAdminId,
}: {
  admins: AdminRow[];
  currentAdminId: string;
}) {
  const router = useRouter();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [permissions, setPermissions] = useState<AdminPermission[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  function togglePermission(p: AdminPermission) {
    setPermissions((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  function resetForm() {
    setEditingId(null);
    setEmail("");
    setName("");
    setPassword("");
    setPermissions([]);
    setIsActive(true);
  }

  function editAdmin(admin: AdminRow) {
    setEditingId(admin.id);
    setEmail(admin.email);
    setName(admin.name ?? "");
    setPassword("");
    setPermissions(admin.permissions);
    setIsActive(admin.isActive);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSave() {
    setSaving(true);
    try {
      if (editingId) {
        const result = await updateAdmin({ id: editingId, name, permissions, isActive });
        if (!result.success) {
          alert(result.error);
          return;
        }
        if (password) {
          const pwResult = await resetAdminPassword({ id: editingId, password });
          if (!pwResult.success) {
            alert(pwResult.error);
            return;
          }
        }
        alert("Admin updated");
      } else {
        const result = await createAdmin({ email, password, name, permissions });
        if (!result.success) {
          alert(result.error);
          return;
        }
        alert("Admin created");
      }
      resetForm();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this admin account?")) return;
    const result = await deleteAdmin(id);
    if (!result.success) {
      alert(result.error);
      return;
    }
    if (editingId === id) resetForm();
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-6 space-y-3.5">
        <input
          placeholder="Email"
          className={inputClass}
          value={email}
          disabled={!!editingId}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input placeholder="Name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        <input
          type="password"
          placeholder={editingId ? "New password (leave blank to keep current)" : "Password"}
          className={inputClass}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <div className="flex flex-wrap gap-4">
          {(Object.keys(PERMISSION_LABELS) as AdminPermission[]).map((p) => (
            <label key={p} className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={permissions.includes(p)} onChange={() => togglePermission(p)} />
              {PERMISSION_LABELS[p]}
            </label>
          ))}
        </div>

        {editingId && (
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Active
          </label>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-[9px] bg-ac px-4 py-2.5 text-sm font-bold text-onac disabled:opacity-60"
          >
            {saving ? "Saving..." : editingId ? "Update Admin" : "Create Admin"}
          </button>
          {editingId && (
            <button onClick={resetForm} className="rounded-[9px] border border-border px-4 py-2.5 text-sm font-semibold text-m1">
              Cancel Edit
            </button>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="border-b border-border px-5 py-3.5 text-sm font-bold text-ink">Admin Accounts</div>

        <div className="hidden grid-cols-[1.5fr_1.2fr_1fr_1fr_1fr_.8fr] gap-2 bg-card-2 px-5 py-2.5 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-m2 sm:grid">
          <div>Email</div>
          <div>Permissions</div>
          <div>Status</div>
          <div>Created By</div>
          <div>Created</div>
          <div />
        </div>

        {admins.length === 0 && (
          <div className="p-6">
            <EmptyState title="No admin accounts found" />
          </div>
        )}

        {admins.map((admin) => (
          <div
            key={admin.id}
            className="grid grid-cols-1 gap-2 border-t border-border px-5 py-3.5 sm:grid-cols-[1.5fr_1.2fr_1fr_1fr_1fr_.8fr] sm:items-center"
          >
            <div>
              <div className="text-xs font-semibold text-ink">{admin.email}</div>
              {admin.name && <div className="text-[10.5px] text-m2">{admin.name}</div>}
              {admin.id === currentAdminId && <div className="text-[10.5px] text-ac">You</div>}
            </div>
            <div className="flex flex-wrap gap-1">
              {admin.permissions.map((p) => (
                <StatusChip key={p} tone="info">
                  {PERMISSION_LABELS[p]}
                </StatusChip>
              ))}
            </div>
            <div>
              <StatusChip tone={admin.isActive ? "good" : "neutral"}>
                {admin.isActive ? "ACTIVE" : "INACTIVE"}
              </StatusChip>
            </div>
            <div className="text-xs text-m1">{admin.createdByEmail ?? "—"}</div>
            <div className="text-xs text-m1">{new Date(admin.createdAt).toLocaleDateString()}</div>
            <div className="flex items-center gap-4 sm:justify-end">
              <button onClick={() => editAdmin(admin)} className="text-xs font-semibold text-ac">
                Edit
              </button>
              {admin.id !== currentAdminId && (
                <button
                  onClick={() => handleDelete(admin.id)}
                  className="text-xs font-semibold"
                  style={{ color: "var(--bf)" }}
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
