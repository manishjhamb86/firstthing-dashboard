"use client";

import { Field } from "@/components/ui";

/**
 * DEMO_MODE's date input, shared by every step that can be backdated.
 *
 * The requirement is a whole historical deal entered with its real dates —
 * a society formed in January, a lead logged in February, a survey in March
 * — not a way to skip the ordering between them. The server refuses a date
 * that is in the future or that precedes something which must already have
 * happened, in both modes (src/lib/step-dates.ts), gates it in src/lib/backdate.ts, and ignores this field
 * entirely unless DEMO_MODE is on. So this is a convenience, never the gate.
 */
export function BackdateField({
  id,
  name,
  label,
  hint,
  value,
  onChange,
  disabled,
}: {
  id: string;
  name: string;
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className="rounded-[var(--r-sm)] border p-3"
      style={{ borderColor: "var(--warn-line)", background: "var(--warn-bg)" }}
    >
      <p className="lbl mb-2" style={{ color: "var(--warn-fg)" }}>
        Demo mode — backdate this record
      </p>
      <Field label={label} htmlFor={id} hint={hint}>
        <input
          id={id}
          name={name}
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="field field-auto"
        />
      </Field>
    </div>
  );
}
