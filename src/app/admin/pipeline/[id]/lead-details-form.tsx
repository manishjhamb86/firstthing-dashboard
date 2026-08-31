"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { updateLeadDetails } from "../actions";
import { ErrorText, Field } from "@/components/ui";

export type OwnerOption = { id: string; name: string; team: string };

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
    loggedOn: string;
    salesOwnerId: string;
    notes: string;
    dealScope: string;
    /** Hide the field for solar/wastewater — one deal at a time, no parts. */
    serviceLine: string;
  };
}) {
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const [contactName, setContactName] = useState(current.contactName);
  const [contactPhone, setContactPhone] = useState(current.contactPhone);
  const [meetingDate, setMeetingDate] = useState(current.meetingDate);
  const [loggedOn, setLoggedOn] = useState(current.loggedOn);
  const [salesOwnerId, setSalesOwnerId] = useState(current.salesOwnerId);
  const [notes, setNotes] = useState(current.notes);
  const [dealScope, setDealScope] = useState(current.dealScope);

  const router = useRouter();
  const pathname = usePathname();
  const close = () => router.replace(pathname, { scroll: false });

  /**
   * Saving CLOSES the form. It used to submit and stay open on the same URL,
   * so a successful save re-rendered the identical form and read as a flicker
   * with nothing to show for it (user-reported 2026-08-25) — the card behind
   * it had the new values, but nobody could see the card. A refusal keeps the
   * form open, because that is the one case where there IS something to do
   * here.
   */
  function submit() {
    setError(undefined);
    startTransition(async () => {
      const result = await updateLeadDetails(pipelineId, {
        contactName,
        contactPhone,
        meetingDate,
        loggedOn,
        salesOwnerId,
        notes,
        dealScope,
      });
      if (result?.error) setError(result.error);
      else close();
    });
  }

  const reassigning = salesOwnerId !== current.salesOwnerId;
  const newOwner = owners.find((o) => o.id === salesOwnerId);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
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

      {/* The day the lead was logged, shown on the society's own leads card
          and correctable here (user-asked 2026-08-25). Unlike the meeting,
          this one IS about our records, so it is ordered against the society
          row and the proposal decision. */}
      <Field
        label="Logged on"
        htmlFor="ld-logged"
        hint="The day this lead was recorded — not the day of the meeting."
      >
        <input
          id="ld-logged"
          name="loggedOn"
          type="date"
          className="field"
          value={loggedOn}
          onChange={(e) => setLoggedOn(e.target.value)}
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

      {(current.serviceLine === "lighting" || current.serviceLine === "pumps") && (
        <Field
          label="Which part does this deal cover?"
          htmlFor="ld-scope"
          hint="Naming the parts is what lets two deals on one service line be told apart (CON-24)."
        >
          <input
            id="ld-scope"
            className="field"
            value={dealScope}
            onChange={(e) => setDealScope(e.target.value)}
            maxLength={80}
          />
        </Field>
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
