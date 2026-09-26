"use client";

import { useState, useTransition } from "react";
import { requestWaterSurvey } from "./enquiry-actions";
import { WATER_PLAN_LABEL, type WaterPlan } from "./water-plans";

/**
 * "Request a site visit". Controlled inputs throughout — a React 19 form
 * action resets uncontrolled fields, and a refused request must keep what
 * was typed (this repo's recorded form-reset lesson).
 */
export function WaterEnquiryForm({ sentOn, mobileOnRecord }: { sentOn: string | null; mobileOnRecord: string | null }) {
  const [plan, setPlan] = useState<WaterPlan>("automation");
  // Prefilled from the member register when the login has a mobile on record;
  // still editable, since the best number to call may be another one.
  const [phone, setPhone] = useState(mobileOnRecord ?? "");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(sentOn);
  const [pending, start] = useTransition();

  if (sent) {
    return (
      <div
        className="rounded-[var(--r-md)] border p-5"
        style={{ borderColor: "var(--ok-line)", background: "var(--ok-bg)", color: "var(--ok-fg)" }}
      >
        <p className="text-[15px] font-bold">Your message is with our team</p>
        <p className="mt-1 text-[13.5px]">
          Sent {sent}. Someone from FirsThing will call you back.
        </p>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await requestWaterSurvey({ plan, phone, note });
          if ("error" in r) setError(r.error);
          else setSent("just now");
        });
      }}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="lbl mb-2">What would you like to hear about?</legend>
        {(Object.keys(WATER_PLAN_LABEL) as WaterPlan[]).map((p) => (
          <label
            key={p}
            className="flex cursor-pointer items-center gap-3 rounded-[var(--r-md)] border px-4 py-3 text-[14px]"
            style={{
              borderColor: plan === p ? "var(--accent)" : "var(--border-subtle)",
              background: plan === p ? "var(--accent-subtle)" : "var(--surface)",
            }}
          >
            <input type="radio" name="plan" value={p} checked={plan === p} onChange={() => setPlan(p)} />
            <span className="font-semibold">{WATER_PLAN_LABEL[p]}</span>
          </label>
        ))}
      </fieldset>
      <div>
        <label htmlFor="we-phone" className="lbl mb-1.5 block">
          Mobile number to call you on
        </label>
        <input
          id="we-phone"
          className="field"
          inputMode="tel"
          autoComplete="tel"
          placeholder="98xxxxxxxx"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        {mobileOnRecord && phone === mobileOnRecord && (
          <p className="mt-1.5 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
            The number on your society&apos;s member record — change it if we should call another.
          </p>
        )}
      </div>
      <div>
        <label htmlFor="we-note" className="lbl mb-1.5 block">
          Anything we should know? <span className="normal-case">(optional)</span>
        </label>
        <textarea
          id="we-note"
          className="field min-h-[80px]"
          placeholder="Number of towers, when tanks overflow, how pumps are run today…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      {error && (
        <p className="text-[13px]" style={{ color: "var(--bad-fg)" }} role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn-primary h-11 w-full text-[15px] sm:w-auto sm:self-start sm:px-8" disabled={pending}>
        {pending ? "Sending…" : "Send to our team"}
      </button>
    </form>
  );
}
