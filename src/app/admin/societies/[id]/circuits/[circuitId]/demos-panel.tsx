"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, ErrorText, Field, StatusChip } from "@/components/ui";
import { ExclusionNote } from "@/components/exclusion-note";
import { hasExclusion, type Exclusion } from "@/lib/circuit-load";
import { purgeRemovedDemo, removeDemo, setBenchmarkOverride, setDemoLightCount, setDemoRejected, startDemo } from "./demo-step-actions";
import { deleteLightHistoryEntries, setLightHistoryExcluded } from "./inventory-actions";

export type DemoDTO = {
  id: string;
  sequence: number;
  combine: "batch" | "rerun";
  meteredLightCount: number;
  preAverage: number | null;
  postAverage: number | null;
  savingsPct: number | null;
  rejected: boolean;
  rejectionReason: string | null;
  complete: boolean;
  locked: boolean;
  href: string;
  current: boolean;
};

/**
 * The circuit's demos (2026-09-26): each walks its own steps and is measured
 * over its own periods. A second demo either covers DIFFERENT lights (its
 * baseline adds to the first) or repeats the SAME lights (the baselines
 * average); the benchmark is the mean of the demos' percentages either way.
 */
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

export function DemosPanel({
  circuitId,
  societyId,
  demos,
  circuitBaseline,
  circuitBenchmark,
  meteredLightCount,
  overridePct,
  overrideReason,
  canStart,
  canDecide,
  maxDemos,
  agreedPending,
  removed = [],
  canChangeLights = false,
  lightCountHistory = [],
  canManageHistory = false,
  demoMode = false,
  exclusion,
}: {
  circuitId: string;
  societyId: string;
  demos: DemoDTO[];
  circuitBaseline: number | null;
  circuitBenchmark: number | null;
  meteredLightCount: number;
  overridePct: number | null;
  overrideReason: string | null;
  canStart: boolean;
  canDecide: boolean;
  maxDemos: number;
  /** An imported circuit whose figures stand until a redone demo is accepted. */
  agreedPending: boolean;
  /** Demos removed as duplicates or mistakes — kept on record, listed here. */
  removed?: { id: string; sequence: number; reason: string; on: string; by: string | null }[];
  /** Demo mode: a demo's light count can be changed from the table. */
  canChangeLights?: boolean;
  /**
   * Every recorded correction to this circuit's demo-count/full-installation
   * split, newest first (2026-10-05, user-asked: "with proper history when
   * it was changed, so user have clear picture").
   */
  lightCountHistory?: LightHistoryItemDTO[];
  /** Operations: may hide/un-hide an entry from the customer view, and (demo mode only) delete one outright (2026-10-06, user-asked). */
  canManageHistory?: boolean;
  demoMode?: boolean;
  /** What stayed on the circuit unreplaced — the savings here leave it out. */
  exclusion?: Exclusion;
}) {
  const router = useRouter();
  // What the counted demos measure now — the mean of their savings, the same
  // rule the benchmark is derived by.
  const counted = demos.filter((d) => !d.rejected && d.savingsPct !== null);
  const measuredNow = counted.length > 0 ? counted.reduce((n, d) => n + (d.savingsPct ?? 0), 0) / counted.length : null;
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [combine, setCombine] = useState<"batch" | "rerun">("rerun");
  const [lights, setLights] = useState(String(meteredLightCount));
  const [overriding, setOverriding] = useState(false);
  const [pct, setPct] = useState(overridePct === null ? "" : String(overridePct));
  const [reason, setReason] = useState(overrideReason ?? "");
  const [excludingKey, setExcludingKey] = useState<string | null>(null);
  const [excludeReason, setExcludeReason] = useState("");
  // inventory-actions.ts's Outcome is a strict `{error:string}|{ok:true}`
  // union, which TS's weak-type check rejects against run()'s `{error?:
  // string}` shape for the `{ok:true}` branch — normalized here rather than
  // widening that file's own, more precise return type.
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

  return (
    <Card className="p-5 mb-6 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[15px] font-semibold">Demos</h2>
        {circuitBenchmark !== null && (
          <StatusChip tone="ok">
            Benchmark {circuitBenchmark.toFixed(2)}%{overridePct !== null ? " · agreed override" : ""}
          </StatusChip>
        )}
        {circuitBaseline !== null && <StatusChip tone="info">Baseline {circuitBaseline.toFixed(2)} kWh/day</StatusChip>}
      </div>
      {agreedPending && (
        <p className="text-sm" style={{ color: "var(--warn-fg)" }}>
          Agreed figure — demo pending re-entry. This circuit was set up before the system; its baseline and benchmark are the
          ones on record until a demo is redone here and accepted, and invoices keep using them meanwhile.
        </p>
      )}

      {demos.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">No demo on this circuit yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="tbl tbl-compact">
            <thead>
              <tr>
                <th>Demo</th>
                <th className="text-right">Lights</th>
                <th className="text-right">Before · kWh/day</th>
                <th className="text-right">After · kWh/day</th>
                <th className="text-right">Saving</th>
                <th>Status</th>
                {canDecide && <th />}
              </tr>
            </thead>
            <tbody>
              {demos.map((d) => (
                <tr key={d.id} style={d.rejected ? { opacity: 0.6 } : undefined}>
                  <td>
                    <Link href={d.href} className="underline">
                      Demo {d.sequence}
                    </Link>
                    {d.sequence > 1 && (
                      <span className="block text-xs text-[var(--text-muted)]">{d.combine === "batch" ? "different lights — adds" : "same lights — averages"}</span>
                    )}
                  </td>
                  <td className="num text-right">
                    {d.meteredLightCount}
                    {canChangeLights && (
                      <button
                        type="button"
                        className="btn-ghost btn-sm ml-1"
                        disabled={pending}
                        aria-label={`Change the light count of demo ${d.sequence}`}
                        onClick={() => {
                          const v = window.prompt(`Lights on demo ${d.sequence}'s meter (now ${d.meteredLightCount}):`, String(d.meteredLightCount));
                          if (v === null || v.trim() === "" || Number(v) === d.meteredLightCount) return;
                          // Optional — kept on the history disclosure above
                          // when given, so a later reader knows why.
                          const why = window.prompt("Why is this count being corrected? (optional)") ?? undefined;
                          run(() => setDemoLightCount({ demoId: d.id, count: Number(v), reason: why?.trim() || undefined }));
                        }}
                      >
                        Change
                      </button>
                    )}
                  </td>
                  <td className="num text-right">{d.preAverage?.toFixed(2) ?? "—"}</td>
                  <td className="num text-right">{d.postAverage?.toFixed(2) ?? "—"}</td>
                  <td className="num text-right">{d.savingsPct === null ? "—" : `${d.savingsPct.toFixed(2)}%`}</td>
                  <td>
                    {d.rejected ? (
                      <StatusChip tone="bad">Rejected</StatusChip>
                    ) : d.complete ? (
                      <StatusChip tone="ok">{d.locked ? "Complete · locked" : "Complete"}</StatusChip>
                    ) : (
                      <StatusChip tone="info">{d.current ? "In progress · shown below" : "In progress"}</StatusChip>
                    )}
                    {d.rejectionReason && <span className="block text-xs text-[var(--text-muted)]">{d.rejectionReason}</span>}
                  </td>
                  {canDecide && (
                    <td className="text-right whitespace-nowrap">
                      {d.rejected ? (
                        <button type="button" className="btn-ghost btn-sm" disabled={pending} onClick={() => run(() => setDemoRejected({ demoId: d.id, rejected: false }))}>
                          Count it again
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn-ghost btn-sm"
                          disabled={pending}
                          onClick={() => {
                            const why = window.prompt(`Why is demo ${d.sequence} rejected? It stays on record and takes no part in the figure.`);
                            if (why) run(() => setDemoRejected({ demoId: d.id, rejected: true, reason: why }));
                          }}
                        >
                          Reject
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn-ghost btn-sm"
                        disabled={pending}
                        onClick={() => {
                          // Before go-live (demo mode) a delete leaves nothing behind.
                          if (canChangeLights) {
                            if (window.confirm(`Delete demo ${d.sequence} completely? Its days, gate passes and history are removed and cannot be recovered.`)) {
                              run(() => removeDemo({ demoId: d.id, reason: "" }));
                            }
                            return;
                          }
                          const why = window.prompt(
                            `Remove demo ${d.sequence}? Use this for a demo started by mistake or duplicating another — it is taken off this table, kept on record as removed, and the figures re-derive without it. Why is it being removed?`,
                          );
                          if (why) run(() => removeDemo({ demoId: d.id, reason: why }));
                        }}
                      >
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {hasExclusion(exclusion) && (
        <ExclusionNote exclusion={exclusion} before={circuitBaseline} after={null} title="Savings on this table are on the replaced lights" />
      )}

      {removed.length > 0 && (
        <details className="text-[13px] text-[var(--text-muted)]">
          <summary className="cursor-pointer">
            {removed.length} removed demo{removed.length === 1 ? "" : "s"} — kept on record
          </summary>
          <ul className="mt-2 space-y-1">
            {removed.map((r) => (
              <li key={r.sequence}>
                Demo {r.sequence} · removed <span className="num">{r.on}</span>
                {r.by ? ` by ${r.by}` : ""} — {r.reason}
                {canChangeLights && canDecide && (
                  <button
                    type="button"
                    className="btn-ghost btn-sm ml-2"
                    disabled={pending}
                    onClick={() => {
                      if (window.confirm(`Delete demo ${r.sequence} completely? Nothing about it remains.`)) run(() => purgeRemovedDemo({ demoId: r.id }));
                    }}
                  >
                    Delete completely
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      {lightCountHistory.length > 0 && (
        // Closed by default, same as `removed` above — most circuits have
        // never had a correction (2026-10-05, user-asked: a clear record of
        // when and why the full-installation/demo split last moved).
        <details className="text-[13px] text-[var(--text-muted)]">
          <summary className="cursor-pointer">
            {lightCountHistory.length === 1 ? "1 light-count correction on record" : `${lightCountHistory.length} light-count corrections on record`}
          </summary>
          <ul className="mt-2 space-y-2">
            {lightCountHistory.map((h) => {
              const key = h.ids.join(",");
              return (
                <li key={key}>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="num">{h.at}</span> — {h.text}
                  </div>
                  {h.excludedAt !== null ? (
                    <p className="mt-0.5" style={{ color: "var(--text-subtle)" }}>
                      Hidden from the customer, {h.excludedAt} — {h.excludedReason}
                      {canManageHistory && (
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
                    canManageHistory && h.kind === "correction" && (
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
        </details>
      )}

      {canStart && demos.length < maxDemos && (
        starting || demos.length === 0 ? (
          <div className="flex flex-wrap items-end gap-3 pt-2 border-t border-[var(--border-subtle)]">
            {demos.length > 0 && (
              <Field label="This demo covers" htmlFor="nd-combine">
                <select id="nd-combine" className="field field-auto" value={combine} onChange={(e) => setCombine(e.target.value as "batch" | "rerun")}>
                  <option value="rerun">The same lights again — baselines average</option>
                  <option value="batch">Different lights — adds to the baseline</option>
                </select>
              </Field>
            )}
            <Field label="Lights on the meter" htmlFor="nd-lights">
              <input id="nd-lights" type="number" className="field field-auto w-28" value={lights} onChange={(e) => setLights(e.target.value)} />
            </Field>
            <button
              type="button"
              className="btn-primary mb-2"
              disabled={pending || !lights.trim()}
              onClick={() => run(() => startDemo({ circuitId, combine, meteredLightCount: Number(lights) }), () => setStarting(false))}
            >
              {demos.length === 0 ? "Start the demo" : `Start demo ${demos.length + 1}`}
            </button>
            {demos.length > 0 && (
              <button type="button" className="btn-ghost mb-2" onClick={() => setStarting(false)}>
                Cancel
              </button>
            )}
          </div>
        ) : (
          <button type="button" className="btn-secondary btn-sm" onClick={() => setStarting(true)}>
            Start another demo
          </button>
        )
      )}

      {canDecide && (demos.some((d) => d.savingsPct !== null) || overridePct !== null) && (
        <div className="pt-2 border-t border-[var(--border-subtle)] space-y-2">
          {overriding ? (
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Agreed benchmark %" htmlFor="ov-pct">
                <input id="ov-pct" type="number" step="0.01" className="field field-auto w-28" value={pct} onChange={(e) => setPct(e.target.value)} />
              </Field>
              <Field label="Why it differs from what the demos measured" htmlFor="ov-reason">
                <input id="ov-reason" className="field" value={reason} onChange={(e) => setReason(e.target.value)} />
              </Field>
              <button type="button" className="btn-primary mb-2" disabled={pending} onClick={() => run(() => setBenchmarkOverride({ circuitId, pct: pct.trim() === "" ? null : Number(pct), reason }), () => setOverriding(false))}>
                Save
              </button>
              {overridePct !== null && (
                <button type="button" className="btn-ghost mb-2" disabled={pending} onClick={() => run(() => setBenchmarkOverride({ circuitId, pct: null }), () => setOverriding(false))}>
                  Remove the override
                </button>
              )}
              <button type="button" className="btn-ghost mb-2" onClick={() => setOverriding(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="text-[var(--text-muted)]">
                {overridePct !== null ? (
                  <>
                    <strong className="text-[var(--text)]">Agreed benchmark {overridePct}%</strong> — what this society is billed against.
                    {/* The live figure beside the recorded reason: the reason
                        was written when the override was set and describes
                        the demos of that moment, which may since have been
                        redone (2026-09-27, user-caught — the reason still
                        quoted the deleted paper demos' 56.28%). */}
                    {measuredNow !== null && (
                      <> The demos on record now measure <span className="num">{measuredNow.toFixed(2)}%</span>
                        {hasExclusion(exclusion) ? " on the replaced lights" : ""}.</>
                    )}
                    {overrideReason && <span className="block text-xs mt-0.5">Reason recorded with the override: {overrideReason}</span>}
                  </>
                ) : (
                  "Not overridden — the benchmark is what the demos measured."
                )}
              </span>
              <button type="button" className="btn-secondary btn-sm" onClick={() => setOverriding(true)}>
                {overridePct !== null ? "Change the agreed benchmark" : "Record an agreed benchmark"}
              </button>
            </div>
          )}
        </div>
      )}
      {error && <ErrorText>{error}</ErrorText>}
    </Card>
  );
}
