"use client";

import { useState, useTransition } from "react";
import { Card, EmptyState, ErrorText, Field, StatusChip } from "@/components/ui";
import { Modal } from "@/components/modal";
import { StepMarker } from "@/components/deal-stepper";
import {
  addCircuitDevice,
  correctLockedCount,
  correctLockedDeviceType,
  removeCircuitDevice,
  splitLockedDeviceLine,
  updateCircuitDevice,
} from "./inventory-actions";
import { removeExcludedDeviceLine } from "./rescale-actions";

export type InventoryLine = {
  id: string;
  deviceTypeId: string;
  deviceTypeName: string;
  count: number;
  wattage: number;
  hoursPerDay: number;
  note: string | null;
  replacementName: string | null;
  replacementCount: number | null;
  replacementWattage: number | null;
  historical: boolean;
  /** Stays on the circuit unreplaced; its draw comes off the benchmark. */
  excluded: boolean;
  /** Set only when this line was split to belong to one specific demo
   *  (2026-10-17) — e.g. "Demo 1". Null means it belongs to every demo. */
  demoLabel: string | null;
  /** Set only for a fixture added by a light-count change, well after
   *  commissioning — distinct from a demo-era kept/excluded line, which
   *  this is not: it never existed on the circuit at the demo. */
  addedViaRescaleDate: string | null;
};

export type CatalogOption = { id: string; name: string; defaultWattage: number | null };
export type DemoOption = { id: string; label: string };

function lineKwh(l: { count: number; wattage: number; hoursPerDay: number }) {
  return (l.count * l.wattage * l.hoursPerDay) / 1000;
}

const HOURS_PRESETS = ["24", "12", "custom"] as const;

export function HoursInput({
  id,
  hours,
  setHours,
  disabled,
}: {
  id: string;
  hours: string;
  setHours: (v: string) => void;
  disabled: boolean;
}) {
  // 24 and 12 are the two real durations; custom stays available for the
  // genuine exception (a 2h staircase timer, a fan) — the user's call.
  const preset = hours === "24" || hours === "12" ? hours : "custom";
  return (
    <span className="inline-flex items-center gap-2">
      <select
        id={id}
        value={preset}
        onChange={(e) => {
          const v = e.target.value;
          setHours(v === "custom" ? "" : v);
        }}
        disabled={disabled}
        className="field field-auto"
      >
        {HOURS_PRESETS.map((h) => (
          <option key={h} value={h}>
            {h === "custom" ? "Custom…" : `${h} h`}
          </option>
        ))}
      </select>
      {preset === "custom" && (
        <input
          type="number"
          min={1}
          max={24}
          step="0.5"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          disabled={disabled}
          placeholder="h/day"
          aria-label="Custom hours per day"
          className="field field-auto w-20"
        />
      )}
    </span>
  );
}

