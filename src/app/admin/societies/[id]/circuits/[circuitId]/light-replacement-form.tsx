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
  /** Already marked at the survey (or at the replacement) as kept, not replaced. */
  excluded: boolean;
  /** What the replacement recorded for this line, when it has been recorded. */
  recorded?: { replacementTypeId: string | null; replacementCount: number | null; replacementWattage: number | null } | null;
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
  correcting = false,
  initialDate,
  onDone,
}: {
  demoId: string;
  lines?: ReplacementFormLine[];
  /**
   * Correct a replacement already recorded (2026-09-27, user-asked: "what if
   * I have to change that excluded light count from 8 to 9?"): opens with
   * what was recorded — which lines were replaced, how many on each, and
   * which were kept — and saves the change. Nothing about the kept count is
   * fixed; it is whatever the lines say.
   */
  correcting?: boolean;
  initialDate?: string;
  onDone?: () => void;
}) {
  const [date, setDate] = useState(initialDate ?? todayISO());
  const [lineState, setLineState] = useState<Record<string, LineState>>(() =>
    Object.fromEntries(
      lines.map((l) => [
        l.lineId,
        l.excluded
          ? { replacementTypeId: EXCLUDE, count: String(l.count), wattage: "" }
          : {
              replacementTypeId: l.recorded?.replacementTypeId ?? "",
              count: String(l.recorded?.replacementCount ?? l.count),
              wattage: l.recorded?.replacementWattage != null ? String(l.recorded.replacementWattage) : "",
            },
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
    const tooMany = lines.find((l) => !isExcluded(l) && Number(lineState[l.lineId]?.count) > l.count);
    if (tooMany) {
      setError(`${tooMany.deviceName}: the line holds ${tooMany.count} lights — no more than that can have been replaced.`);
      return;
    }
    const differing = correcting ? [] : lines.filter((l) => !isExcluded(l) && Number(lineState[l.lineId]?.count) !== l.count);
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
      if (!result?.error) {
        onDone?.();
        router.refresh();
      }
    });
  }

  return (
    <Card className="p-5 space-y-4">
      {lines.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-[var(--text-muted)]">
            Record what was installed against each line of the inventory. The dropdown only offers
            devices mapped as compatible in the catalog. <strong className="text-[var(--text)]">Replaced</strong> is how many
            lights on the line were changed — any fewer than the line holds are kept as they were. A fixture that stays on the circuit unreplaced
            is marked <strong className="text-[var(--text)]">Not replaced — exclude from the benchmark</strong>: its
            draw is subtracted from both the before and after averages, and the reports say so.
          </p>
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Existing</th>
                  <th>Installed device</th>
                  <th>Replaced</th>
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
                        max={l.count}
                        value={lineState[l.lineId]?.count ?? ""}
                        onChange={(e) => setLine(l.lineId, { count: e.target.value })}
                        disabled={pending}
                        aria-label={`Installed count for ${l.deviceName}`}
                        className="field field-auto w-20"
                      />
                      {/* The rest of the line stays as it was — kept, and left
                          out of the saving by the same rule as a kept line. */}
                      {Number(lineState[l.lineId]?.count) > 0 && Number(lineState[l.lineId]?.count) < l.count && (
                        <span className="mt-1 block text-xs text-[var(--text-muted)]">
                          of {l.count} · {l.count - Number(lineState[l.lineId]?.count)} kept
                        </span>
                      )}
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
        {correcting ? "Save the correction" : "Record the replacement"}
      </button>
      {correcting ? (
        <p className="mt-2 text-[13px] text-[var(--text-muted)]">
          The demo&apos;s saving is worked out again from the corrected lines; the change is kept in its history.
        </p>
      ) : (
        <p className="mt-2 text-[13px] text-[var(--text-muted)]">
          The circuit moves to post-install monitoring once the completion gate pass is submitted —
          it is required before the crew leaves site.
        </p>
      )}
    </Card>
  );
}

/**
 * The done replacement step: what was replaced and what was kept, line by
 * line, and a way to correct it — the kept count is whatever the lines say,
 * so moving 8 kept to 9 is changing how many on a line were replaced.
 */
export function ReplacementRecord({
  demoId,
  lines,
  date,
  canCorrect,
}: {
  demoId: string;
  lines: ReplacementFormLine[];
  date: string;
  canCorrect: boolean;
}) {
  const [open, setOpen] = useState(false);
  const replaced = (l: ReplacementFormLine) => (l.excluded ? 0 : (l.recorded?.replacementCount ?? 0));
  if (lines.length === 0) return null;
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>Inventory line</th>
              <th className="text-right">Replaced</th>
              <th className="text-right">Kept</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.lineId}>
                <td>
                  {l.count} × {l.deviceName}
                </td>
                <td className="num text-right">{replaced(l)}</td>
                <td className="num text-right">{l.count - replaced(l)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canCorrect &&
        (open ? (
          <div className="space-y-2">
            <LightReplacementForm demoId={demoId} lines={lines} correcting initialDate={date} onDone={() => setOpen(false)} />
            <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(true)}>
            Correct what was replaced and kept
          </button>
        ))}
    </div>
  );
}
