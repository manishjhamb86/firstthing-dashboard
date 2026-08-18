"use client";

import { useTransition } from "react";
import { updateSocietyStatus } from "../actions";
import { SOCIETY_STATUS } from "@/lib/status-maps";
import type { ChipTone } from "@/components/ui";

const STATUSES = ["prospect", "active", "suspended", "terminated"] as const;

// The same status renders as a colored StatusChip on the societies LIST —
// this is the one place it is also an editable control, and it had been
// rendering as plain black-on-white, losing the only saturated color this
// page otherwise carries in its header (user-reported, 2026-08-18: "why is
// everything plain white... don't we have colors defined").
//
// A real status control cannot BE a chip (a chip has no click target), so it
// borrows the chip's own tokens instead — the same --{tone}-bg/-fg/-line
// pair .chip-{tone} uses — applied as inline style, since the tone is only
// known at render time from the status value.
const TONE_VARS: Record<ChipTone, { bg: string; fg: string; line: string }> = {
  ok: { bg: "var(--ok-bg)", fg: "var(--ok-fg)", line: "var(--ok-line)" },
  warn: { bg: "var(--warn-bg)", fg: "var(--warn-fg)", line: "var(--warn-line)" },
  bad: { bg: "var(--bad-bg)", fg: "var(--bad-fg)", line: "var(--bad-line)" },
  info: { bg: "var(--info-bg)", fg: "var(--info-fg)", line: "var(--info-line)" },
  neu: { bg: "var(--neu-bg)", fg: "var(--neu-fg)", line: "var(--neu-line)" },
};

export function StatusControl({ societyId, status }: { societyId: string; status: string }) {
  const [pending, startTransition] = useTransition();
  const tone = TONE_VARS[SOCIETY_STATUS[status]?.tone ?? "neu"];

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
      style={{ background: tone.bg, color: tone.fg, borderColor: tone.line }}
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {SOCIETY_STATUS[s].label}
        </option>
      ))}
    </select>
  );
}
