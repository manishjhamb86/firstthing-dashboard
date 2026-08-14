"use client";

import { useState, useTransition } from "react";
import { submitGatePass } from "./actions";

export function GatePassForm({
  circuitId,
  kind = "demo_install",
}: {
  circuitId: string;
  kind?: "demo_install" | "demo_install_completion";
}) {
  const [itemsText, setItemsText] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const items = itemsText.split("\n");
      const result = await submitGatePass(circuitId, items, photoUrl, kind);
      setError(result?.error);
    });
  }

  const fieldStyle = { borderColor: "var(--field-border)", background: "var(--surface)", color: "var(--text)" };

  return (
    <div className="max-w-md space-y-3">
      <p className="text-sm text-[var(--text-muted)]">
        List every item left on site, one per line (CON-18) — the meter, its mounting hardware, wiring, etc.
      </p>
      <textarea
        value={itemsText}
        onChange={(e) => setItemsText(e.target.value)}
        disabled={pending}
        rows={4}
        placeholder={"Smart meter, unit #4412\nDIN rail mount\n3m armored cable"}
        className="w-full border rounded-[var(--r-sm)] p-2 text-sm"
        style={fieldStyle}
      />
      <label className="block text-sm">
        Photo URL
        <input
          value={photoUrl}
          onChange={(e) => setPhotoUrl(e.target.value)}
          disabled={pending}
          placeholder="https://…"
          className="w-full border rounded-[var(--r-sm)] p-2 text-sm mt-1"
          style={fieldStyle}
        />
      </label>
      {error && (
        <p className="text-sm" style={{ color: "var(--bad-fg)" }}>
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={submit}
        disabled={pending || !itemsText.trim()}
        className="btn-primary text-sm disabled:opacity-60"
      >
        {pending ? "Submitting…" : "Submit gate pass"}
      </button>
    </div>
  );
}
