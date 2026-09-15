"use client";

import { useState, useTransition } from "react";
import type { KycDocumentType } from "@prisma/client";
import { ErrorText, Field } from "@/components/ui";
import { recordKycFact } from "./actions";

/**
 * Record what the document would say, without the document — a GSTIN, or the
 * tariff on the bill — so the deal moves on (the user's call, 2026-09-15).
 * The document stays wanted: the society page chases it until it is filed.
 */
export function KycFactForm({
  pipelineId,
  type,
  current,
}: {
  pipelineId: string;
  type: KycDocumentType;
  current: string | null;
}) {
  const gst = type === "gst_certificate";
  const [value, setValue] = useState(current ?? "");
  const [error, setError] = useState<string | undefined>();
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="mt-4 rounded-[var(--r-md)] border p-3" style={{ borderColor: "var(--border-subtle)" }}>
      <p className="lbl mb-2">{gst ? "Or record the GST number and move on" : "Or record the tariff and move on"}</p>
      <div className="flex flex-wrap items-end gap-3">
        <Field
          label={gst ? "GSTIN" : "Unit electricity rate (₹/kWh)"}
          htmlFor={`kyc-fact-${type}`}
          hint={gst ? "15 characters, as on the registration. The certificate can be filed later from the society page." : "As printed on a recent bill. The bill can be filed later from the society page; the offer starts from this rate."}
        >
          <input
            id={`kyc-fact-${type}`}
            className="field field-auto"
            type={gst ? "text" : "number"}
            inputMode={gst ? "text" : "decimal"}
            step={gst ? undefined : "0.01"}
            min={gst ? undefined : "0"}
            value={value}
            onChange={(e) => setValue(gst ? e.target.value.toUpperCase() : e.target.value)}
            placeholder={gst ? "09AAACF1234A1Z5" : "7.24"}
            disabled={pending}
          />
        </Field>
        <button
          type="button"
          className="btn-secondary mb-2"
          disabled={pending || value.trim() === "" || value === (current ?? "")}
          onClick={() =>
            start(async () => {
              setError(undefined);
              setSaved(false);
              const r = await recordKycFact(pipelineId, type, value);
              setError(r.error);
              if (!r.error) setSaved(true);
            })
          }
        >
          {pending ? "Saving…" : current ? "Update" : gst ? "Record GSTIN" : "Record rate"}
        </button>
      </div>
      {error && <ErrorText>{error}</ErrorText>}
      {saved && !error && (
        <p className="text-sm" style={{ color: "var(--ok-fg)" }}>
          Recorded — this step no longer holds the agreement. The document is still wanted; the society page will say so until it is filed.
        </p>
      )}
    </div>
  );
}
