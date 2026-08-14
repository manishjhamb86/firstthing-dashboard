"use client";

import { useActionState, useState } from "react";
import { createPortalAccount } from "./portal-actions";

async function action(_prev: string | undefined, formData: FormData) {
  const result = await createPortalAccount({
    societyId: formData.get("societyId") as string,
    email: formData.get("email") as string,
    name: formData.get("name") as string,
    password: formData.get("password") as string,
    portalAuthority: formData.get("portalAuthority") as "office_bearer" | "committee" | "manager",
  });
  return result.error;
}

// Controlled inputs — see login-form.tsx for the full React 19
// form-reset-on-submit finding this works around.
export function PortalAccountForm({ societyId }: { societyId: string }) {
  const [error, formAction, pending] = useActionState(action, undefined);
  const [name, setName] = useState("");
  const [portalAuthority, setPortalAuthority] = useState<"office_bearer" | "committee" | "manager">(
    "office_bearer",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <form action={formAction} className="space-y-3 border-t border-black/5 pt-4 mt-4">
      <input type="hidden" name="societyId" value={societyId} />
      <div className="grid grid-cols-2 gap-3">
        <input
          name="name"
          placeholder="Name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="border rounded-lg p-2 text-sm"
        />
        <select
          name="portalAuthority"
          required
          value={portalAuthority}
          onChange={(e) => setPortalAuthority(e.target.value as typeof portalAuthority)}
          className="border rounded-lg p-2 text-sm"
        >
          <option value="office_bearer">Office-bearer</option>
          <option value="committee">Committee</option>
          <option value="manager">Manager</option>
        </select>
      </div>
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
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="text-sm font-semibold text-emerald-700 hover:text-emerald-800 disabled:opacity-60"
      >
        {pending ? "Creating…" : "Create portal account"}
      </button>
    </form>
  );
}
