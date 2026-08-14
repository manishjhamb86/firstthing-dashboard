"use client";

import { useActionState, useState } from "react";
import { createLead } from "../actions";
import { Card, ErrorText, Field } from "@/components/ui";
import { SERVICE_LINE_LABEL } from "@/lib/status-maps";

type Society = { id: string; name: string; location: string };
type SalesOwner = { id: string; name: string | null; email: string };
type FormState = { error?: string; duplicateOf?: string } | undefined;

async function action(_prev: FormState, formData: FormData): Promise<FormState> {
  const societyId = formData.get("societyId") as string;
  const result = await createLead({
    societyId: societyId === "__new__" ? undefined : societyId,
    newSociety:
      societyId === "__new__"
        ? {
            name: formData.get("newSocietyName") as string,
            location: formData.get("newSocietyLocation") as string,
            flatCount: Number(formData.get("newSocietyFlatCount")),
          }
        : undefined,
    serviceLine: formData.get("serviceLine") as string,
    contactName: formData.get("contactName") as string,
    contactPhone: formData.get("contactPhone") as string,
    meetingDate: formData.get("meetingDate") as string,
    notes: formData.get("notes") as string,
    salesOwnerId: formData.get("salesOwnerId") as string,
    confirmDuplicate: formData.get("confirmDuplicate") === "true",
  });
  return result;
}

// Controlled inputs throughout — see login-form.tsx for the React 19
// form-reset-on-submit finding this works around.
export function NewLeadForm({
  societies,
  salesOwners,
  currentUserId,
}: {
  societies: Society[];
  salesOwners: SalesOwner[];
  currentUserId: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, undefined);

  const [societyId, setSocietyId] = useState("");
  const [newSocietyName, setNewSocietyName] = useState("");
  const [newSocietyLocation, setNewSocietyLocation] = useState("");
  const [newSocietyFlatCount, setNewSocietyFlatCount] = useState("");
  const [serviceLine, setServiceLine] = useState("lighting");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [meetingDate, setMeetingDate] = useState("");
  const [notes, setNotes] = useState("");
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);
  const [salesOwnerId, setSalesOwnerId] = useState(
    salesOwners.some((o) => o.id === currentUserId) ? currentUserId : (salesOwners[0]?.id ?? ""),
  );

  return (
    <Card className="max-w-xl p-6">
      <form action={formAction} className="space-y-5">
        <Field label="Society" htmlFor="societyId">
          <select
            id="societyId"
            name="societyId"
            value={societyId}
            onChange={(e) => setSocietyId(e.target.value)}
            required
            className="field"
          >
            <option value="" disabled>
              Choose a society…
            </option>
            {societies.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} — {s.location}
              </option>
            ))}
            <option value="__new__">+ New society (not yet in the system)</option>
          </select>
        </Field>

        {societyId === "__new__" && (
          <div className="space-y-4 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-sunken)] p-4">
            <Field label="Society name" htmlFor="newSocietyName">
              <input
                id="newSocietyName"
                name="newSocietyName"
                required
                value={newSocietyName}
                onChange={(e) => setNewSocietyName(e.target.value)}
                className="field"
              />
            </Field>
            <Field label="Location (city / area)" htmlFor="newSocietyLocation">
              <input
                id="newSocietyLocation"
                name="newSocietyLocation"
                required
                value={newSocietyLocation}
                onChange={(e) => setNewSocietyLocation(e.target.value)}
                className="field"
              />
            </Field>
            <Field label="Approx. flat count" htmlFor="newSocietyFlatCount">
              <input
                id="newSocietyFlatCount"
                name="newSocietyFlatCount"
                type="number"
                min="1"
                required
                value={newSocietyFlatCount}
                onChange={(e) => setNewSocietyFlatCount(e.target.value)}
                className="field"
              />
            </Field>
          </div>
        )}

        <Field label="Service line" htmlFor="serviceLine">
          <select
            id="serviceLine"
            name="serviceLine"
            value={serviceLine}
            onChange={(e) => setServiceLine(e.target.value)}
            required
            className="field"
          >
            {Object.entries(SERVICE_LINE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Contact person" htmlFor="contactName">
            <input
              id="contactName"
              name="contactName"
              required
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              className="field"
            />
          </Field>
          <Field label="Contact phone (optional)" htmlFor="contactPhone">
            <input
              id="contactPhone"
              name="contactPhone"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              className="field"
            />
          </Field>
        </div>

        <Field label="Meeting date" htmlFor="meetingDate">
          <input
            id="meetingDate"
            name="meetingDate"
            type="date"
            required
            value={meetingDate}
            onChange={(e) => setMeetingDate(e.target.value)}
            className="field"
          />
        </Field>

        <Field label="Notes (optional)" htmlFor="notes">
          <textarea
            id="notes"
            name="notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="field"
          />
        </Field>

        <Field
          label="Belongs to"
          htmlFor="salesOwnerId"
          hint={
            salesOwnerId && salesOwnerId !== currentUserId
              ? "Logging this on their behalf — it'll need their approval before it's authoritative."
              : undefined
          }
        >
          <select
            id="salesOwnerId"
            name="salesOwnerId"
            value={salesOwnerId}
            onChange={(e) => setSalesOwnerId(e.target.value)}
            required
            className="field"
          >
            {salesOwners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name ?? o.email}
                {o.id === currentUserId ? " (you)" : ""}
              </option>
            ))}
          </select>
        </Field>

        {state?.error && state.duplicateOf ? (
          <div
            className="rounded-[var(--r-md)] border p-4 text-sm"
            style={{ borderColor: "var(--warn-line)", background: "var(--warn-bg)" }}
          >
            <p className="mb-2" style={{ color: "var(--warn-fg)" }}>
              {state.error}
            </p>
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
          </div>
        ) : state?.error ? (
          <ErrorText>{state.error}</ErrorText>
        ) : null}

        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? "Logging…" : "Log lead"}
        </button>
      </form>
    </Card>
  );
}
