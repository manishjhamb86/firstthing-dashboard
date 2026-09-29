"use client";

import { Card, StatusChip } from "@/components/ui";
import { formatInstant } from "@/lib/format-date";
import { useOutbox } from "../outbox-provider";

/**
 * What reached the office from this phone, and what it said. A queued move
 * reaches the office after the scanning is done, so a unit it could not move
 * (already deployed, not one of ours) is reported HERE — otherwise it would
 * disappear from the phone with nobody told.
 */
export function RecentlySent() {
  const { sent, loaded } = useOutbox();
  if (!loaded || sent.length === 0) return null;
  return (
    <Card className="p-4 mb-4">
      <p className="font-semibold mb-2">Recently sent</p>
      <ul className="space-y-3">
        {sent.slice(0, 10).map((s) => (
          <li key={s.id} className="border-t border-[var(--border-subtle)] pt-3 first:border-t-0 first:pt-0">
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold min-w-0">{s.label}</p>
              {s.problems.length > 0 ? (
                <StatusChip tone="warn">
                  {s.done ?? 0} done · {s.problems.length} not
                </StatusChip>
              ) : (
                <StatusChip tone="ok">Reached the office</StatusChip>
              )}
            </div>
            <p className="text-[var(--text-muted)]">{formatInstant(new Date(s.at))}</p>
            {s.problems.length > 0 && (
              <ul className="mt-1 space-y-1" style={{ color: "var(--warn-fg)" }}>
                {s.problems.slice(0, 20).map((p, i) => (
                  <li key={i}>
                    {p.code ? <span className="num font-semibold">{p.code}: </span> : null}
                    {p.error}
                  </li>
                ))}
                {s.problems.length > 20 && <li>…and {s.problems.length - 20} more</li>}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
