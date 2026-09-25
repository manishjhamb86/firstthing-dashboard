"use client";

import { useActionState, useState } from "react";
import { createSociety } from "../actions";
import { Card, Field } from "@/components/ui";
import { BackdateField } from "@/components/backdate-field";
import { FmCompanyPicker } from "@/components/fm-company-picker";

type FormState = { error?: string; duplicateOf?: string } | undefined;

async function action(_prev: FormState, formData: FormData): Promise<FormState> {
  const result = await createSociety({
    name: formData.get("name") as string,
    location: formData.get("location") as string,
    flatCount: Number(formData.get("flatCount")),
    createdOn: (formData.get("createdOn") as string) || undefined,
    fmCompanyId: (formData.get("fmCompanyId") as string) || undefined,
    fmSince: (formData.get("fmSince") as string) || undefined,
  });
  // createSociety redirects on success, so reaching here means an error.
  return result;
}

// Controlled inputs — React 19 resets uncontrolled fields after every
// submission including a failed one, which would otherwise wipe everything
// the operator typed right as the duplicate-review prompt appears (see
// login-form.tsx's comment for the full finding).
export function NewSocietyForm({ demoMode = false, fmCompanies = [] }: { demoMode?: boolean; fmCompanies?: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, undefined);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [flatCount, setFlatCount] = useState("");
  const [createdOn, setCreatedOn] = useState("");
  const [fmCompanyId, setFmCompanyId] = useState<string | null>(null);
  const [fmSince, setFmSince] = useState("");

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

        <Field label="Facility management company (optional)" htmlFor="fm-company" hint="The company that runs its facilities, if one does.">
          <FmCompanyPicker id="fm-company" companies={fmCompanies} value={fmCompanyId} onChange={setFmCompanyId} />
          <input type="hidden" name="fmCompanyId" value={fmCompanyId ?? ""} />
        </Field>
        {fmCompanyId && (
          <Field label="Running it since" htmlFor="fmSince" hint="Leave blank for today.">
            <input id="fmSince" name="fmSince" type="date" className="field" value={fmSince} onChange={(e) => setFmSince(e.target.value)} />
          </Field>
        )}

        {demoMode && (
          <BackdateField
            id="createdOn"
            name="createdOn"
            label="Society record dated"
            hint="Leave blank for today. Everything after it — the lead, the survey, the meter — is ordered against this date."
            value={createdOn}
            onChange={setCreatedOn}
            disabled={pending}
          />
        )}

        {state?.error && (
          <div
            className="rounded-[var(--r-md)] border p-4 text-sm"
            style={{ borderColor: "var(--warn-line)", background: "var(--warn-bg)" }}
          >
            <p className="mb-2" style={{ color: "var(--warn-fg)" }}>
              {state.error}
            </p>
          </div>
        )}

        <button type="submit" disabled={pending} className="btn-primary w-full">
          {pending ? "Creating…" : "Create society"}
        </button>
      </form>
    </Card>
  );
}
