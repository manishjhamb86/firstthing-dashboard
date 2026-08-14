"use client";

import { useState, useTransition } from "react";
import { submitGatePass } from "./actions";
import { Card, ErrorText, Field } from "@/components/ui";

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

  return (
    <Card className="p-5 space-y-4">
      <p className="text-sm text-[var(--text-muted)]">
        List every item left on site, one per line (CON-18) — the meter, its mounting hardware, wiring, etc.
      </p>
      <Field label="Items" htmlFor={`gp-items-${kind}`}>
        <textarea
          id={`gp-items-${kind}`}
          value={itemsText}
          onChange={(e) => setItemsText(e.target.value)}
          disabled={pending}
          rows={4}
          placeholder={"Smart meter, unit #4412\nDIN rail mount\n3m armored cable"}
          className="field"
        />
      </Field>
      <Field
        label="Photo URL"
        htmlFor={`gp-photo-${kind}`}
        hint="A link for now — in-app photo upload arrives with the file-storage work."
      >
        <input
          id={`gp-photo-${kind}`}
          value={photoUrl}
          onChange={(e) => setPhotoUrl(e.target.value)}
          disabled={pending}
          placeholder="https://…"
          className="field"
        />
      </Field>
      {error && <ErrorText>{error}</ErrorText>}
      <button
        type="button"
        onClick={submit}
        disabled={pending || !itemsText.trim()}
        className="btn-primary"
      >
        {pending ? "Submitting…" : "Submit gate pass"}
      </button>
    </Card>
  );
}