// The add-line form is folded by default (user's call, 2026-08-17): an
// always-open form on a panel that already lists its lines reads as clutter,
// and this one is only used when something is genuinely being added. Opening
// it reveals a proper grid — the previous flex-wrap could not align, because
// each field carries a label above and one carries a hint below, so
// items-end had nothing consistent to align to.
function AddLineForm({
  circuitId,
  catalog,
  demoBackfill = false,
}: {
  circuitId: string;
  catalog: CatalogOption[];
  demoBackfill?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [typeId, setTypeId] = useState("");
  const [count, setCount] = useState("");
  const [wattage, setWattage] = useState("");
  const [hours, setHours] = useState("24");
  const [note, setNote] = useState("");
  const [historical, setHistorical] = useState(false);
  const [historicalNote, setHistoricalNote] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  function pickType(id: string) {
    setTypeId(id);
    const t = catalog.find((c) => c.id === id);
    // The catalog default fills the field; the field stays editable — a
    // "20W tube light" measured at 18W is recorded at 18.
    if (t?.defaultWattage && wattage.trim() === "") setWattage(String(t.defaultWattage));
  }

  function reset() {
    setTypeId("");
    setCount("");
    setWattage("");
    setHours("24");
    setNote("");
    setHistorical(false);
    setHistoricalNote("");
    setError(undefined);
  }

  function submit() {
    startTransition(async () => {
      const result = await addCircuitDevice({
        circuitId,
        deviceTypeId: typeId,
        count: Number(count),
        wattage: Number(wattage),
        hoursPerDay: Number(hours),
        note,
        historical,
        historicalNote,
      });
      if ("error" in result) {
        setError(result.error);
      } else {
        reset();
        setOpen(false);
      }
    });
  }

  const incomplete = !typeId || count.trim() === "" || wattage.trim() === "" || hours.trim() === "";
  const preview =
    !incomplete
      ? ((Number(count) || 0) * (Number(wattage) || 0) * (Number(hours) || 0)) / 1000
      : null;

  return (
    <>
      {/* Under a "locked" notice this used to render as the page's primary
          action, which reads as the normal way to change the inventory —
          "if inventory is locked then why is this button appearing?"
          (user-reported 2026-08-20). It is a demo-only backfill, so it now
          looks like one and says so. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={demoBackfill ? "btn-ghost btn-sm" : "btn-secondary"}
      >
        {demoBackfill ? "Add a past record (demo mode)" : "Add a device line"}
      </button>

      <Modal
        open={open}
        onClose={() => {
          reset();
          setOpen(false);
        }}
        title="New device line"
        description="Count × watts × hours is what the pre-installation readings get checked against."
        footer={
          <>
            <button type="button" onClick={submit} disabled={pending || incomplete} className="btn-primary">
              {pending ? "Adding…" : "Add line"}
            </button>
            <button
              type="button"
              onClick={() => {
                reset();
                setOpen(false);
              }}
              disabled={pending}
              className="btn-ghost"
            >
              Cancel
            </button>
            <span className="num ml-auto text-sm text-[var(--text-muted)]">
              {preview === null ? "—" : `${preview.toFixed(2)} kWh/day`}
            </span>
          </>
        }
      >
        <Field label="Device" htmlFor="add-type" hint="From the catalog — its wattage fills in and stays editable.">
          <select
            id="add-type"
            value={typeId}
            onChange={(e) => pickType(e.target.value)}
            disabled={pending}
            className="field"
          >
            <option value="">Pick from the catalog…</option>
            {catalog.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Count" htmlFor="add-count">
            <input
              id="add-count"
              type="number"
              min={1}
              value={count}
              onChange={(e) => setCount(e.target.value)}
              disabled={pending}
              className="field"
            />
          </Field>
          <Field label="Watts each" htmlFor="add-watt">
            <input
              id="add-watt"
              type="number"
              min={1}
              step="0.5"
              value={wattage}
              onChange={(e) => setWattage(e.target.value)}
              disabled={pending}
              className="field"
            />
          </Field>
        </div>

        <Field label="Runs for" htmlFor="add-hours">
          <HoursInput id="add-hours" hours={hours} setHours={setHours} disabled={pending} />
        </Field>

        <Field label="Note" htmlFor="add-note" hint="Optional.">
          <input
            id="add-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={pending}
            className="field"
          />
        </Field>

        {/* The one way past the post-replacement freeze: say plainly that
            this line is a reconstruction, not something captured on site. */}
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={historical}
            onChange={(e) => setHistorical(e.target.checked)}
            disabled={pending}
            className="mt-1"
          />
          <span>
            Past record — this circuit was commissioned before the system
            <span className="block text-xs text-[var(--text-subtle)]">
              Lets the line be entered after the lights were replaced. It stays marked as
              reconstructed, so a reading judged against it can be read for what it is.
            </span>
          </span>
        </label>

        {historical && (
          <Field label="Where this came from" htmlFor="add-hist-note" hint="Optional — the survey sheet, invoice or photo it was reconstructed from.">
            <input
              id="add-hist-note"
              value={historicalNote}
              onChange={(e) => setHistoricalNote(e.target.value)}
              disabled={pending}
              className="field"
            />
          </Field>
        )}

        {error && <ErrorText>{error}</ErrorText>}
      </Modal>
    </>
  );
}

function LineRow({
  line,
  editable,
  canCorrect = false,
  catalog,
  demos,
}: {
  line: InventoryLine;
  editable: boolean;
  canCorrect?: boolean;
  catalog: CatalogOption[];
  demos: DemoOption[];
}) {
  const [editing, setEditing] = useState(false);
  const [count, setCount] = useState(String(line.count));
  const [wattage, setWattage] = useState(String(line.wattage));
  const [hours, setHours] = useState(String(line.hoursPerDay));
  const [note, setNote] = useState(line.note ?? "");
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  // Reopening after a cancel must not show the abandoned edit.
  function open() {
    setCount(String(line.count));
    setWattage(String(line.wattage));
    setHours(String(line.hoursPerDay));
    setNote(line.note ?? "");
    setError(undefined);
    setEditing(true);
  }

  function save() {
    startTransition(async () => {
      const result = await updateCircuitDevice({
        lineId: line.id,
        count: Number(count),
        wattage: Number(wattage),
        hoursPerDay: Number(hours),
        note,
      });
      if ("error" in result) setError(result.error);
      else {
        setError(undefined);
        setEditing(false);
      }
    });
  }

  function remove() {
    if (!window.confirm(`Remove ${line.count} × ${line.deviceTypeName}? The theoretical figure changes with it.`)) return;
    startTransition(async () => {
      const result = await removeCircuitDevice(line.id);
      if ("error" in result) setError(result.error);
    });
  }

  const previewKwh =
    count && wattage && hours
      ? lineKwh({ count: Number(count), wattage: Number(wattage), hoursPerDay: Number(hours) })
      : null;

  return (
    <tr>
      <td>
        {line.deviceTypeName}
        {/* A reconstructed line must be readable as one — a reading judged
            against it is evidence of a different quality than one captured
            on site, and INV-02 means that has to be visible. */}
        {line.historical && (
          <span className="ml-2 align-middle">
            <StatusChip tone="neu">Past record</StatusChip>
          </span>
        )}
        {/* This line was split to belong to one specific demo (2026-10-17) —
            named so it's never mistaken for the circuit's whole inventory. */}
        {line.demoLabel && (
          <span className="ml-2 align-middle">
            <StatusChip tone="info">{line.demoLabel}</StatusChip>
          </span>
        )}
      </td>
      <td className="num">{line.count}</td>
      <td className="num">{line.wattage}</td>
      <td className="num">{line.hoursPerDay} h</td>
      <td className="num">{lineKwh(line).toFixed(2)}</td>
      <td className="text-[var(--text-muted)]">
        {line.addedViaRescaleDate
          ? `Added ${line.addedViaRescaleDate} via a light-count change — excluded from this benchmark`
          : line.excluded
          ? "Kept — not replaced; left out of the saving"
          : line.replacementName
          ? `${line.replacementCount ?? line.count} × ${line.replacementName}${line.replacementWattage ? ` (${line.replacementWattage}W)` : ""}${
              line.replacementCount != null && line.replacementCount < line.count ? ` · ${line.count - line.replacementCount} kept` : ""
            }`
          : line.note ?? "—"}
      </td>
      {canCorrect && (
        <td>
          <span className="inline-flex flex-wrap gap-2">
            <CorrectCount line={line} />
            <CorrectDeviceType line={line} catalog={catalog} />
            {/* Only offered on a line not already split, and not yet
                recorded against — the same two conditions splitLockedDeviceLine
                itself enforces server-side. */}
            {line.demoLabel === null && line.replacementCount === null && demos.length >= 2 && (
              <SplitLine line={line} demos={demos} />
            )}
            {/* Any excluded/kept line — never a normal replaced line, which
                stays Correct-only (2026-10-26: widened from rescale-added
                lines only, see RemoveExcludedLine's own comment). */}
            {line.excluded && <RemoveExcludedLine line={line} />}
          </span>
        </td>
      )}
      {editable && (
        <td>
          <span className="inline-flex gap-1">
            <button type="button" onClick={open} disabled={pending} className="btn-ghost text-xs">
              Edit
            </button>
            <button type="button" onClick={remove} disabled={pending} className="btn-ghost text-xs" style={{ color: "var(--bad-fg)" }}>
              Remove
            </button>
          </span>
          {error && !editing && <ErrorText>{error}</ErrorText>}

          {/* The edit form used to render as inputs inside these cells, which
              the column widths clipped. It gets its own dialog now. */}
          <Modal
            open={editing}
            onClose={() => setEditing(false)}
            title={`Edit ${line.deviceTypeName}`}
            description="The theoretical daily figure recomputes from these three numbers."
            footer={
              <>
                <button type="button" onClick={save} disabled={pending} className="btn-primary">
                  {pending ? "Saving…" : "Save changes"}
                </button>
                <button type="button" onClick={() => setEditing(false)} disabled={pending} className="btn-ghost">
                  Cancel
                </button>
                <span className="num ml-auto text-sm text-[var(--text-muted)]">
                  {previewKwh === null ? "—" : `${previewKwh.toFixed(2)} kWh/day`}
                </span>
              </>
            }
          >
            <div className="grid grid-cols-2 gap-4">
              <Field label="Count" htmlFor={`ec-${line.id}`}>
                <input
                  id={`ec-${line.id}`}
                  type="number"
                  min={1}
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                  disabled={pending}
                  className="field"
                />
              </Field>
              <Field label="Watts each" htmlFor={`ew-${line.id}`}>
                <input
                  id={`ew-${line.id}`}
                  type="number"
                  min={1}
                  step="0.5"
                  value={wattage}
                  onChange={(e) => setWattage(e.target.value)}
                  disabled={pending}
                  className="field"
                />
              </Field>
            </div>
            <Field label="Runs for" htmlFor={`eh-${line.id}`}>
              <HoursInput id={`eh-${line.id}`} hours={hours} setHours={setHours} disabled={pending} />
            </Field>
            <Field label="Note" htmlFor={`en-${line.id}`} hint="Optional — anything that explains this line.">
              <input
                id={`en-${line.id}`}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={pending}
                className="field"
              />
            </Field>
            {error && <ErrorText>{error}</ErrorText>}
          </Modal>
        </td>
      )}
    </tr>
  );
}

export function LoadInventoryPanel({
  circuitId,
  lines,
  catalog,
  editable,
  frozenReason,
  canRecordHistorical,
  canCorrectCount = false,
  demos = [],
}: {
  circuitId: string;
  lines: InventoryLine[];
  catalog: CatalogOption[];
  editable: boolean;
  frozenReason: string | null;
  canRecordHistorical: boolean;
  /** Operations may correct a mistyped count on a locked inventory. */
  canCorrectCount?: boolean;
  /** The circuit's own live demos — needed only to offer splitting a line
   *  across more than one of them. */
  demos?: DemoOption[];
}) {
  const theoretical = lines.reduce((s, l) => s + lineKwh(l), 0);
  const anyReplacement = lines.some((l) => l.replacementName || l.excluded);
  // A rescale-added line is excluded too, but it was never "kept, not
  // replaced" — it did not exist on the circuit at the demo, so it is
  // counted and worded separately rather than folded into the same figure.
  const keptCount = lines.reduce(
    (n, l) =>
      n +
      (l.addedViaRescaleDate
        ? 0
        : l.excluded
          ? l.count
          : l.replacementCount != null && l.replacementCount < l.count
            ? l.count - l.replacementCount
            : 0),
    0,
  );
  const addedViaRescaleCount = lines.reduce((n, l) => n + (l.addedViaRescaleDate ? l.count : 0), 0);

  // A locked inventory is a finished record, so it folds like every other
  // finished thing on this page — header, figure, done (user-reported
  // 2026-08-20: "all the completed steps should be folded and only the
  // status and summary shown in the header"). It stays one click away,
  // because it is the figure every pre-install reading was judged against.
  const [open, setOpen] = useState(editable || lines.length === 0);

  if (!open) {
    return (
      <Card className="p-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 text-left"
        >
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <StepMarker status="done" index={0} size={22} />
            <span className="font-medium text-sm">Load inventory</span>
            <span className="text-xs text-[var(--text-muted)]">
              {lines.length} line{lines.length === 1 ? "" : "s"} · locked
            </span>
            <span className="chip chip-info">
              <span className="chip-dot" aria-hidden />
              {theoretical.toFixed(2)} kWh/day theoretical
            </span>
            {keptCount > 0 && (
              <span className="text-xs text-[var(--text-muted)]">
                <span className="num">{keptCount}</span> fixture{keptCount === 1 ? "" : "s"} kept, not replaced — left out of the saving
              </span>
            )}
            {addedViaRescaleCount > 0 && (
              <span className="text-xs text-[var(--text-muted)]">
                <span className="num">{addedViaRescaleCount}</span> added since via a light-count change — excluded
              </span>
            )}
          </span>
          <span className="text-sm text-[var(--text-muted)]">Show</span>
        </button>
      </Card>
    );
  }

  return (
    <Card className="p-5 space-y-4">
      {!editable && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span className="flex items-center gap-2">
            <StepMarker status="done" index={0} size={22} />
            <span className="font-medium text-sm">Load inventory</span>
          </span>
          <button type="button" onClick={() => setOpen(false)} className="text-sm text-[var(--text-muted)] hover:underline">
            Hide
          </button>
        </div>
      )}
      {lines.length === 0 ? (
        <EmptyState title="No load inventory recorded">
          Record what hangs off this circuit — every pre-installation reading is judged against the
          theoretical figure these lines add up to.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Device</th>
                <th>Count</th>
                <th>W each</th>
                <th>Runs</th>
                <th>kWh/day</th>
                <th>{anyReplacement ? "Replaced with" : "Note"}</th>
                {(editable || canCorrectCount) && <th>{""}</th>}
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <LineRow key={l.id} line={l} editable={editable} canCorrect={canCorrectCount && !editable} catalog={catalog} demos={demos} />
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} className="font-medium">
                  Theoretical daily consumption
                </td>
                <td className="num font-semibold">{theoretical.toFixed(2)}</td>
                <td colSpan={editable || canCorrectCount ? 2 : 1} className="text-[var(--text-muted)]">
                  Σ count × W × hours ÷ 1000
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {keptCount > 0 && (
        // Why a kept line exists (2026-09-27, user-asked): nothing here is a
        // fixed number — the kept lights are whatever the replacement recorded.
        <p className="text-sm text-[var(--text-muted)]">
          <strong className="text-[var(--text)]">
            {keptCount} fixture{keptCount === 1 ? " was" : "s were"} kept, not replaced.
          </strong>{" "}
          When a replacement records that only some of the lights were changed, the rest stay on the circuit as they were, so they are
          shown as their own line (or as &ldquo;N kept&rdquo; on a partly replaced line). The saving leaves them out: kept lights of the
          same kind come off as their share of what the meter measured; any other item comes off at its rated draw. To change how many
          were kept, use <em>Correct what was replaced and kept</em> on the demo&apos;s Light replacement step.
        </p>
      )}

      {addedViaRescaleCount > 0 && (
        // A different fact from the one above — this fixture did not exist
        // on the circuit at the demo at all. It was added later, as part of
        // a light-count change, through the rescale form itself (the load
        // inventory is locked by then) — so neither the wording nor the
        // correction path above applies to it.
        <p className="text-sm text-[var(--text-muted)]">
          <strong className="text-[var(--text)]">
            {addedViaRescaleCount} fixture{addedViaRescaleCount === 1 ? "" : "s"} added since commissioning.
          </strong>{" "}
          {addedViaRescaleCount === 1 ? "It was" : "They were"} recorded later, through a light-count change, not
          through the demo &mdash; {addedViaRescaleCount === 1 ? "it" : "they"} never existed on this circuit when
          the benchmark was measured. {addedViaRescaleCount === 1 ? "Its" : "Their"} rated draw is excluded the same
          way a kept fixture&rsquo;s is. To correct it, use Correct count / Correct device on its own line above.
        </p>
      )}

      {editable ? (
        <AddLineForm circuitId={circuitId} catalog={catalog} />
      ) : frozenReason ? (
        // Frozen is not a dead end: the reason is stated, and a past record
        // can still be entered for a circuit commissioned before this system.
        <div className="space-y-3">
          <p className="text-sm text-[var(--text-muted)]">{frozenReason}</p>
          {/* The backfill exists for a locked circuit whose inventory was
              never recorded. Once lines are there it is an occasional extra,
              not a standing action — "if a record is already there then why
              show this?" (user-reported 2026-08-20). Same disclosure
              treatment as the KYC chase forms. */}
          {canRecordHistorical &&
            (lines.length === 0 ? (
              <AddLineForm circuitId={circuitId} catalog={catalog} demoBackfill />
            ) : (
              <details>
                <summary className="cursor-pointer text-sm text-[var(--text-muted)] hover:underline">
                  Add another past record (demo mode)
                </summary>
                <div className="mt-3">
                  <AddLineForm circuitId={circuitId} catalog={catalog} demoBackfill />
                </div>
              </details>
            ))}
        </div>
      ) : null}
    </Card>
  );
}

/**
 * A count typed wrong on a locked inventory (2026-09-26). Not a change in the
 * lights — that is a light-count change — so it says so before it asks.
 */
function CorrectCount({ line }: { line: InventoryLine }) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(String(line.count));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [pending, start] = useTransition();
  function save() {
    start(async () => {
      const r = await correctLockedCount({ lineId: line.id, count: Number(count), reason });
      if ("error" in r) setError(r.error);
      else {
        setError(undefined);
        setOpen(false);
      }
    });
  }
  return (
    <>
      <button
        type="button"
        className="btn-ghost text-xs"
        onClick={() => {
          setCount(String(line.count));
          setReason("");
          setError(undefined);
          setOpen(true);
        }}
      >
        Correct count
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Correct the count — ${line.deviceTypeName}`}
        description="For a count that was typed wrong. If the lights on the circuit really changed, record a light-count change instead — that keeps the old count for the time before it."
        footer={
          <>
            <button type="button" onClick={save} disabled={pending || reason.trim() === ""} className="btn-primary">
              {pending ? "Saving…" : "Save the correction"}
            </button>
            <button type="button" onClick={() => setOpen(false)} disabled={pending} className="btn-ghost">
              Cancel
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Correct count" htmlFor={`cc-${line.id}`} hint={`On record: ${line.count}. The circuit's metered count and every demo that carried the same figure follow; the old values are kept in the change log.`}>
            <input id={`cc-${line.id}`} type="number" min={1} value={count} onChange={(e) => setCount(e.target.value)} disabled={pending} className="field" />
          </Field>
          <Field label="What was wrong" htmlFor={`cr-${line.id}`}>
            <input id={`cr-${line.id}`} value={reason} onChange={(e) => setReason(e.target.value)} disabled={pending} className="field" placeholder="e.g. 63 typed instead of 55" />
          </Field>
          {error && <ErrorText>{error}</ErrorText>}
        </div>
      </Modal>
    </>
  );
}

