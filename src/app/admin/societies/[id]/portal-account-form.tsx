"use client";

import { useActionState, useState } from "react";
import { createPortalAccount } from "./portal-actions";
import { ErrorText, Field } from "@/components/ui";
import { PORTAL_AUTHORITY_LABEL } from "@/lib/status-maps";

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
export function PortalAccountForm({
  societyId,
  onSaved,
}: {
  societyId: string;
  onSaved?: () => void;
}) {
  const [error, formAction, pending] = useActionState(action, undefined);
  const [submitted, setSubmitted] = useState(false);

  // useActionState gives no success signal, so "was pending, is no longer,
  // and returned no error" is the completion — checked during render rather
  // than in an effect, per this project's set-state-in-effect rule.
  const [wasPending, setWasPending] = useState(false);
  if (pending !== wasPending) {
    setWasPending(pending);
    if (!pending && submitted && !error) {
      setSubmitted(false);
      onSaved?.();
    }
  }
  const [name, setName] = useState("");
  const [portalAuthority, setPortalAuthority] = useState<"office_bearer" | "committee" | "manager">(
    "office_bearer",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <form action={formAction} onSubmit={() => setSubmitted(true)} className="space-y-4">
      <input type="hidden" name="societyId" value={societyId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor={`pa-name-${societyId}`}>
          <input
            id={`pa-name-${societyId}`}
            name="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="field"
          />
        </Field>
        <Field label="Authority" htmlFor={`pa-authority-${societyId}`}>
          <select
            id={`pa-authority-${societyId}`}
            name="portalAuthority"
            required
            value={portalAuthority}
            onChange={(e) => setPortalAuthority(e.target.value as typeof portalAuthority)}
            className="field"
          >
            {Object.entries(PORTAL_AUTHORITY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Email" htmlFor={`pa-email-${societyId}`}>
        <input
          id={`pa-email-${societyId}`}
          name="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="field"
        />
      </Field>
      <Field label="Password" htmlFor={`pa-password-${societyId}`} hint="Minimum 8 characters.">
        <input
          id={`pa-password-${societyId}`}
          name="password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="field"
        />
      </Field>
      {error && <ErrorText>{error}</ErrorText>}
      <button type="submit" disabled={pending} className="btn-secondary">
        {pending ? "Creating…" : "Create portal account"}
      </button>
    </form>
  );
}
