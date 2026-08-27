"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardTitle, ErrorText, Field, StatusChip } from "@/components/ui";
import { describeBasis, deriveBenchmark, type DemoInput } from "@/lib/circuit-demos";
import { recordCircuitDemo, setBenchmarkOverride, setDemoRejected } from "./demo-actions";

export type DemoDTO = DemoInput & {
  meteredLightCount: number;
  preInstallBaseline: number;
  postInstallAverage: number;
  rejectionReason: string | null;
  note: string | null;
  readingCount: number;
  /** The demo's own daily table, as printed in the report it came from. */
  readings: { date: string; kWh: number; phase: "pre" | "post" }[];
};

export function DemosPanel({
  circuitId,
  demos,
  overridePct,
  overrideReason,
  canEdit,
}: {
  circuitId: string;
  demos: DemoDTO[];
  overridePct: number | null;
  overrideReason: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [overriding, setOverriding] = useState(false);
  const [openDemo, setOpenDemo] = useState<string | null>(null);
  const [pct, setPct] = useState(overridePct === null ? "" : String(overridePct));
  const [why, setWhy] = useState(overrideReason ?? "");
  const [lights, setLights] = useState("");
  const [pre, setPre] = useState("");
  const [post, setPost] = useState("");

  const derived = deriveBenchmark(
    demos,
    overridePct === null ? null : { pct: overridePct, reason: overrideReason ?? "" },
  );
  const run = (fn: () => Promise<{ ok?: true; error?: string }>, done?: () => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (r.error) setError(r.error);
      else { done?.(); router.refresh(); }
    });

  return (
    <Card className="mb-5 p-6">
      <CardTitle>Demos &amp; benchmark</CardTitle>
      <p className="mb-4 text-[13px]" style={{ color: "var(--text-muted)" }}>
        A circuit can be demonstrated more than once. A demo that ran badly is rejected and the one
        done in its place decides alone; a second run at the society&apos;s own request counts
        alongside the first, and the benchmark is the mean of their savings percentages.
      </p>

      <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-2xl num font-semibold">
          {derived.pct === null ? "—" : `${derived.pct.toFixed(2)}%`}
        </span>
        <span className="text-[13px]" style={{ color: "var(--text-muted)" }}>
          {describeBasis(derived.basis)}
        </span>
        {derived.raw !== null && !derived.inBand && (
          <StatusChip tone="warn">
            Measured {derived.raw.toFixed(2)}% — outside CON-20&apos;s 60–80% band
          </StatusChip>
        )}
      </div>

      {demos.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          No demo on record. A circuit backfilled from paper may have its benchmark set by hand
          instead — the override below says so where that is the case.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Demo</th><th>Lights</th><th>Before</th><th>After</th><th>Savings</th>
                <th>Days</th><th>Counts?</th><th></th>
              </tr>
            </thead>
            <tbody>
              {demos.map((d) => (
                <Fragment key={d.id}>
                <tr style={d.rejected ? { opacity: 0.6 } : undefined}>
                  <td className="num">#{d.sequence}</td>
                  <td className="num">{d.meteredLightCount}</td>
                  <td className="num">{d.preInstallBaseline.toFixed(2)}</td>
                  <td className="num">{d.postInstallAverage.toFixed(2)}</td>
                  <td className="num">{d.savingsPct.toFixed(2)}%</td>
                  <td className="num">
                    {d.readingCount === 0 ? (
                      "—"
                    ) : (
                      <button type="button" className="btn-ghost btn-sm"
                        aria-expanded={openDemo === d.id}
                        onClick={() => setOpenDemo(openDemo === d.id ? null : d.id)}>
                        {d.readingCount}
                      </button>
                    )}
                  </td>
                  <td>
                    {d.rejected ? (
                      <StatusChip tone="warn">Rejected</StatusChip>
                    ) : (
                      <StatusChip tone="ok">Counts</StatusChip>
                    )}
                    {d.rejectionReason && (
                      <span className="block text-[12px]" style={{ color: "var(--text-subtle)" }}>
                        {d.rejectionReason}
                      </span>
                    )}
                  </td>
                  <td>
                    {canEdit && (d.rejected ? (
                      <button type="button" className="btn-ghost btn-sm" disabled={pending}
                        onClick={() => run(() => setDemoRejected({ demoId: d.id, rejected: false }))}>
                        Count it again
                      </button>
                    ) : rejecting === d.id ? (
                      <span className="flex flex-wrap items-center gap-2">
                        <input className="field field-auto" placeholder="Why is it rejected?"
                          value={reason} onChange={(e) => setReason(e.target.value)}
                          aria-label={`Why demo ${d.sequence} is rejected`} />
                        <button type="button" className="btn-primary btn-sm" disabled={pending}
                          onClick={() => run(
                            () => setDemoRejected({ demoId: d.id, rejected: true, reason }),
                            () => { setRejecting(null); setReason(""); },
                          )}>
                          Reject
                        </button>
                        <button type="button" className="btn-ghost btn-sm"
                          onClick={() => { setRejecting(null); setReason(""); }}>Cancel</button>
                      </span>
                    ) : (
                      <button type="button" className="btn-ghost btn-sm" disabled={pending}
                        onClick={() => setRejecting(d.id)}>Reject</button>
                    ))}
                  </td>
                </tr>
                {openDemo === d.id && (
                  <tr>
                    <td colSpan={8} className="p-0">
                      <DemoReadings readings={d.readings} recorded={{ pre: d.preInstallBaseline, post: d.postInstallAverage }} />
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canEdit && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {adding ? (
            <div className="flex w-full flex-wrap items-end gap-3">
              <Field label="Lights in this demo" htmlFor="dm-n">
                <input id="dm-n" type="number" className="field field-auto w-28" value={lights}
                  onChange={(e) => setLights(e.target.value)} />
              </Field>
              <Field label="Before (kWh/day)" htmlFor="dm-pre">
                <input id="dm-pre" type="number" step="0.01" className="field field-auto w-32" value={pre}
                  onChange={(e) => setPre(e.target.value)} />
              </Field>
              <Field label="After (kWh/day)" htmlFor="dm-post">
                <input id="dm-post" type="number" step="0.01" className="field field-auto w-32" value={post}
                  onChange={(e) => setPost(e.target.value)} />
              </Field>
              <button type="button" className="btn-primary mb-2" disabled={pending}
                onClick={() => run(
                  () => recordCircuitDemo({
                    circuitId, meteredLightCount: Number(lights),
                    preInstallBaseline: Number(pre), postInstallAverage: Number(post),
                  }),
                  () => { setAdding(false); setLights(""); setPre(""); setPost(""); },
                )}>
                Record it
              </button>
              <button type="button" className="btn-ghost mb-2" onClick={() => setAdding(false)}>Cancel</button>
            </div>
          ) : (
            <button type="button" className="btn-secondary" onClick={() => setAdding(true)}>
              Record another demo
            </button>
          )}
        </div>
      )}

      <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--hairline)" }}>
        <p className="text-sm font-medium">Benchmark override</p>
        <p className="mb-2 text-[13px]" style={{ color: "var(--text-muted)" }}>
          The agreed figure is what the society is billed against, and it does not always equal what
          the demos measured. Rounding counts as an override too — nothing here is rounded
          automatically. What the demos measured stays on record either way, and an override never
          moves a circuit into CON-20&apos;s band.
        </p>
        {overridePct !== null && !overriding ? (
          <p className="text-sm">
            <span className="num font-semibold">{overridePct.toFixed(2)}%</span>
            {overrideReason ? ` — ${overrideReason}` : ""}
            {canEdit && (
              <>
                {" "}
                <button type="button" className="btn-ghost btn-sm" onClick={() => setOverriding(true)}>Change</button>
                <button type="button" className="btn-ghost btn-sm" disabled={pending}
                  onClick={() => run(() => setBenchmarkOverride({ circuitId, pct: null }))}>
                  Remove, use the demos
                </button>
              </>
            )}
          </p>
        ) : canEdit && (overriding || overridePct === null) ? (
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Benchmark %" htmlFor="ov-pct">
              <input id="ov-pct" type="number" step="0.01" className="field field-auto w-28" value={pct}
                onChange={(e) => setPct(e.target.value)} />
            </Field>
            <Field label="Why" htmlFor="ov-why" hint="Kept on record with your name and the date">
              <input id="ov-why" className="field" value={why} onChange={(e) => setWhy(e.target.value)} />
            </Field>
            <button type="button" className="btn-primary mb-2" disabled={pending}
              onClick={() => run(
                () => setBenchmarkOverride({ circuitId, pct: Number(pct), reason: why }),
                () => setOverriding(false),
              )}>
              Set it
            </button>
            {overriding && (
              <button type="button" className="btn-ghost mb-2" onClick={() => setOverriding(false)}>Cancel</button>
            )}
          </div>
        ) : (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Not overridden.</p>
        )}
      </div>

      {error && <ErrorText>{error}</ErrorText>}
    </Card>
  );
}

/**
 * A demo's own daily table, as the report printed it.
 *
 * The mean of the days is shown beside the figure the demo was recorded
 * with, and where the two differ the difference is stated rather than
 * quietly reconciled: Aditya Urban Casa's first demo prints five days that
 * average 24.5580 under a stated 24.53, and every downstream figure in that
 * report — its 48.28%, and the 66.72% in the signed agreement — was
 * computed from 24.53. The recorded figure stays what was agreed; the days
 * stay what was measured; the gap is visible to whoever needs to chase it.
 */
function DemoReadings({
  readings,
  recorded,
}: {
  readings: { date: string; kWh: number; phase: "pre" | "post" }[];
  recorded: { pre: number; post: number };
}) {
  const groups = [
    { phase: "pre" as const, label: "Before the lights were replaced", recorded: recorded.pre },
    { phase: "post" as const, label: "After", recorded: recorded.post },
  ];
  return (
    <div className="grid gap-4 p-4 sm:grid-cols-2" style={{ background: "var(--surface-sunken)" }}>
      {groups.map((g) => {
        const rows = readings.filter((r) => r.phase === g.phase);
        if (rows.length === 0) return null;
        const mean = rows.reduce((a, r) => a + r.kWh, 0) / rows.length;
        const agrees = Math.abs(mean - g.recorded) < 0.0101;
        return (
          <div key={g.phase}>
            <p className="text-[13px] font-medium">{g.label}</p>
            <p className="mb-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
              {rows.length} days averaging <span className="num">{mean.toFixed(4)}</span> kWh/day
              {agrees ? (
                <> — the figure this demo was recorded with.</>
              ) : (
                <>
                  {" "}— but this demo was recorded at{" "}
                  <span className="num">{g.recorded}</span>, which is the figure the report&apos;s
                  own savings and the signed agreement were computed from.
                </>
              )}
            </p>
            <table className="tbl">
              <thead><tr><th>Date</th><th>kWh</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.date}>
                    <td className="num">{r.date}</td>
                    <td className="num">{r.kWh.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
