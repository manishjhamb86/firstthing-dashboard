"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ErrorText, Field } from "@/components/ui";
import { saveCalendarConfig, setCalendarEnabled } from "./actions";

export function CalendarSettingsForm({
  current,
}: {
  current: { workspaceDomain: string; fallbackOrganizer: string; hasKey: boolean; enabled: boolean };
}) {
  const router = useRouter();
  const [keyJson, setKeyJson] = useState("");
  const [domain, setDomain] = useState(current.workspaceDomain);
  const [fallback, setFallback] = useState(current.fallbackOrganizer);
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
          const r = await saveCalendarConfig({ keyJson, workspaceDomain: domain, fallbackOrganizer: fallback });
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
        htmlFor="gc-key"
        hint={current.hasKey ? "A key is saved. Leave this empty to keep it, or paste a new one to replace it." : "Paste the whole file downloaded from Google Cloud."}
      >
        <textarea id="gc-key" className="field num text-[12px]" rows={5} value={keyJson} onChange={(e) => setKeyJson(e.target.value)} placeholder={current.hasKey ? "•••• saved ••••" : '{ "type": "service_account", … }'} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Workspace domain" htmlFor="gc-domain">
          <input id="gc-domain" className="field" value={domain} onChange={(e) => setDomain(e.target.value)} />
        </Field>
        <Field label="Fallback organizer" htmlFor="gc-fallback" hint="Organizes events set by anyone whose login is not on the domain.">
          <input id="gc-fallback" className="field" value={fallback} onChange={(e) => setFallback(e.target.value)} />
        </Field>
      </div>
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
                const r = await setCalendarEnabled(!current.enabled);
                if (r.error) setError(r.error);
                router.refresh();
              })
            }
          >
            {current.enabled ? "Pause the sync" : "Resume the sync"}
          </button>
        )}
      </div>
    </form>
  );
}
