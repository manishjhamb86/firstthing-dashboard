"use client";

import { useTransition } from "react";
import { updateSocietyStatus } from "../actions";

const STATUSES = ["prospect", "active", "suspended", "terminated"] as const;
const LABEL: Record<(typeof STATUSES)[number], string> = {
  prospect: "Prospect",
  active: "Active",
  suspended: "Suspended",
  terminated: "Terminated",
};

export function StatusControl({ societyId, status }: { societyId: string; status: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <select
      value={status}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value as (typeof STATUSES)[number];
        startTransition(() => {
          updateSocietyStatus(societyId, next);
        });
      }}
      className="border rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-60"
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {LABEL[s]}
        </option>
      ))}
    </select>
  );
}