/**
 * A device TYPE picked wrong on a locked inventory (2026-10-16) — the same
 * class of mistake as a mistyped count, just on which catalog entry a line
 * points at rather than its figure.
 */
function CorrectDeviceType({ line, catalog }: { line: InventoryLine; catalog: CatalogOption[] }) {
  const [open, setOpen] = useState(false);
  const [deviceTypeId, setDeviceTypeId] = useState(line.deviceTypeId);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [pending, start] = useTransition();
  function save() {
    start(async () => {
      const r = await correctLockedDeviceType({ lineId: line.id, deviceTypeId, reason });
      if ("error" in r) setError(r.error);
      else {
        setError(undefined);
        setOpen(false);
      }
    });
  }
  return (
    <>
      <button
        type="button"
        className="btn-ghost text-xs"
        onClick={() => {
          setDeviceTypeId(line.deviceTypeId);
          setReason("");
          setError(undefined);
          setOpen(true);
        }}
      >
        Correct device
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Correct the device — ${line.deviceTypeName}`}
        description="For a catalog entry picked wrong. The count, wattage and hours stay exactly as they are — only which fixture this line records changes."
        footer={
          <>
            <button type="button" onClick={save} disabled={pending || reason.trim() === ""} className="btn-primary">
              {pending ? "Saving…" : "Save the correction"}
            </button>
            <button type="button" onClick={() => setOpen(false)} disabled={pending} className="btn-ghost">
              Cancel
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Correct device" htmlFor={`cdt-${line.id}`} hint={`On record: ${line.deviceTypeName}.`}>
            <select id={`cdt-${line.id}`} value={deviceTypeId} onChange={(e) => setDeviceTypeId(e.target.value)} disabled={pending} className="field">
              {catalog.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="What was wrong" htmlFor={`cdtr-${line.id}`}>
            <input
              id={`cdtr-${line.id}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={pending}
              className="field"
              placeholder="e.g. surface light picked instead of tube light"
            />
          </Field>
          {error && <ErrorText>{error}</ErrorText>}
        </div>
      </Modal>
    </>
  );
}

