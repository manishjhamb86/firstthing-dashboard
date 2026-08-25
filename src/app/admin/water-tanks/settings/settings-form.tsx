"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ErrorText, Field } from "@/components/ui";
import { saveTankApiConfig } from "../actions";

/**
 * Save-and-test in one act: credentials that never fetched a device list are
 * not stored. The secret is write-only — the form never receives the stored
 * value, and leaving the field blank on an edit keeps it.
 */
export function SettingsForm({
  current,
}: {
  current: { baseUrl: string; accessId: string; hasSecret: boolean };
}) {
  const router = useRouter();
  const [baseUrl, setBaseUrl] = useState(current.baseUrl);
  const [accessId, setAccessId] = useState(current.accessId);
  const [accessSecret, setAccessSecret] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(undefined);
    setNotice(undefined);
    startTransition(async () => {
      const result = await saveTankApiConfig({ baseUrl, accessId, accessSecret });
      if (result.error) setError(result.error);
      else {
        setNotice(`Connected — ${result.devices} devices, ${result.tanks} with a water level.`);
        setAccessSecret("");
        router.refresh();
      }
    });
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Field
        label="Data center"
        htmlFor="ta-url"
        hint="Must match the region the Smart Life account was created in."
      >
        <select
          id="ta-url"
          className="field"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          disabled={pending}
        >
          <option value="https://openapi.tuyain.com">India — openapi.tuyain.com</option>
          <option value="https://openapi.tuyaeu.com">Europe — openapi.tuyaeu.com</option>
          <option value="https://openapi.tuyaus.com">America — openapi.tuyaus.com</option>
          <option value="https://openapi.tuyacn.com">China — openapi.tuyacn.com</option>
        </select>
      </Field>

      <Field label="Access ID" htmlFor="ta-id">
        <input
          id="ta-id"
          className="field num"
          value={accessId}
          onChange={(e) => setAccessId(e.target.value)}
          disabled={pending}
          autoComplete="off"
        />
      </Field>

      <Field
        label="Access secret"
        htmlFor="ta-secret"
        hint={
          current.hasSecret
            ? "Stored server-side only. Leave blank to keep the saved secret."
            : "From Tuya Developer Platform → Cloud Project → Overview. Stored server-side only — never sent back to the browser."
        }
      >
        <input
          id="ta-secret"
          type="password"
          className="field"
          value={accessSecret}
          onChange={(e) => setAccessSecret(e.target.value)}
          placeholder={current.hasSecret ? "••••••••  (unchanged)" : ""}
          disabled={pending}
          autoComplete="new-password"
        />
      </Field>

      {error && <ErrorText>{error}</ErrorText>}
      {notice && (
        <p className="text-sm font-medium" style={{ color: "var(--ok-fg)" }}>
          {notice}
        </p>
      )}

      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Testing…" : "Save & test connection"}
      </button>
    </form>
  );
}
