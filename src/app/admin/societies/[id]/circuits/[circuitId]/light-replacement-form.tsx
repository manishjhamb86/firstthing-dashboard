"use client";

import { useState, useTransition } from "react";
import { recordLightReplacement, type ReplacementLine } from "./actions";
import { Card, ErrorText, Field } from "@/components/ui";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export type ReplacementFormLine = {
  lineId: string;
  deviceName: string;
  count: number;
  wattage: number;
  options: { id: string; name: string; defaultWattage: number | null }[];
};

type LineState = { replacementTypeId: string; count: string; wattage: string };

/**
 * FEAT-013 + CON-45 — the engineer records, against each inventory line,
 * what was installed: a device from that line's own compatibility mapping,
 * with the installed count and wattage. A circuit with no inventory keeps
 * the date-only form (the legacy flow).
 */
export function LightReplacementForm({
  circuitId,
  lines = [],
}: {
  circuitId: string;
  lines?: ReplacementFormLine[];
}) {
  const [date, setDate] = useState(todayISO());
  const [lineState, setLineState] = useState<Record<string, LineState>>(() =>
    Object.fromEntries(
      lines.map((l) => [
        l.lineId,
        { replacementTypeId: "", count: String(l.count), wattage: "" },
      ]),
    ),
  );
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

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

  const incomplete = lines.some((l) => {
    const st = lineState[l.lineId];
    return !st?.replacementTypeId || st.count.trim() === "" || st.wattage.trim() === "";
  });

  function submit() {
    // A count that differs from the original is real (a broken fitting left
    // unreplaced) but must be deliberate.
    const differing = lines.filter((l) => Number(lineState[l.lineId]?.count) !== l.count);
    if (differing.length > 0) {
      const detail = differing
        .map((l) => `${l.deviceName}: ${l.count} → ${lineState[l.lineId]?.count}`)
        .join(", ");
      if (!window.confirm(`Installed counts differ from the inventory (${detail}). Record it that way?`)) {
        return;
      }
    }
    startTransition(async () => {
      const replacements: ReplacementLine[] = lines.map((l) => ({
        lineId: l.lineId,
        replacementTypeId: lineState[l.lineId].replacementTypeId,
        count: Number(lineState[l.lineId].count),
        wattage: Number(lineState[l.lineId].wattage),
      }));
      const result = await recordLightReplacement(circuitId, date, replacements);
      setError(result?.error);
    });
  }

  return (
    <Card className="p-5 space-y-4">
      {lines.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-[var(--text-muted)]">
            Record what was installed against each line of the inventory. The dropdown only offers
            devices mapped as compatible in the catalog.
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
                      </select>
                    </td>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Field
        label="Date the last light was replaced"
        htmlFor="lr-date"
        hint="CON-19 — this pivot day is excluded; the post-install window starts the next midnight. The inventory and the pre-install baseline freeze with it."
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
        disabled={pending || (lines.length > 0 && incomplete)}
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
        CON-18 requires it before the crew leaves site.
      </p>
    </Card>
  );
}
