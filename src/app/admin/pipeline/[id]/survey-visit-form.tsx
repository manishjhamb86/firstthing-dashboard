"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { updateSurveyVisit } from "../actions";
import { ErrorText, Field } from "@/components/ui";

/**
 * Arranging the visit: when the assignee is going, and who to ask for on
 * arrival. Opened from the assignment card (?edit=visit) and closed by
 * dropping the parameter, like every other step-you-open on this page.
 */
export function SurveyVisitForm({
  pipelineId,
  current,
  leadContact,
}: {
  pipelineId: string;
  current: { scheduledAt: string; contactName: string; contactPhone: string; note: string };
  /** Shown as the fallback, so nobody re-types what the deal already knows. */
  leadContact: { name: string; phone: string };
}) {
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const [scheduledAt, setScheduledAt] = useState(current.scheduledAt);
  const [contactName, setContactName] = useState(current.contactName);
  const [contactPhone, setContactPhone] = useState(current.contactPhone);
  const [note, setNote] = useState(current.note);

  const router = useRouter();
  const pathname = usePathname();
  const close = () => router.replace(pathname, { scroll: false });

  function submit() {
    setError(undefined);
    startTransition(async () => {
      const result = await updateSurveyVisit(pipelineId, {
        scheduledAt,
        contactName,
        contactPhone,
        note,
      });
      if (result?.error) setError(result.error);
      else close();
    });
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Field
        label="Visit date and time"
        htmlFor="sv-when"
        hint="What the society agreed to on the phone. Leave blank if nothing is fixed yet."
      >
        <input
          id="sv-when"
          type="datetime-local"
          className="field"
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
          disabled={pending}
        />
      </Field>

      <Field
        label="Who to ask for on site"
        htmlFor="sv-contact"
        hint={`Leave blank to use the lead contact, ${leadContact.name}${leadContact.phone ? ` · ${leadContact.phone}` : ""}.`}
      >
        <input
          id="sv-contact"
          className="field"
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
          placeholder={leadContact.name}
          disabled={pending}
        />
      </Field>

      <Field label="Their phone" htmlFor="sv-phone">
        <input
          id="sv-phone"
          className="field"
          value={contactPhone}
          onChange={(e) => setContactPhone(e.target.value)}
          placeholder={leadContact.phone}
          disabled={pending}
        />
      </Field>

      <Field
        label="Anything the visitor needs to know"
        htmlFor="sv-note"
        hint="Which gate, where to park, whether the pump room needs a key."
      >
        <textarea
          id="sv-note"
          rows={3}
          className="field"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={pending}
        />
      </Field>

      {error && <ErrorText>{error}</ErrorText>}

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? "Saving…" : "Save visit"}
        </button>
        <button type="button" className="btn-ghost" disabled={pending} onClick={close}>
          Cancel
        </button>
      </div>
    </form>
  );
}
