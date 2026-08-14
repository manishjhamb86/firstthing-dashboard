"use client";

import { useActionState, useState } from "react";
import { createLead } from "../actions";

const SERVICE_LINES = [
  { value: "lighting", label: "Lighting" },
  { value: "pumps", label: "Water pumps" },
  { value: "solar", label: "Solar" },
  { value: "wastewater", label: "Wastewater" },
];

const fieldStyle = { borderColor: "var(--field-border)", background: "var(--surface)", color: "var(--text)" };

type Society = { id: string; name: string; location: string };
type SalesOwner = { id: string; name: string | null; email: string };

async function action(_prev: string | undefined, formData: FormData) {
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
  });
  return result?.error;
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
  const [error, formAction, pending] = useActionState(action, undefined);

  const [societyId, setSocietyId] = useState("");
  const [newSocietyName, setNewSocietyName] = useState("");
  const [newSocietyLocation, setNewSocietyLocation] = useState("");
  const [newSocietyFlatCount, setNewSocietyFlatCount] = useState("");
  const [serviceLine, setServiceLine] = useState("lighting");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [meetingDate, setMeetingDate] = useState("");
  const [notes, setNotes] = useState("");
  const [salesOwnerId, setSalesOwnerId] = useState(
    salesOwners.some((o) => o.id === currentUserId) ? currentUserId : (salesOwners[0]?.id ?? ""),
  );

  return (
    <form
      action={formAction}
      className="space-y-4 max-w-xl bg-[var(--surface)] border border-[var(--border-subtle)] rounded-[var(--r-lg)] p-6"
    >
      <div>
        <label className="block text-sm font-medium mb-1">Society</label>
        <select
          name="societyId"
          value={societyId}
          onChange={(e) => setSocietyId(e.target.value)}
          required
          className="w-full border rounded-[var(--r-sm)] p-2 text-sm"
          style={fieldStyle}
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
      </div>

      {societyId === "__new__" && (
        <div className="space-y-3 border border-[var(--border-subtle)] rounded-[var(--r-md)] p-4">
          <input
            name="newSocietyName"
            placeholder="Society name"
            required
            value={newSocietyName}
            onChange={(e) => setNewSocietyName(e.target.value)}
            className="w-full border rounded-[var(--r-sm)] p-2 text-sm"
            style={fieldStyle}
          />
          <input
            name="newSocietyLocation"
            placeholder="Location (city / area)"
            required
            value={newSocietyLocation}
            onChange={(e) => setNewSocietyLocation(e.target.value)}
            className="w-full border rounded-[var(--r-sm)] p-2 text-sm"
            style={fieldStyle}
          />
          <input
            name="newSocietyFlatCount"
            type="number"
            min="1"
            placeholder="Approx. flat count"
            required
            value={newSocietyFlatCount}
            onChange={(e) => setNewSocietyFlatCount(e.target.value)}
            className="w-full border rounded-[var(--r-sm)] p-2 text-sm"
            style={fieldStyle}
          />
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-1">Service line</label>
        <select
          name="serviceLine"
          value={serviceLine}
          onChange={(e) => setServiceLine(e.target.value)}
          required
          className="w-full border rounded-[var(--r-sm)] p-2 text-sm"
          style={fieldStyle}
        >
          {SERVICE_LINES.map((sl) => (
            <option key={sl.value} value={sl.value}>
              {sl.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Contact person</label>
        <input
          name="contactName"
          required
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
          className="w-full border rounded-[var(--r-sm)] p-2 text-sm"
          style={fieldStyle}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Contact phone (optional)</label>
        <input
          name="contactPhone"
          value={contactPhone}
          onChange={(e) => setContactPhone(e.target.value)}
          className="w-full border rounded-[var(--r-sm)] p-2 text-sm"
          style={fieldStyle}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Meeting date</label>
        <input
          name="meetingDate"
          type="date"
          required
          value={meetingDate}
          onChange={(e) => setMeetingDate(e.target.value)}
          className="w-full border rounded-[var(--r-sm)] p-2 text-sm"
          style={fieldStyle}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Notes (optional)</label>
        <textarea
          name="notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full border rounded-[var(--r-sm)] p-2 text-sm"
          style={fieldStyle}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Belongs to</label>
        <select
          name="salesOwnerId"
          value={salesOwnerId}
          onChange={(e) => setSalesOwnerId(e.target.value)}
          required
          className="w-full border rounded-[var(--r-sm)] p-2 text-sm"
          style={fieldStyle}
        >
          {salesOwners.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name ?? o.email}
              {o.id === currentUserId ? " (you)" : ""}
            </option>
          ))}
        </select>
        {salesOwnerId && salesOwnerId !== currentUserId && (
          <p className="text-xs mt-1 text-[var(--text-muted)]">
            Logging this on their behalf — it&apos;ll need their approval before it&apos;s authoritative.
          </p>
        )}
      </div>

      {error && (
        <p className="text-sm" style={{ color: "var(--bad-fg)" }}>
          {error}
        </p>
      )}

      <button type="submit" disabled={pending} className="btn-primary px-4 py-2 text-sm font-semibold disabled:opacity-60">
        {pending ? "Logging…" : "Log lead"}
      </button>
    </form>
  );
}
