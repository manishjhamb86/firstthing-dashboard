"use client";

import { useState } from "react";
import { StatusChip } from "@/components/ui";
import { formatInstant } from "@/lib/format-date";
import { discardItem, unblockItem, type OutboxItem } from "./outbox-db";
import { useOutbox } from "./outbox-provider";

/**
 * One saved piece of work that has not reached the office. A blocked item is
 * named with the office's own reason and offers the two ways out 05-field.md
 * §0.1 gives it: try again (after fixing what was wrong elsewhere), or discard
 * this change — never silently.
 */
export function WaitingItem({ item }: { item: OutboxItem }) {
  const outbox = useOutbox();
  const [busy, setBusy] = useState(false);
  const blocked = item.state === "blocked";

  async function retry() {
    setBusy(true);
    await unblockItem(item.seq!);
    await outbox.refresh();
    await outbox.sendNow();
    setBusy(false);
  }

  async function discard() {
    const what: Record<OutboxItem["kind"], string> = {
      "inspection.file": "Discard this inspection? It has not reached the office, and it (with its photo) will be deleted from this phone.",
      "inspection.photo": "Discard this photo? It will be deleted from this phone.",
      "stock.move": "Discard this move? It has not reached the office, and nothing will be moved.",
      "demo.meter": "Discard this meter install? It has not reached the office.",
      "demo.replacement": "Discard this light replacement? It has not reached the office.",
      "installation.day": "Discard this day's record? It has not reached the office, and its photos will be deleted from this phone.",
      "installation.blocker": "Discard this blocker? It has not reached the office.",
      "installation.certificate": "Discard this certificate? It has not reached the office.",
      "survey.profile": "Discard this profile change? It has not reached the office.",
      "survey.member": "Discard this committee member? They have not reached the office.",
      "survey.primary": "Discard this primary-contact change?",
      "survey.section": "Discard this section change?",
      "survey.submit": "Discard the submission? The survey stays open.",
      "survey.area": "Discard this area's count? It has not reached the office.",
      "survey.area_update": "Discard this correction?",
      "survey.area_remove": "Discard removing this area? It stays on the survey.",
      "survey.settle": "Discard this decision? The area stays contested.",
      "survey.circuit": "Discard this circuit and its panel photos? It has not reached the office.",
      "survey.unresolvable": "Discard this? The light type stays unresolved.",
    };
    const ok = confirm(what[item.kind]);
    if (!ok) return;
    setBusy(true);
    await discardItem(item.seq!);
    await outbox.refresh();
    setBusy(false);
  }

  return (
    <li className="card p-4" style={blocked ? { borderColor: "var(--bad-line)" } : undefined}>
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold min-w-0">{item.label}</p>
        <StatusChip tone={blocked ? "bad" : item.lastError ? "warn" : "info"}>
          {blocked ? "Needs you" : item.lastError ? "Trying again" : "Waiting"}
        </StatusChip>
      </div>
      <p className="text-[var(--text-muted)]">Saved {formatInstant(new Date(item.createdAt))}</p>
      {item.lastError && (
        <p className="mt-1" style={{ color: blocked ? "var(--bad-fg)" : "var(--warn-fg)" }}>
          {blocked ? "The office refused it: " : "Last try: "}
          {item.lastError}
        </p>
      )}
      {blocked && (
        <div className="flex gap-2 mt-3">
          <button type="button" className="btn-secondary flex-1 min-h-[48px]" disabled={busy} onClick={retry}>
            Try again
          </button>
          <button
            type="button"
            className="flex-1 min-h-[48px] rounded-full border border-[var(--border)] font-semibold"
            style={{ color: "var(--bad-fg)" }}
            disabled={busy}
            onClick={discard}
          >
            Discard
          </button>
        </div>
      )}
    </li>
  );
}
