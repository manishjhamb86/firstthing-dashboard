"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, ErrorText, Field, StatusChip } from "@/components/ui";
import { setBenchmarkOverride, setDemoRejected, startDemo } from "./demo-step-actions";

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
export function DemosPanel({
  circuitId,
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
}: {
  circuitId: string;
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
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [combine, setCombine] = useState<"batch" | "rerun">("rerun");
  const [lights, setLights] = useState(String(meteredLightCount));
  const [overriding, setOverriding] = useState(false);
  const [pct, setPct] = useState(overridePct === null ? "" : String(overridePct));
  const [reason, setReason] = useState(overrideReason ?? "");
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
                  <td className="num text-right">{d.meteredLightCount}</td>
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
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
                {overridePct !== null ? `Agreed benchmark ${overridePct}% — ${overrideReason}` : "Not overridden — the benchmark is what the demos measured."}
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