/**
 * Removing an excluded/kept line (2026-10-26, user-caught, then widened the
 * same day) — the ordinary Remove button above is gated to before the meter
 * is installed, same as Add, so an excluded line entered by mistake had no
 * way back once the circuit is commissioned. First scoped to only a fixture
 * added via the new rescale-form path; widened once that narrower version
 * got in the way of correcting a line that predated the provenance field
 * and so had nothing to satisfy it with — correctLockedCount/
 * correctLockedDeviceType already let ops rewrite ANY locked line with just
 * a reason, so removal of an excluded line doesn't need to be stricter.
 * Still refused server-side on a normal replaced line (removeExcludedDeviceLine
 * checks excludedFromCalculation) — the circuit's actual retrofit record
 * stays Correct-only, never removable once locked.
 */
function RemoveExcludedLine({ line }: { line: InventoryLine }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [pending, start] = useTransition();
  function save() {
    start(async () => {
      const r = await removeExcludedDeviceLine(line.id, reason);
      if ("error" in r) setError(r.error);
      else setOpen(false);
    });
  }
  return (
    <>
      <button
        type="button"
        className="btn-ghost text-xs"
        style={{ color: "var(--bad-fg)" }}
        onClick={() => {
          setReason("");
          setError(undefined);
          setOpen(true);
        }}
      >
        Remove
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Remove this line — ${line.deviceTypeName}`}
        description="For an excluded/kept line recorded by mistake — picked the wrong catalog entry, added twice, or never a real fixture. This deletes the line; it is not kept on record."
        footer={
          <>
            <button type="button" onClick={save} disabled={pending || reason.trim() === ""} className="btn-danger">
              {pending ? "Removing…" : "Remove"}
            </button>
            <button type="button" onClick={() => setOpen(false)} disabled={pending} className="btn-ghost">
              Cancel
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Why is this being removed?" htmlFor={`rm-${line.id}`}>
            <input
              id={`rm-${line.id}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={pending}
              className="field"
              placeholder="e.g. added while testing, not a real fixture"
            />
          </Field>
          {error && <ErrorText>{error}</ErrorText>}
        </div>
      </Modal>
    </>
  );
}

