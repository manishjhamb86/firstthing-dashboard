"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ErrorText, Field } from "@/components/ui";
import { saveGmailConfig, setGmailEnabled } from "./actions";

export function GmailSettingsForm({
  current,
}: {
  current: { mailbox: string; hasKey: boolean; enabled: boolean };
}) {
  const router = useRouter();
  const [keyJson, setKeyJson] = useState("");
  const [mailbox, setMailbox] = useState(current.mailbox);
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(undefined);
        setNotice(undefined);
        startTransition(async () => {
          const r = await saveGmailConfig({ keyJson, mailbox });
          if (r.error) setError(r.error);
          else {
            setNotice(`Connected as ${r.clientEmail}.`);
            setKeyJson("");
            router.refresh();
          }
        });
      }}
    >
      <Field
        label="Service account key (JSON)"
        htmlFor="gg-key"
        hint={current.hasKey ? "A key is saved. Leave this empty to keep it, or paste a new one to replace it." : "Paste the whole file downloaded from Google Cloud."}
      >
        <textarea id="gg-key" className="field num text-[12px]" rows={5} value={keyJson} onChange={(e) => setKeyJson(e.target.value)} placeholder={current.hasKey ? "•••• saved ••••" : '{ "type": "service_account", … }'} />
      </Field>
      <Field label="Dedicated mailbox" htmlFor="gg-mailbox" hint="The address the vendor's daily email is forwarded to — never a real person's inbox.">
        <input id="gg-mailbox" className="field" value={mailbox} onChange={(e) => setMailbox(e.target.value)} placeholder="ems-reports@firsthing.earth" />
      </Field>
      {error && <ErrorText>{error}</ErrorText>}
      {notice && <p className="text-[13px]" style={{ color: "var(--ok-fg)" }}>{notice}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Testing…" : "Save and test"}
        </button>
        {current.hasKey && (
          <button
            type="button"
            className="btn-ghost"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await setGmailEnabled(!current.enabled);
                if (r.error) setError(r.error);
                router.refresh();
              })
            }
          >
            {current.enabled ? "Pause ingestion" : "Resume ingestion"}
          </button>
        )}
      </div>
    </form>
  );
}
