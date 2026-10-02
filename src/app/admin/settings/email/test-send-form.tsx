"use client";

import { useState, useTransition } from "react";
import { ErrorText } from "@/components/ui";
import { sendTestEmail } from "./actions";

export function TestSendForm() {
  const [to, setTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();

  return (
    <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
      <label className="block flex-1" htmlFor="test-email-to">
        <span className="lbl mb-1 block">Send a test email to</span>
        <input
          id="test-email-to"
          type="email"
          className="field"
          value={to}
          disabled={pending}
          placeholder="you@firsthing.earth"
          onChange={(e) => {
            setTo(e.target.value);
            setSent(false);
            setError(null);
          }}
        />
      </label>
      <button
        type="button"
        className="btn-primary"
        disabled={pending || !to}
        onClick={() =>
          start(async () => {
            setError(null);
            setSent(false);
            const r = await sendTestEmail(to);
            if (r.error) setError(r.error);
            else setSent(true);
          })
        }
      >
        {pending ? "Sending…" : "Send test"}
      </button>
      {error && <ErrorText>{error}</ErrorText>}
      {sent && <p style={{ color: "var(--ok-fg)" }}>Sent.</p>}
    </div>
  );
}
