"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ErrorText, Field } from "@/components/ui";
import { beginEwelinkAuthorisation, saveEwelinkConfig } from "../actions";

const REGIONS: [string, string][] = [
  ["as", "Asia (India)"],
  ["eu", "Europe"],
  ["us", "Americas"],
  ["cn", "Mainland China"],
];

const OUTCOME: Record<string, string> = {
  yes: "Account authorised.",
  cancelled: "Authorisation was cancelled — nothing changed.",
  state: "That callback did not match the request this app started, so it was ignored.",
  refused: "Authorising the meter account is an operations action.",
  unconfigured: "Save the application credentials first.",
  failed: "The token exchange failed — see the connection panel for what eWeLink said.",
};

export function EwelinkSettingsClient({
  canEdit,
  region: initialRegion,
  appId: initialAppId,
  redirectUrl: initialRedirect,
  hasSecret,
  authorised,
  outcome,
  devices,
  meters,
}: {
  canEdit: boolean;
  region: string;
  appId: string;
  redirectUrl: string;
  hasSecret: boolean;
  authorised: boolean;
  outcome: string | null;
  devices: string | null;
  meters: string | null;
}) {
  const router = useRouter();
  // Controlled inputs, per this repo's standing rule: an uncontrolled
  // `required` field is wiped by React 19 after a failed submit and the
  // retry then silently does nothing.
  const [region, setRegion] = useState(initialRegion);
  const [appId, setAppId] = useState(initialAppId);
  const [appSecret, setAppSecret] = useState("");
  const [redirectUrl, setRedirectUrl] = useState(initialRedirect);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(
    outcome ? `${OUTCOME[outcome] ?? "Authorisation finished."}${outcome === "yes" && devices ? ` ${devices} devices mirrored, ${meters} of them metering.` : ""}` : null,
  );
  const [pending, start] = useTransition();

  if (!canEdit) {
    return (
      <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
        Only operations can change the meter API configuration.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <Field label="Region" htmlFor="ew-region" hint="CoolKit routes each account to one regional host.">
        <select id="ew-region" className="field field-auto" value={region} onChange={(e) => setRegion(e.target.value)}>
          {REGIONS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </Field>
      <Field label="App ID" htmlFor="ew-appid">
        <input id="ew-appid" className="field" value={appId} onChange={(e) => setAppId(e.target.value)} />
      </Field>
      <Field
        label="App secret"
        htmlFor="ew-secret"
        hint={hasSecret ? "Stored. Leave blank to keep it." : "From the eWeLink developer platform."}
      >
        <input
          id="ew-secret"
          type="password"
          className="field"
          value={appSecret}
          onChange={(e) => setAppSecret(e.target.value)}
          placeholder={hasSecret ? "••••••••" : ""}
        />
      </Field>
      <Field
        label="Redirect URL"
        htmlFor="ew-redirect"
        hint="Must match a URL registered against the application, exactly."
      >
        <input id="ew-redirect" className="field" value={redirectUrl} onChange={(e) => setRedirectUrl(e.target.value)} />
      </Field>

      {error && <ErrorText>{error}</ErrorText>}
      {notice && (
        <p className="text-[13px]" style={{ color: "var(--ok-fg)" }}>
          {notice}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="btn-primary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              setNotice(null);
              const r = await saveEwelinkConfig({ region, appId, appSecret, redirectUrl });
              if (r.error) setError(r.error);
              else {
                setAppSecret("");
                setNotice("Saved. Authorise the account to start reading it.");
                router.refresh();
              }
            })
          }
        >
          {pending ? "Working…" : "Save"}
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await beginEwelinkAuthorisation();
              if (r.error) setError(r.error);
              // Leaving this app is the point: the operator signs in to
              // eWeLink on eWeLink's own page, so we never see that password.
              else if (r.url) window.location.href = r.url;
            })
          }
        >
          {authorised ? "Re-authorise account" : "Authorise account"}
        </button>
      </div>
    </div>
  );
}
