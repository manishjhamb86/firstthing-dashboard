"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, ErrorText, Field, StatusChip } from "@/components/ui";
import { formatDate } from "@/lib/format-date";
import { hasExclusion, savingsPct, type Exclusion } from "@/lib/circuit-load";
import { ExclusionNote } from "@/components/exclusion-note";
import { acceptDemoPhase, deleteDemoDay, refreshDemoReadings, revertDemoDayToMeter, saveDemoDays, setDemoDay, setDemoDayExclusion, setDemoPeriods } from "./demo-step-actions";

export type DemoDayDTO = {
  id: string;
  date: string;
  kWh: number;
  source: "meter" | "manual" | "demo_generated" | "migrated";
  meterKwh: number | null;
  hoursCovered: number | null;
  dataHours: number | null;
  excluded: boolean;
  excludedReason: string | null;
  changedSinceAccept: boolean;
};

const SOURCE: Record<DemoDayDTO["source"], { label: string; tone: "ok" | "info" | "warn" | "neu" }> = {
  meter: { label: "Meter", tone: "ok" },
  manual: { label: "Typed", tone: "info" },
  demo_generated: { label: "Demo mode", tone: "warn" },
  migrated: { label: "Migrated", tone: "neu" },
};

/**
 * One period of one demo: choose the dates, fill the days from the meter or
 * type them, include or exclude each, then "Accept these N days". Only the
 * period's own days are the demo's readings — nothing before, between or after.
 */
