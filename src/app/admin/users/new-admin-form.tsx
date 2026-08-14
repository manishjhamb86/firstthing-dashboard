"use client";

import { useActionState, useState } from "react";
import type { AdminPermission } from "@prisma/client";
import { createAdminUser } from "./admin-actions";

async function action(_prev: string | undefined, formData: FormData) {
  const permissions = formData.getAll("permissions") as AdminPermission[];
  const result = await createAdminUser({
    email: formData.get("email") as string,
    name: formData.get("name") as string,
    password: formData.get("password") as string,
    permissions,
  });
  return result.error;
}

// Controlled inputs — see login-form.tsx for the full React 19
// form-reset-on-submit finding this works around.
export function NewAdminForm() {
  const [error, formAction, pending] = useActionState(action, undefined);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [manageAdmins, setManageAdmins] = useState(false);
  const [manageUsers, setManageUsers] = useState(false);

  return (
    <form action={formAction} className="space-y-3 max-w-md bg-white border border-black/5 rounded-2xl p-6">
      <p className="text-sm font-semibold mb-1">New admin</p>
      <input
        name="name"
        placeholder="Name"
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full border rounded-lg p-2 text-sm"
      />
      <input
        name="email"
        type="email"
        placeholder="Email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full border rounded-lg p-2 text-sm"
      />
      <input
        name="password"
        type="password"
        placeholder="Password (min 8 characters)"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full border rounded-lg p-2 text-sm"
      />
      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="permissions"
            value="manage_admins"
            checked={manageAdmins}
            onChange={(e) => setManageAdmins(e.target.checked)}
          />{" "}
          Manage admins
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="permissions"
            value="manage_users"
            checked={manageUsers}
            onChange={(e) => setManageUsers(e.target.checked)}
          />{" "}
          Manage users
        </label>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60"
      >
        {pending ? "Creating…" : "Create admin"}
      </button>
    </form>
  );
}
