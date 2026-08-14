"use client";

import { useActionState, useState } from "react";
import { createSociety } from "../actions";
import { Card, Field } from "@/components/ui";

type FormState = { error?: string; duplicateOf?: string } | undefined;

async function action(_prev: FormState, formData: FormData): Promise<FormState> {
  const result = await createSociety({
    name: formData.get("name") as string,
    location: formData.get("location") as string,
    flatCount: Number(formData.get("flatCount")),
    confirmDuplicate: formData.get("confirmDuplicate") === "true",
  });
  // createSociety redirects on success, so reaching here means an error.
  return result;
}

// Controlled inputs — React 19 resets uncontrolled fields after every
// submission including a failed one, which would otherwise wipe everything
// the operator typed right as the duplicate-review prompt appears (see
// login-form.tsx's comment for the full finding).
export function NewSocietyForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, undefined);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [flatCount, setFlatCount] = useState("");
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);

  return (
    <Card className="max-w-md p-6">
      <form action={formAction} className="space-y-5">
        <Field label="Society name" htmlFor="name">
          <input
            id="name"
            name="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="field"
          />
        </Field>
        <Field label="Location" htmlFor="location">
          <input
            id="location"
            name="location"
            required
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="field"
          />
        </Field>
        <Field label="Flat count" htmlFor="flatCount">
          <input
            id="flatCount"
            name="flatCount"
            type="number"
            min={1}
            required
            value={flatCount}
            onChange={(e) => setFlatCount(e.target.value)}
            className="field"
          />
        </Field>

        {state?.error && (
          <div
            className="rounded-[var(--r-md)] border p-4 text-sm"
            style={{ borderColor: "var(--warn-line)", background: "var(--warn-bg)" }}
          >
            <p className="mb-2" style={{ color: "var(--warn-fg)" }}>
              {state.error}
            </p>
            {state.duplicateOf && (
              <label className="flex items-center gap-2" style={{ color: "var(--warn-fg)" }}>
                <input
                  type="checkbox"
                  name="confirmDuplicate"
                  value="true"
                  checked={confirmDuplicate}
                  onChange={(e) => setConfirmDuplicate(e.target.checked)}
                />
                This is a genuinely different society — create it anyway
              </label>
            )}
          </div>
        )}

        <button type="submit" disabled={pending} className="btn-primary w-full">
          {pending ? "Creating…" : "Create society"}
        </button>
      </form>
    </Card>
  );
}
