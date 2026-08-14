"use client";

import { useTransition } from "react";
import { updateSocietyStatus } from "../actions";
import { SOCIETY_STATUS } from "@/lib/status-maps";

const STATUSES = ["prospect", "active", "suspended", "terminated"] as const;

export function StatusControl({ societyId, status }: { societyId: string; status: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <select
      value={status}
      disabled={pending}
      aria-label="Society status"
      onChange={(e) => {
        const next = e.target.value as (typeof STATUSES)[number];
        startTransition(() => {
          updateSocietyStatus(societyId, next);
        });
      }}
      className="field field-auto font-semibold"
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {SOCIETY_STATUS[s].label}
        </option>
      ))}
    </select>
  );
}
