"use client";

import { useActionState, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { updateLeadDetails } from "../actions";
import { ErrorText, Field } from "@/components/ui";

export type OwnerOption = { id: string; name: string; team: string };

async function action(_prev: string | undefined, formData: FormData) {
  const result = await updateLeadDetails(formData.get("pipelineId") as string, {
    contactName: formData.get("contactName") as string,
    contactPhone: formData.get("contactPhone") as string,
    meetingDate: formData.get("meetingDate") as string,
    salesOwnerId: formData.get("salesOwnerId") as string,
    notes: formData.get("notes") as string,
  });
  return result?.error;
}

/**
 * Editing the lead's own details, opened from the card (?edit=lead) and
 * closed by dropping the parameter — the same "a step you open" shape as the
 * demo proposal, for the same reason: a Cancel is only meaningful when
 * getting here was itself a state change.
 *
 * Controlled inputs throughout (React 19 resets uncontrolled fields on every
 * submit, so a refused save would silently empty the form — see
 * PROJECT_CONTEXT.md's form-reset finding).
 */
export function LeadDetailsForm({
  pipelineId,
  owners,
  current,
}: {
  pipelineId: string;
  owners: OwnerOption[];
  current: {
    contactName: string;
    contactPhone: string;
    meetingDate: string;
    salesOwnerId: string;
    notes: string;
  };
}) {
  const [error, formAction, pending] = useActionState(action, undefined);
  const [contactName, setContactName] = useState(current.contactName);
  const [contactPhone, setContactPhone] = useState(current.contactPhone);
  const [meetingDate, setMeetingDate] = useState(current.meetingDate);
  const [salesOwnerId, setSalesOwnerId] = useState(current.salesOwnerId);
  const [notes, setNotes] = useState(current.notes);

  const router = useRouter();
  const pathname = usePathname();
  const close = () => router.replace(pathname, { scroll: false });

  const reassigning = salesOwnerId !== current.salesOwnerId;
  const newOwner = owners.find((o) => o.id === salesOwnerId);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="pipelineId" value={pipelineId} />

      <Field label="Contact" htmlFor="ld-contact">
        <input
          id="ld-contact"
          name="contactName"
          className="field"
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
          disabled={pending}
        />
      </Field>

      <Field label="Phone" htmlFor="ld-phone">
        <input
          id="ld-phone"
          name="contactPhone"
          className="field"
          value={contactPhone}
          onChange={(e) => setContactPhone(e.target.value)}
          disabled={pending}
        />
      </Field>

      <Field label="Meeting date" htmlFor="ld-meeting">
        <input
          id="ld-meeting"
          name="meetingDate"
          type="date"
          className="field"
          value={meetingDate}
          onChange={(e) => setMeetingDate(e.target.value)}
          disabled={pending}
        />
      </Field>

      {/* Only admin and sales are offered — "this belongs to either admin or
          marketing team" (the user, 2026-08-24). The action re-checks. */}
      <Field
        label="Owner"
        htmlFor="ld-owner"
        hint={
          owners.length === 0
            ? "No account is on a team that owns leads yet. Set an account's team on the users screen."
            : undefined
        }
      >
        <select
          id="ld-owner"
          name="salesOwnerId"
          className="field"
          value={salesOwnerId}
          onChange={(e) => setSalesOwnerId(e.target.value)}
          disabled={pending}
        >
          {owners.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name} · {o.team}
            </option>
          ))}
        </select>
      </Field>

      {reassigning && newOwner && (
        <p className="text-sm" style={{ color: "var(--warn-fg)" }}>
          This hands the lead to {newOwner.name}. It becomes theirs, and while it is still at the
          lead stage they confirm it after their meeting before the deal can advance.
        </p>
      )}

      <Field label="Notes" htmlFor="ld-notes">
        <textarea
          id="ld-notes"
          name="notes"
          rows={3}
          className="field"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={pending}
        />
      </Field>

      {error && <ErrorText>{error}</ErrorText>}

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? "Saving…" : "Save details"}
        </button>
        <button type="button" className="btn-ghost" disabled={pending} onClick={close}>
          Cancel
        </button>
      </div>
    </form>
  );
}
