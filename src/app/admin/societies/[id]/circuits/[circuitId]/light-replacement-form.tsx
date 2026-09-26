"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recordDemoReplacement, type DemoReplacementLine as ReplacementLine } from "./demo-step-actions";
import { Card, ErrorText, Field } from "@/components/ui";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export type ReplacementFormLine = {
  lineId: string;
  deviceName: string;
  count: number;
  wattage: number;
  hoursPerDay: number;
  /** The fixture type — a kept line of a type being replaced is "the same item". */
  deviceTypeId: string;
  /** Already marked at the survey as not part of the retrofit. */
  excluded: boolean;
  options: { id: string; name: string; defaultWattage: number | null }[];
};

/** The select's value for "this line stays on the circuit, unreplaced". */
const EXCLUDE = "__exclude__";

type LineState = { replacementTypeId: string; count: string; wattage: string };

const kwhPerDay = (l: ReplacementFormLine) => (l.count * l.wattage * l.hoursPerDay) / 1000;

/**
 * FEAT-013 + CON-45 — the engineer records, against each inventory line,
 * what was installed: a device from that line's own compatibility mapping,
 * with the installed count and wattage. A circuit with no inventory keeps
 * the date-only form (the legacy flow).
 */
export function LightReplacementForm({
  demoId,
  lines = [],
}: {
  demoId: string;
  lines?: ReplacementFormLine[];
}) {
  const [date, setDate] = useState(todayISO());
  const [lineState, setLineState] = useState<Record<string, LineState>>(() =>
    Object.fromEntries(
      lines.map((l) => [
        l.lineId,
        { replacementTypeId: l.excluded ? EXCLUDE : "", count: String(l.count), wattage: "" },
      ]),
    ),
  );
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function setLine(lineId: string, patch: Partial<LineState>) {
    setLineState((prev) => ({ ...prev, [lineId]: { ...prev[lineId], ...patch } }));
  }

  function pickReplacement(l: ReplacementFormLine, replacementTypeId: string) {
    const opt = l.options.find((o) => o.id === replacementTypeId);
    setLine(l.lineId, {
      replacementTypeId,
      // The catalog default fills in; the field stays editable.
      wattage:
        lineState[l.lineId]?.wattage.trim() === "" && opt?.defaultWattage
          ? String(opt.defaultWattage)
          : (lineState[l.lineId]?.wattage ?? ""),
    });
  }

  const isExcluded = (l: ReplacementFormLine) => lineState[l.lineId]?.replacementTypeId === EXCLUDE;
  const incomplete = lines.some((l) => {
    const st = lineState[l.lineId];
    if (st?.replacementTypeId === EXCLUDE) return false;
    return !st?.replacementTypeId || st.count.trim() === "" || st.wattage.trim() === "";
  });
  const excludedLines = lines.filter(isExcluded);
  const allExcluded = lines.length > 0 && excludedLines.length === lines.length;
  // Kept lights of a type that is being replaced elsewhere on the circuit are
  // "the same item": their share of the MEASURED figure comes off. Anything
  // else comes off at its rated draw (2026-09-26, the user's rules).
  const replacedTypes = new Set(lines.filter((l) => !isExcluded(l)).map((l) => l.deviceTypeId));
  const sameItem = (l: ReplacementFormLine) => replacedTypes.has(l.deviceTypeId);
  const keptLike = excludedLines.filter(sameItem);
  const keptOther = excludedLines.filter((l) => !sameItem(l));
  const likeTotal = lines.filter(sameItem).reduce((n, l) => n + l.count, 0);
  const otherKwh = keptOther.reduce((n, l) => n + kwhPerDay(l), 0);

  function submit() {
    // A count that differs from the original is real (a broken fitting left
    // unreplaced) but must be deliberate.
    const differing = lines.filter((l) => !isExcluded(l) && Number(lineState[l.lineId]?.count) !== l.count);
    if (differing.length > 0) {
      const detail = differing
        .map((l) => `${l.deviceName}: ${l.count} → ${lineState[l.lineId]?.count}`)
        .join(", ");
      if (!window.confirm(`Installed counts differ from the inventory (${detail}). Record it that way?`)) {
        return;
      }
    }
    startTransition(async () => {
      const replacements: ReplacementLine[] = lines.map((l) =>
        isExcluded(l)
          ? { lineId: l.lineId, replacementTypeId: "", count: l.count, wattage: l.wattage, exclude: true }
          : {
              lineId: l.lineId,
              replacementTypeId: lineState[l.lineId].replacementTypeId,
              count: Number(lineState[l.lineId].count),
              wattage: Number(lineState[l.lineId].wattage),
            },
      );
      const result = await recordDemoReplacement({ demoId, replacedOn: date, lines: replacements });
      setError(result?.error);
      if (!result?.error) router.refresh();
    });
  }

  return (
    <Card className="p-5 space-y-4">
      {lines.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-[var(--text-muted)]">
            Record what was installed against each line of the inventory. The dropdown only offers
            devices mapped as compatible in the catalog. A fixture that stays on the circuit unreplaced
            is marked <strong className="text-[var(--text)]">Not replaced — exclude from the benchmark</strong>: its
            draw is subtracted from both the before and after averages, and the reports say so.
          </p>
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Existing</th>
                  <th>Installed device</th>
                  <th>Count</th>
                  <th>W each</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.lineId}>
                    <td>
                      {l.count} × {l.deviceName} ({l.wattage}W)
                    </td>
                    <td>
                      <select
                        value={lineState[l.lineId]?.replacementTypeId ?? ""}
                        onChange={(e) => pickReplacement(l, e.target.value)}
                        disabled={pending}
                        aria-label={`Replacement for ${l.deviceName}`}
                        className="field field-auto"
                      >
                        <option value="">
                          {l.options.length === 0 ? "No compatible device mapped" : "Pick…"}
                        </option>
                        {l.options.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ))}
                        <option value={EXCLUDE}>Not replaced — exclude from the benchmark</option>
                      </select>
                    </td>
                    {isExcluded(l) ? (
                      <td colSpan={2} className="text-[13px] text-[var(--text-muted)]">
                        {sameItem(l) ? (
                          <>Kept — same kind as the replaced lights, so its share of the measured figure comes off</>
                        ) : (
                          <>
                            Stays on the circuit · rated draw <span className="num">{kwhPerDay(l).toFixed(2)}</span> kWh/day comes off
                          </>
                        )}
                      </td>
                    ) : (
                    <>
                    <td>
                      <input
                        type="number"
                        min={1}
                        value={lineState[l.lineId]?.count ?? ""}
                        onChange={(e) => setLine(l.lineId, { count: e.target.value })}
                        disabled={pending}
                        aria-label={`Installed count for ${l.deviceName}`}
                        className="field field-auto w-20"
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={1}
                        step="0.5"
                        value={lineState[l.lineId]?.wattage ?? ""}
                        onChange={(e) => setLine(l.lineId, { wattage: e.target.value })}
                        disabled={pending}
                        aria-label={`Installed wattage for ${l.deviceName}`}
                        className="field field-auto w-24"
                      />
                    </td>
                    </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {excludedLines.length > 0 && (
            <p className="text-[13px] text-[var(--text-muted)]">
              {allExcluded ? (
                <strong className="text-[var(--bad-fg)]">
                  Every line is excluded — at least one has to be replaced for the demo to measure a saving.
                </strong>
              ) : (
                <>
                  The saving will be measured on the lights that are replaced.{" "}
                  {keptLike.length > 0 && (
                    <>
                      {keptLike.map((l) => `${l.count} × ${l.deviceName}`).join(", ")} kept: the same kind as the replaced
                      lights, so their share of what the meter measured comes off both the before and after figures —
                      before ÷ {likeTotal} × {keptLike.reduce((n, l) => n + l.count, 0)}.{" "}
                    </>
                  )}
                  {keptOther.length > 0 && (
                    <>
                      {keptOther.map((l) => `${l.count} × ${l.deviceName}`).join(", ")}: a different item, so its rated
                      draw of <span className="num">{otherKwh.toFixed(2)}</span> kWh/day comes off both.
                    </>
                  )}
                </>
              )}
            </p>
          )}
        </div>
      )}

      <Field
        label="Date the last light was replaced"
        htmlFor="lr-date"
        hint="This pivot day is left out of both periods — the pre-install period ends before it, the post-install period starts after it."
      >
        <input
          id="lr-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          disabled={pending}
          className="field"
        />
      </Field>
      {error && <ErrorText>{error}</ErrorText>}
      <button
        type="button"
        onClick={submit}
        disabled={pending || (lines.length > 0 && (incomplete || allExcluded))}
        className="btn-primary"
      >
        {/* Not "Mark installation complete" any more: recording the work no
            longer completes the install — CON-18's departure gate pass does,
            and it comes after this step because it itemizes what was fitted
            (user-reported 2026-08-24). */}
        Record the replacement
      </button>
      <p className="mt-2 text-[13px] text-[var(--text-muted)]">
        The circuit moves to post-install monitoring once the completion gate pass is submitted —
        it is required before the crew leaves site.
      </p>
    </Card>
  );
}