/**
 * Split one line across two or more of the circuit's own demos (2026-10-17,
 * user-caught) — for when a circuit's single inventory line is really the
 * combined population of two separately-run demos, each of which has to
 * record its OWN replacement without clobbering the other's. Each demo gets
 * its own row after this; neither shows the other's line any more.
 */
function SplitLine({ line, demos }: { line: InventoryLine; demos: DemoOption[] }) {
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [pending, start] = useTransition();

  const total = demos.reduce((n, d) => n + (Number(counts[d.id]) || 0), 0);
  const reconciles = total === line.count;

  function save() {
    const allocations = demos
      .map((d) => ({ demoId: d.id, count: Number(counts[d.id]) || 0 }))
      .filter((a) => a.count > 0);
    start(async () => {
      const r = await splitLockedDeviceLine({ lineId: line.id, allocations, reason });
      if ("error" in r) setError(r.error);
      else {
        setError(undefined);
        setOpen(false);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        className="btn-ghost text-xs"
        onClick={() => {
          setCounts({});
          setReason("");
          setError(undefined);
          setOpen(true);
        }}
      >
        Split for demos
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Split — ${line.deviceTypeName}`}
        description="For a line that is really the combined population of two or more separate demos, each run on its own share of it. Give each demo its own count — they have to add up to this line's own total."
        footer={
          <>
            <button type="button" onClick={save} disabled={pending || reason.trim() === "" || !reconciles || total === 0} className="btn-primary">
              {pending ? "Saving…" : "Save the split"}
            </button>
            <button type="button" onClick={() => setOpen(false)} disabled={pending} className="btn-ghost">
              Cancel
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-2">
            {demos.map((d) => (
              <Field key={d.id} label={d.label} htmlFor={`sl-${line.id}-${d.id}`}>
                <input
                  id={`sl-${line.id}-${d.id}`}
                  type="number"
                  min={0}
                  value={counts[d.id] ?? ""}
                  onChange={(e) => setCounts((prev) => ({ ...prev, [d.id]: e.target.value }))}
                  disabled={pending}
                  className="field"
                  placeholder="0 — leave blank if none of this line is theirs"
                />
              </Field>
            ))}
          </div>
          <p className={`text-sm ${reconciles ? "text-[var(--text-muted)]" : "text-[var(--bad-fg)]"}`}>
            {total} allocated against {line.count} on this line{reconciles ? " — reconciled" : " — these must match before saving"}
          </p>
          <Field label="Why this line is being split" htmlFor={`slr-${line.id}`}>
            <input
              id={`slr-${line.id}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={pending}
              className="field"
              placeholder="e.g. two separate demos share this one line — 100 and 22"
            />
          </Field>
          {error && <ErrorText>{error}</ErrorText>}
        </div>
      </Modal>
    </>
  );
}
