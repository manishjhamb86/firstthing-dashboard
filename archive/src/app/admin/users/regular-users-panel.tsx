"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Role } from "@prisma/client";
import StatusChip, { type StatusTone } from "@/components/shell/StatusChip";
import EmptyState from "@/components/shell/EmptyState";
import { createUser, deleteUser, resetUserPassword, updateUser } from "./actions";

export type UserRow = {
  id: string;
  email: string | null;
  role: Role;
  isActive: boolean;
  societyId: number | null;
  societyName: string | null;
  createdAt: string;
};

type Society = { id: number; name: string };

const inputClass =
  "w-full rounded-[10px] border border-border bg-card px-3.5 py-2.5 text-sm text-ink placeholder:text-m2 focus:outline-none";

const ROLE_LABELS: Record<Role, string> = {
  customer: "Customer",
  inspection: "Inspector",
  socmgr: "Society Manager",
};

function roleTone(role: Role): StatusTone {
  if (role === "customer") return "info";
  if (role === "inspection") return "warning";
  return "neutral"; // socmgr
}

export default function RegularUsersPanel({ users, societies }: { users: UserRow[]; societies: Society[] }) {
  const router = useRouter();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("customer");
  const [societyId, setSocietyId] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  function resetForm() {
    setEditingId(null);
    setEmail("");
    setPassword("");
    setRole("customer");
    setSocietyId("");
    setIsActive(true);
  }

  function editUser(user: UserRow) {
    setEditingId(user.id);
    setEmail(user.email ?? "");
    setPassword("");
    setRole(user.role);
    setSocietyId(user.societyId ? String(user.societyId) : "");
    setIsActive(user.isActive);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSave() {
    setSaving(true);
    try {
      if (editingId) {
        await updateUser({
          id: editingId,
          role,
          societyId: societyId ? Number(societyId) : null,
          isActive,
        });
        if (password) {
          const pwResult = await resetUserPassword({ id: editingId, password });
          if (!pwResult.success) {
            alert(pwResult.error);
            return;
          }
        }
        alert("User updated");
      } else {
        const result = await createUser({
          email,
          password,
          role,
          societyId: societyId ? Number(societyId) : null,
        });
        if (!result.success) {
          alert(result.error);
          return;
        }
        alert("User created");
      }
      resetForm();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this user account?")) return;
    await deleteUser(id);
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
        <input
          type="password"
          placeholder={editingId ? "New password (leave blank to keep current)" : "Password"}
          className={inputClass}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <select className={inputClass} value={role} onChange={(e) => setRole(e.target.value as Role)}>
          {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
        <select className={inputClass} value={societyId} onChange={(e) => setSocietyId(e.target.value)}>
          <option value="">No society</option>
          {societies.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

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
            {saving ? "Saving..." : editingId ? "Update User" : "Create User"}
          </button>
          {editingId && (
            <button onClick={resetForm} className="rounded-[9px] border border-border px-4 py-2.5 text-sm font-semibold text-m1">
              Cancel Edit
            </button>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="border-b border-border px-5 py-3.5 text-sm font-bold text-ink">User Accounts</div>

        <div className="hidden grid-cols-[1.5fr_1fr_1fr_1.2fr_1fr_.8fr] gap-2 bg-card-2 px-5 py-2.5 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-m2 sm:grid">
          <div>Email</div>
          <div>Role</div>
          <div>Status</div>
          <div>Society</div>
          <div>Created</div>
          <div />
        </div>

        {users.length === 0 && (
          <div className="p-6">
            <EmptyState title="No users found" />
          </div>
        )}

        {users.map((user) => (
          <div
            key={user.id}
            className="grid grid-cols-1 gap-2 border-t border-border px-5 py-3.5 sm:grid-cols-[1.5fr_1fr_1fr_1.2fr_1fr_.8fr] sm:items-center"
          >
            <div className="text-xs font-semibold text-ink">{user.email ?? "—"}</div>
            <div>
              <StatusChip tone={roleTone(user.role)}>{ROLE_LABELS[user.role]}</StatusChip>
            </div>
            <div>
              <StatusChip tone={user.isActive ? "good" : "neutral"}>
                {user.isActive ? "ACTIVE" : "INACTIVE"}
              </StatusChip>
            </div>
            <div className="text-xs text-m1">{user.societyName ?? "—"}</div>
            <div className="text-xs text-m1">{new Date(user.createdAt).toLocaleDateString()}</div>
            <div className="flex items-center gap-4 sm:justify-end">
              <button onClick={() => editUser(user)} className="text-xs font-semibold text-ac">
                Edit
              </button>
              <button
                onClick={() => handleDelete(user.id)}
                className="text-xs font-semibold"
                style={{ color: "var(--bf)" }}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
