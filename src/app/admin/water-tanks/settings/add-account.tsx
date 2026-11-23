"use client";

import { useState } from "react";
import { Card, CardTitle } from "@/components/ui";
import { SettingsForm } from "./settings-form";

/** "Add another account" (2026-11-19): a button that opens a blank account form. */
export function AddAccount() {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className="btn-secondary self-start" onClick={() => setOpen(true)}>
        Add another Smart Life account
      </button>
    );
  }
  return (
    <Card className="p-6">
      <div className="mb-1 flex items-center justify-between gap-3">
        <CardTitle className="mb-0">New account</CardTitle>
        <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      <p className="mb-4 text-[13px]" style={{ color: "var(--text-muted)" }}>
        Its devices are listed with the others and sampled on the same schedule with this account&apos;s keys.
      </p>
      <SettingsForm accountId="new" current={{ baseUrl: "https://openapi.tuyain.com", accessId: "", hasSecret: false }} onDone={() => setOpen(false)} />
    </Card>
  );
}