export function DemoReadingsPanel({
  demoId,
  phase,
  editable,
  periods,
  suggested,
  days,
  missing,
  accepted,
  theoretical,
  baseline,
  exclusion,
}: {
  demoId: string;
  phase: "pre" | "post";
  editable: boolean;
  periods: { preFrom: string; preTo: string; postFrom: string; postTo: string };
  suggested: { from: string; to: string } | null;
  days: DemoDayDTO[];
  /** Days of the period with nothing recorded — typeable. */
  missing: string[];
  accepted: { version: number; averageKwh: number | null; countedDays: number; at: string } | null;
  /** Pre: the inventory's theoretical kWh/day, to judge each day against. */
  theoretical: number | null;
  /** Post: the accepted pre average, to show each day's saving. */
  baseline: number | null;
  /**
   * Post: what stayed on the circuit unreplaced. Its share comes off both the
   * before and after figures, so each day's saving is on the replaced lights
   * (2026-09-26, user-specified).
   */
  exclusion?: Exclusion;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const own = phase === "pre" ? { from: periods.preFrom, to: periods.preTo } : { from: periods.postFrom, to: periods.postTo };
  const [from, setFrom] = useState(own.from || suggested?.from || "");
  const [to, setTo] = useState(own.to || suggested?.to || "");
  const [editingPeriod, setEditingPeriod] = useState(!own.from);
  // Every date of the period the meter has nothing for, laid out at once
  // (2026-09-26, user-asked): type each, remove the ones there is no figure
  // for, then save them together. Reset whenever the set of missing dates
  // stays removed after a save. Each day carries a "counted" tick: unticked
  // days are kept on the demo but out of its average.
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [draftCounted, setDraftCounted] = useState<Record<string, boolean>>({});
  const [removedAll, setRemoved] = useState<string[]>([]);
  // A saved day's tick shows at once; it is undone if the server refuses.
  const [tick, setTick] = useState<Record<string, boolean>>({});
  const setCounted = (id: string, counted: boolean, reason?: string) => {
    setTick((cur) => ({ ...cur, [id]: counted }));
    setError(null);
    start(async () => {
      const r = await setDemoDayExclusion(id, !counted, reason);
      if (r.error) {
        setError(r.error);
        setTick((cur) => {
          const next = { ...cur };
          delete next[id];
          return next;
        });
      } else router.refresh();
    });
  };
  const removed = removedAll.filter((m) => missing.includes(m));
  const kept = missing.filter((m) => !removed.includes(m));
  const blank = kept.filter((m) => (draft[m] ?? "").trim() === "");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const run = (fn: () => Promise<{ error?: string }>) => {
    setError(null);
    start(async () => {
      const r = await fn();
      if (r.error) setError(r.error);
      else router.refresh();
    });
  };

  const counted = days.filter((d) => !d.excluded);
  const average = counted.length > 0 ? counted.reduce((s, d) => s + d.kWh, 0) / counted.length : null;
  const changed = accepted !== null && (days.some((d) => d.changedSinceAccept) || accepted.countedDays !== counted.length);
  const label = phase === "pre" ? "pre-installation" : "post-installation";
  type Row = { kind: "stored"; date: string; d: DemoDayDTO } | { kind: "draft"; date: string };
  const rows: Row[] = [
    ...days.map((d): Row => ({ kind: "stored", date: d.date, d })),
    ...(editable ? kept.map((m): Row => ({ kind: "draft", date: m })) : []),
  ].sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        {own.from && !editingPeriod ? (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>
              Period <span className="num font-medium">{formatDate(new Date(`${own.from}T00:00:00Z`))}</span> →{" "}
              <span className="num font-medium">{formatDate(new Date(`${own.to}T00:00:00Z`))}</span>
            </span>
            {editable && (
              <button type="button" className="btn-secondary btn-sm" onClick={() => setEditingPeriod(true)}>
                Change the period
              </button>
            )}
          </div>
        ) : editable ? (
          <div className="flex flex-wrap items-end gap-3">
            <Field label={`${phase === "pre" ? "Pre" : "Post"}-installation period — from`} htmlFor={`dp-${phase}-from`}>
              <input id={`dp-${phase}-from`} type="date" className="field field-auto" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="to" htmlFor={`dp-${phase}-to`}>
              <input id={`dp-${phase}-to`} type="date" className="field field-auto" value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
            <button
              type="button"
              className="btn-primary mb-2"
              disabled={pending || !from || !to}
              onClick={() =>
                run(async () => {
                  const next = { ...periods, ...(phase === "pre" ? { preFrom: from, preTo: to } : { postFrom: from, postTo: to }) };
                  const r = await setDemoPeriods(demoId, next);
                  if (!r.error) setEditingPeriod(false);
                  return r;
                })
              }
            >
              {pending ? "Saving…" : "Save the period"}
            </button>
            {own.from && (
              <button type="button" className="btn-ghost mb-2" onClick={() => setEditingPeriod(false)}>
                Cancel
              </button>
            )}
          </div>
        ) : (
          <p className="text-sm text-[var(--text-muted)]">No {label} period chosen yet.</p>
        )}
        <p className="text-xs text-[var(--text-muted)]">
          Only days inside the period are this demo&apos;s {label} readings and appear in its report — nothing before, between
          or after.
        </p>
      </Card>

      {own.from && (
        <Card className="p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">
              {days.length} day{days.length === 1 ? "" : "s"} · {counted.length} counted
              {average !== null && (
                <>
                  {" "}
                  · average <span className="num">{average.toFixed(2)}</span> kWh/day
                </>
              )}
              {phase === "post" && average !== null && baseline && (
                <>
                  {" "}
                  · saving{" "}
                  <span className="num">{savingsPct(baseline, average, exclusion)?.toFixed(1) ?? "—"}%</span>
                  {hasExclusion(exclusion) ? " on the replaced lights" : ""}
                </>
              )}
            </span>
            {accepted && (
              <StatusChip tone={changed ? "warn" : "ok"}>
                {changed ? `Changed since accepted v${accepted.version}` : `Accepted v${accepted.version}`}
              </StatusChip>
            )}
            {editable && (
              <button type="button" className="btn-secondary btn-sm ml-auto" disabled={pending} onClick={() => run(() => refreshDemoReadings(demoId))}>
                Fill from the meter
              </button>
            )}
          </div>
          {phase === "post" && <ExclusionNote exclusion={exclusion} before={baseline} after={average} />}
          {accepted && changed && (
            <p className="text-xs" style={{ color: "var(--warn-fg)" }}>
              The accepted figure ({accepted.averageKwh?.toFixed(2) ?? "—"} kWh/day from {accepted.countedDays} days) stays in force
              until these days are accepted again.
            </p>
          )}
          {days.length === 0 && (!editable || kept.length === 0) ? (
            <p className="text-sm text-[var(--text-muted)]">
              No days yet. Upload the meter&apos;s CSV on the meter&apos;s page (its hours fill in here)
              {editable && removed.length > 0 ? ", or restore the removed dates to type them." : "."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="tbl tbl-compact">
                <thead>
                  <tr>
                    <th>Day</th>
                    <th className="text-right">kWh</th>
                    <th>Source</th>
                    <th className="text-right">Hours</th>
                    <th className="text-right">
                      {phase === "pre" ? "vs theoretical" : hasExclusion(exclusion) ? "Saving · replaced lights" : "Saving"}
                    </th>
                    <th>Counted</th>
                    {editable && <th />}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    if (row.kind === "draft") {
                      const m = row.date;
                      return (
                        <tr key={`draft-${m}`}>
                          <td className="num">{formatDate(new Date(`${m}T00:00:00Z`))}</td>
                          <td className="num text-right">
                            <input
                              aria-label={`kWh for ${m}`}
                              type="number"
                              step="0.01"
                              min="0"
                              className="field field-auto w-24"
                              value={draft[m] ?? ""}
                              onChange={(e) => setDraft({ ...draft, [m]: e.target.value })}
                            />
                          </td>
                          <td>
                            <StatusChip tone="neu">No reading</StatusChip>
                          </td>
                          <td className="num text-right">—</td>
                          <td className="num text-right">—</td>
                          <td>
                            <label className="inline-flex items-center gap-1.5 text-xs">
                              <input
                                type="checkbox"
                                aria-label={`Count ${m} in the average`}
                                checked={draftCounted[m] !== false}
                                onChange={(e) => setDraftCounted({ ...draftCounted, [m]: e.target.checked })}
                              />
                              {draftCounted[m] === false ? "Not counted" : "Counted"}
                            </label>
                          </td>
                          <td className="text-right">
                            <button type="button" className="btn-ghost btn-sm" aria-label={`Remove ${m}`} onClick={() => setRemoved([...removed, m])}>
                              Remove
                            </button>
                          </td>
                        </tr>
                      );
                    }
                    const d = row.d;
                    const judge =
                      phase === "pre"
                        ? theoretical
                          ? `${(((d.kWh - theoretical) / theoretical) * 100).toFixed(1)}%`
                          : "—"
                        : baseline
                          ? `${savingsPct(baseline, d.kWh, exclusion)?.toFixed(1) ?? "—"}%`
                          : "—";
                    return (
                      <tr key={d.id} style={d.excluded ? { opacity: 0.6 } : undefined}>
                        <td className="num">
                          {formatDate(new Date(`${d.date}T00:00:00Z`))}
                          {d.changedSinceAccept && accepted && (
                            <span className="ml-1 text-xs" style={{ color: "var(--warn-fg)" }}>
                              changed
                            </span>
                          )}
                        </td>
                        <td className="num text-right">
                          {editable && edits[d.id] !== undefined ? (
                            <span className="inline-flex items-center gap-1">
                              <input
                                aria-label={`kWh for ${d.date}`}
                                type="number"
                                step="0.01"
                                className="field field-auto w-24"
                                value={edits[d.id]}
                                onChange={(e) => setEdits({ ...edits, [d.id]: e.target.value })}
                              />
                              <button
                                type="button"
                                className="btn-primary btn-sm"
                                disabled={pending}
                                onClick={() =>
                                  run(async () => {
                                    const r = await setDemoDay({ demoId, date: d.date, phase, kWh: Number(edits[d.id]) });
                                    if (!r.error)
                                      setEdits((cur) => {
                                        const next = { ...cur };
                                        delete next[d.id];
                                        return next;
                                      });
                                    return r;
                                  })
                                }
                              >
                                Save
                              </button>
                            </span>
                          ) : (
                            <>
                              {d.kWh.toFixed(2)}
                              {d.meterKwh !== null && d.source !== "meter" && (
                                <span className="block text-xs text-[var(--text-muted)]">meter {d.meterKwh.toFixed(2)}</span>
                              )}
                            </>
                          )}
                        </td>
                        <td>
                          <StatusChip tone={SOURCE[d.source].tone}>{SOURCE[d.source].label}</StatusChip>
                        </td>
                        <td className="num text-right">
                          {d.hoursCovered === null ? "—" : d.dataHours !== null && d.dataHours < d.hoursCovered ? `${d.hoursCovered} · ${d.dataHours} with data` : d.hoursCovered}
                        </td>
                        <td className="num text-right">{judge}</td>
                        <td>
                          {editable ? (
                            <label className="inline-flex items-center gap-1.5 text-xs">
                              <input
                                type="checkbox"
                                aria-label={`Count ${d.date} in the average`}
                                checked={tick[d.id] ?? !d.excluded}
                                onChange={(e) => {
                                  if (e.target.checked) setCounted(d.id, true);
                                  else {
                                    const why = window.prompt(`Leave ${d.date} out of the average? It stays listed with this reason.`, "Not counted in the average");
                                    if (why) setCounted(d.id, false, why);
                                  }
                                }}
                              />
                              {!(tick[d.id] ?? !d.excluded) ? <span className="text-[var(--text-muted)]">Not counted{d.excludedReason && d.excludedReason !== "Not counted in the average" ? ` — ${d.excludedReason}` : ""}</span> : "Counted"}
                            </label>
                          ) : d.excluded ? (
                            <span className="text-xs text-[var(--text-muted)]">No — {d.excludedReason}</span>
                          ) : (
                            "Yes"
                          )}
                        </td>
                        {editable && (
                          <td className="whitespace-nowrap text-right">
                            {edits[d.id] === undefined && (
                              <button type="button" className="btn-ghost btn-sm" onClick={() => setEdits({ ...edits, [d.id]: String(d.kWh) })}>
                                Edit
                              </button>
                            )}
                            {d.meterKwh !== null && d.source !== "meter" && (
                              <button type="button" className="btn-ghost btn-sm" disabled={pending} onClick={() => run(() => revertDemoDayToMeter(d.id))}>
                                Use meter
                              </button>
                            )}
                            {d.source !== "meter" && (
                              <button
                                type="button"
                                className="btn-ghost btn-sm"
                                disabled={pending}
                                aria-label={`Remove ${d.date} from the period`}
                                onClick={() => {
                                  if (window.confirm(`Take ${d.date} out of this demo period? The typed figure is removed (kept in the change log).`)) run(async () => {
                                      const r = await deleteDemoDay(d.id);
                                      if (!r.error) setRemoved((cur) => [...cur, d.date]);
                                      return r;
                                    });
                                }}
                              >
                                Remove
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {editable && (kept.length > 0 || removed.length > 0) && (
            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-[var(--border-subtle)]">
              {kept.length > 0 && (
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={pending || blank.length > 0}
                  onClick={() =>
                    run(() =>
                      saveDemoDays({ demoId, phase, days: kept.map((m) => ({ date: m, kWh: Number(draft[m]), counted: draftCounted[m] !== false })) }),
                    )
                  }
                >
                  {pending ? "Saving…" : `Save ${kept.length} day${kept.length === 1 ? "" : "s"}`}
                </button>
              )}
              <span className="text-xs text-[var(--text-muted)]">
                {blank.length > 0
                  ? `Type a figure for each day, or remove the ${blank.length === 1 ? "day" : "days"} there is no reading for.`
                  : kept.length > 0
                    ? "Saved days can still be edited or excluded before they are accepted."
                    : ""}
                {removed.length > 0 && (
                  <>
                    {" "}
                    {removed.length} date{removed.length === 1 ? "" : "s"} removed —{" "}
                    <button type="button" className="underline" onClick={() => setRemoved([])}>
                      restore
                    </button>
                  </>
                )}
              </span>
            </div>
          )}

          {editable && days.length > 0 && (!accepted || changed) && (
            <div className="pt-2 border-t border-[var(--border-subtle)]">
              <button type="button" className="btn-primary" disabled={pending || counted.length === 0} onClick={() => run(() => acceptDemoPhase(demoId, phase))}>
                {pending ? "Accepting…" : `Accept these ${counted.length} day${counted.length === 1 ? "" : "s"}`}
              </button>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {phase === "pre"
                  ? "Accepting sets this demo's baseline from the counted days."
                  : "Accepting measures this demo's saving against its accepted baseline."}
              </p>
            </div>
          )}
          {error && <ErrorText>{error}</ErrorText>}
        </Card>
      )}
      {!own.from && error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}
