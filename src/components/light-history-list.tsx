"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteLightHistoryEntries,
  setLightHistoryExcluded,
} from "@/app/admin/societies/[id]/circuits/[circuitId]/inventory-actions";

export type LightHistoryItemDTO = {
  /** The underlying `ChangeLog` row id(s) this entry was built from — what Exclude/Delete act on. Only meaningful for `kind: "correction"`. */
  ids: string[];
  at: string;
  text: string;
  /** "correction" (a ChangeLog edit) or "rescale" (a verified BenchmarkRescaleEvent, INV-07) — a rescale's own lifecycle (void/correct) lives on the circuit's rescale panel, not here, so Exclude/Delete are offered for corrections only. */
  kind: "correction" | "rescale";
  /** Detected automatically (filterCustomerRelevant): an exact, immediate reversal — already hidden from the customer, no action needed. */
  autoHidden: boolean;
  /** An operator's own manual exclusion — the backend's fallback for whatever the automatic rule doesn't catch. */
  excludedAt: string | null;
  excludedReason: string | null;
};

/**
 * The circuit's light-count history, as a disclosure with the backend's own
 * manage controls (2026-10-06) — extracted out of the circuit page's
 * `DemosPanel` into its own component so the admin society inventory page
 * (which lists every circuit's history on one screen, not just one
 * circuit's) can share it rather than duplicate the exclude/delete wiring a
 * second time.
 */
export function LightHistoryList({
  items,
  circuitId,
  societyId,
  canManage = false,
  demoMode = false,
  collapsed = true,
}: {
  items: LightHistoryItemDTO[];
  circuitId: string;
  societyId: string;
  /** Operations: may hide/un-hide an entry from the customer view, and (demo mode only) delete one outright. */
  canManage?: boolean;
  demoMode?: boolean;
  /** Closed behind a <details> by default — pass false to render it open, e.g. a dedicated history screen. */
  collapsed?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [excludingKey, setExcludingKey] = useState<string | null>(null);
  const [excludeReason, setExcludeReason] = useState("");

  // inventory-actions.ts's Outcome is a strict `{error:string}|{ok:true}`
  // union, which TS's weak-type check rejects against this component's
  // `{error?: string}` run() shape for the `{ok:true}` branch.
  const toRunResult = (p: Promise<{ error: string } | { ok: true }>) => p.then((r) => ("error" in r ? r : {}));
  const run = (fn: () => Promise<{ error?: string }>, after?: () => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (r.error) setError(r.error);
      else {
        after?.();
        router.refresh();
      }
    });

  if (items.length === 0) return null;

  const list = (
    <ul className="mt-2 space-y-2">
      {items.map((h) => {
        const key = h.ids.join(",");
        return (
          <li key={key}>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="num">{h.at}</span> — {h.text}
            </div>
            {h.excludedAt !== null ? (
              <p className="mt-0.5" style={{ color: "var(--text-subtle)" }}>
                Hidden from the customer, {h.excludedAt} — {h.excludedReason}
                {canManage && (
                  <button
                    type="button"
                    className="ml-2 underline"
                    disabled={pending}
                    onClick={() => run(() => toRunResult(setLightHistoryExcluded({ ids: h.ids, exclude: false, reason: "", circuitId, societyId })))}
                  >
                    Un-hide
                  </button>
                )}
              </p>
            ) : h.autoHidden ? (
              <p className="mt-0.5" style={{ color: "var(--text-subtle)" }}>
                Cancels out — automatically hidden from the customer
              </p>
            ) : (
              canManage &&
              h.kind === "correction" && (
                <div className="mt-0.5">
                  {excludingKey === key ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        className="field field-auto"
                        placeholder="Why hide this from the customer"
                        value={excludeReason}
                        onChange={(e) => setExcludeReason(e.target.value)}
                        disabled={pending}
                      />
                      <button
                        type="button"
                        className="btn-ghost btn-sm"
                        disabled={pending}
                        onClick={() =>
                          run(
                            () => toRunResult(setLightHistoryExcluded({ ids: h.ids, exclude: true, reason: excludeReason, circuitId, societyId })),
                            () => setExcludingKey(null),
                          )
                        }
                      >
                        Hide from customer
                      </button>
                      <button type="button" className="btn-ghost btn-sm" disabled={pending} onClick={() => setExcludingKey(null)}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <span className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        className="underline"
                        onClick={() => {
                          setExcludingKey(key);
                          setExcludeReason("");
                        }}
                      >
                        Hide from customer
                      </button>
                      {demoMode && (
                        <button
                          type="button"
                          className="underline"
                          style={{ color: "var(--bad-fg)" }}
                          disabled={pending}
                          onClick={() => {
                            if (!window.confirm("Delete this record outright? This cannot be undone.")) return;
                            run(() => toRunResult(deleteLightHistoryEntries({ ids: h.ids, circuitId, societyId })));
                          }}
                        >
                          Delete
                        </button>
                      )}
                    </span>
                  )}
                </div>
              )
            )}
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="text-[13px] text-[var(--text-muted)]">
      {error && (
        <p className="mb-1" style={{ color: "var(--bad-fg)" }}>
          {error}
        </p>
      )}
      {collapsed ? (
        <details>
          <summary className="cursor-pointer">
            {items.length === 1 ? "1 light-count correction on record" : `${items.length} light-count corrections on record`}
          </summary>
          {list}
        </details>
      ) : (
        list
      )}
    </div>
  );
}
