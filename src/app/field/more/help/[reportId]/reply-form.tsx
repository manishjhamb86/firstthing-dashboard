"use client";

import { useState } from "react";
import { useOutbox } from "../../../outbox-provider";
import { newItem, saveOnPhone } from "../../../queue";
import { MAX_DESCRIPTION } from "@/lib/help-report";

/** A reply in the chat — saved on the phone and sent like any field work. */
export function HelpReplyForm({ reportId, answered }: { reportId: string; answered: boolean }) {
  const outbox = useOutbox();
  const [body, setBody] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setError(null);
    const text = body.trim();
    if (!text) return setError("Write a reply first.");
    const ok = await saveOnPhone(outbox, [newItem("help.reply", { reportId, body: text }, `Help reply · ${text.slice(0, 40)}`)]);
    if (!ok) return setError("It could not be saved on this phone. Try again.");
    setSent(text);
    setBody("");
  }

  return (
    <div className="mt-4">
      {sent && (
        <p className="mb-2 text-[var(--text-muted)]">
          Your reply is saved{navigator.onLine ? " and on its way" : " and will be sent when there is signal"}: “{sent}”
        </p>
      )}
      <label htmlFor="help-reply" className="block font-semibold mb-1">
        {answered ? "Didn't solve it? Reply and a person will pick it up" : "Reply"}
      </label>
      <textarea id="help-reply" className="field" rows={3} value={body} maxLength={MAX_DESCRIPTION} onChange={(e) => setBody(e.target.value)} />
      {error && (
        <p role="alert" style={{ color: "var(--bad-fg)" }}>
          {error}
        </p>
      )}
      <button type="button" onClick={send} className="btn-primary mt-2">
        Send reply
      </button>
    </div>
  );
}
