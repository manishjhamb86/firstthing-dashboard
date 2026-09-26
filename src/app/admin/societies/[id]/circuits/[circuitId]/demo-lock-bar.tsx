"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ErrorText, PageRibbon } from "@/components/ui";
import { formatInstant } from "@/lib/format-date";
import { relockDemo, unlockDemo } from "./demo-step-actions";

/**
 * Whether this demo can be edited right now, and — for operations — the
 * special request that reopens a shared demo (2026-09-26).
 */
export function DemoLockBar({
  demoId,
  why,
  unlockedUntil,
  unlockedBy,
  unlockReason,
  canUnlock,
}: {
  demoId: string;
  why: "demo_mode" | "open" | "unlocked" | "locked";
  unlockedUntil: string | null;
  unlockedBy: string | null;
  unlockReason: string | null;
  canUnlock: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const act = (fn: () => Promise<{ error?: string }>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (r.error) setError(r.error);
      else {
        setOpen(false);
        router.refresh();
      }
    });

  if (why === "open") return null;
  if (why === "demo_mode") {
    return <PageRibbon tone="info">Demo mode — every step of this demo stays editable, whatever its report says.</PageRibbon>;
  }
  if (why === "unlocked") {
    return (
      <PageRibbon tone="warn">
        <div className="flex flex-wrap items-center gap-3">
          <span>
            <strong>Unlocked for correction</strong> by {unlockedBy ?? "operations"} until{" "}
            <span className="num">{unlockedUntil ? formatInstant(new Date(unlockedUntil)) : "—"}</span> — {unlockReason}. Any changed
            figure means the shared report has to be regenerated as a new version.
          </span>
          {canUnlock && (
            <button type="button" className="btn-secondary btn-sm" disabled={pending} onClick={() => act(() => relockDemo(demoId))}>
              Lock it again
            </button>
          )}
        </div>
        {error && <ErrorText>{error}</ErrorText>}
      </PageRibbon>
    );
  }
  return (
    <PageRibbon tone="neutral">
      <div className="space-y-2">
        <span>
          <strong>Locked</strong> — this demo&apos;s report has been shared with the society, so its steps can no longer be edited.
        </span>
        {canUnlock &&
          (open ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                aria-label="Why the demo needs correcting"
                placeholder="Why it needs correcting"
                className="field max-w-md"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <button type="button" className="btn-tone-warn btn-sm" disabled={pending || !reason.trim()} onClick={() => act(() => unlockDemo(demoId, reason))}>
                Unlock for 24 hours
              </button>
              <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(true)}>
              Unlock for correction
            </button>
          ))}
        {error && <ErrorText>{error}</ErrorText>}
      </div>
    </PageRibbon>
  );
}
