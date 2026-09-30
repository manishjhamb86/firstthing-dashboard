"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ErrorText, Field } from "@/components/ui";
import { saveZohoConfig, setZohoEnabled } from "./actions";

export function ZohoSettingsForm({
  current,
}: {
  current: { dataCenter: string; organizationId: string; clientId: string; importFrom: string; connected: boolean; enabled: boolean };
}) {
  const router = useRouter();
  const [dataCenter, setDataCenter] = useState(current.dataCenter);
  const [organizationId, setOrganizationId] = useState(current.organizationId);
  const [clientId, setClientId] = useState(current.clientId);
  const [clientSecret, setClientSecret] = useState("");
  const [grantCode, setGrantCode] = useState("");
  const [importFrom, setImportFrom] = useState(current.importFrom);
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
          const r = await saveZohoConfig({ dataCenter, organizationId, clientId, clientSecret, grantCode, importFrom });
          if (r.error) setError(r.error);
          else {
            setNotice(`Connected to ${r.organizationName}.`);
            setClientSecret("");
            setGrantCode("");
            router.refresh();
          }
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Data centre" htmlFor="zo-dc" hint="invoice.zoho.in is India.">
          <select id="zo-dc" className="field" value={dataCenter} onChange={(e) => setDataCenter(e.target.value)}>
            <option value="in">India (zoho.in)</option>
            <option value="com">United States (zoho.com)</option>
            <option value="eu">Europe (zoho.eu)</option>
          </select>
        </Field>
        <Field label="Organisation id" htmlFor="zo-org">
          <input id="zo-org" className="field num" inputMode="numeric" value={organizationId} onChange={(e) => setOrganizationId(e.target.value)} />
        </Field>
      </div>
      <Field label="Client id" htmlFor="zo-client">
        <input id="zo-client" className="field num" value={clientId} onChange={(e) => setClientId(e.target.value)} autoComplete="off" />
      </Field>
      <Field
        label="Client secret"
        htmlFor="zo-secret"
        hint={current.connected ? "A secret is saved. Leave empty to keep it." : "From the Self Client's Client Secret tab."}
      >
        <input id="zo-secret" type="password" className="field num" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder={current.connected ? "•••• saved ••••" : ""} autoComplete="off" />
      </Field>
      <Field
        label="Grant code"
        htmlFor="zo-code"
        hint={current.connected ? "Only to reconnect. Leave empty to keep the current connection." : "Generated in the Self Client with the scopes shown; single use, valid for minutes."}
      >
        <input id="zo-code" className="field num" value={grantCode} onChange={(e) => setGrantCode(e.target.value)} autoComplete="off" />
      </Field>
      <Field label="Fetch invoices dated from" htmlFor="zo-from" hint="Empty fetches every invoice in the account.">
        <input id="zo-from" type="date" className="field" value={importFrom} onChange={(e) => setImportFrom(e.target.value)} />
      </Field>
      {error && <ErrorText>{error}</ErrorText>}
      {notice && <p className="text-[13px]" style={{ color: "var(--ok-fg)" }}>{notice}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Testing…" : "Save and test"}
        </button>
        {current.connected && (
          <button
            type="button"
            className="btn-secondary"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await setZohoEnabled(!current.enabled);
                if (r.error) setError(r.error);
                router.refresh();
              })
            }
          >
            {current.enabled ? "Pause the automatic fetch" : "Resume the automatic fetch"}
          </button>
        )}
      </div>
    </form>
  );
}
