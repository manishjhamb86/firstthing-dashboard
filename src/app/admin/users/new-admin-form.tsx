"use client";

import { useActionState, useState } from "react";
import type { AdminPermission } from "@prisma/client";
import { createAdminUser } from "./admin-actions";
import { PERMISSION_OPTIONS } from "./permission-options";
import { Card, CardTitle, ErrorText, Field } from "@/components/ui";

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
    <Card className="p-6">
      <CardTitle>New admin</CardTitle>
      <form action={formAction} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="na-name">
            <input
              id="na-name"
              name="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="field"
            />
          </Field>
          <Field label="Email" htmlFor="na-email">
            <input
              id="na-email"
              name="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="field"
            />
          </Field>
        </div>
        <Field label="Password" htmlFor="na-password" hint="Minimum 8 characters.">
          <input
            id="na-password"
            name="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="field"
          />
        </Field>
        <fieldset>
          <legend className="lbl mb-2">Permissions</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {PERMISSION_OPTIONS.map((p) => (
              <label key={p.value} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="permissions"
                  value={p.value}
                  checked={permissions.includes(p.value)}
                  onChange={() => toggle(p.value)}
                />
                {p.label}
              </label>
            ))}
          </div>
        </fieldset>
        {error && <ErrorText>{error}</ErrorText>}
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? "Creating…" : "Create admin"}
        </button>
      </form>
    </Card>
  );
}
