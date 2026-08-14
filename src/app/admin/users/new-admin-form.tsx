"use client";

import { useActionState, useState } from "react";
import type { AdminPermission } from "@prisma/client";
import { createAdminUser } from "./admin-actions";
import { PERMISSION_OPTIONS } from "./permission-options";

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
  const [permissions, setPermissions] = useState<AdminPermission[]>([]);

  function toggle(p: AdminPermission) {
    setPermissions((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  return (
    <form
      action={formAction}
      className="space-y-3 bg-[var(--surface)] border border-[var(--border-subtle)] rounded-[var(--r-lg)] p-6"
    >
      <p className="text-sm font-semibold mb-1">New admin</p>
      <input
        name="name"
        placeholder="Name"
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full border rounded-[var(--r-sm)] p-2 text-sm"
        style={{ borderColor: "var(--field-border)", background: "var(--surface)", color: "var(--text)" }}
      />
      <input
        name="email"
        type="email"
        placeholder="Email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full border rounded-[var(--r-sm)] p-2 text-sm"
        style={{ borderColor: "var(--field-border)", background: "var(--surface)", color: "var(--text)" }}
      />
      <input
        name="password"
        type="password"
        placeholder="Password (min 8 characters)"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full border rounded-[var(--r-sm)] p-2 text-sm"
        style={{ borderColor: "var(--field-border)", background: "var(--surface)", color: "var(--text)" }}
      />
      <div className="flex flex-wrap gap-4 text-sm">
        {PERMISSION_OPTIONS.map((p) => (
          <label key={p.value} className="flex items-center gap-2">
            <input
              type="checkbox"
              name="permissions"
              value={p.value}
              checked={permissions.includes(p.value)}
              onChange={() => toggle(p.value)}
            />{" "}
            {p.label}
          </label>
        ))}
      </div>
      {error && (
        <p className="text-xs" style={{ color: "var(--bad-fg)" }}>
          {error}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn-primary px-4 py-2 text-sm font-semibold disabled:opacity-60">
        {pending ? "Creating…" : "Create admin"}
      </button>
    </form>
  );
}
