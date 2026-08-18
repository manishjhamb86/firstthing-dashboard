"use client";

import { useState, useTransition } from "react";
import { Card, EmptyState, ErrorText, Field } from "@/components/ui";
import { Modal } from "@/components/modal";
import { addCircuitDevice, removeCircuitDevice, updateCircuitDevice } from "./inventory-actions";

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
};

export type CatalogOption = { id: string; name: string; defaultWattage: number | null };

function lineKwh(l: { count: number; wattage: number; hoursPerDay: number }) {
  return (l.count * l.wattage * l.hoursPerDay) / 1000;
}

const HOURS_PRESETS = ["24", "12", "custom"] as const;

function HoursInput({
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
function AddLineForm({ circuitId, catalog }: { circuitId: string; catalog: CatalogOption[] }) {
  const [open, setOpen] = useState(false);
  const [typeId, setTypeId] = useState("");
  const [count, setCount] = useState("");
  const [wattage, setWattage] = useState("");
  const [hours, setHours] = useState("24");
  const [note, setNote] = useState("");
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
      <button type="button" onClick={() => setOpen(true)} className="btn-secondary">
        Add a device line
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

        {error && <ErrorText>{error}</ErrorText>}
      </Modal>
    </>
  );
}

function LineRow({ line, editable }: { line: InventoryLine; editable: boolean }) {
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
      <td>{line.deviceTypeName}</td>
      <td className="num">{line.count}</td>
      <td className="num">{line.wattage}</td>
      <td className="num">{line.hoursPerDay} h</td>
      <td className="num">{lineKwh(line).toFixed(2)}</td>
      <td className="text-[var(--text-muted)]">
        {line.replacementName
          ? `${line.replacementCount ?? line.count} × ${line.replacementName}${line.replacementWattage ? ` (${line.replacementWattage}W)` : ""}`
          : line.note ?? "—"}
      </td>
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
}: {
  circuitId: string;
  lines: InventoryLine[];
  catalog: CatalogOption[];
  editable: boolean;
  frozenReason: string | null;
}) {
  const theoretical = lines.reduce((s, l) => s + lineKwh(l), 0);
  const anyReplacement = lines.some((l) => l.replacementName);

  return (
    <Card className="p-5 space-y-4">
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
                {editable && <th>{""}</th>}
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <LineRow key={l.id} line={l} editable={editable} />
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} className="font-medium">
                  Theoretical daily consumption
                </td>
                <td className="num font-semibold">{theoretical.toFixed(2)}</td>
                <td colSpan={editable ? 2 : 1} className="text-[var(--text-muted)]">
                  Σ count × W × hours ÷ 1000
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {editable ? (
        <AddLineForm circuitId={circuitId} catalog={catalog} />
      ) : frozenReason ? (
        <p className="text-sm text-[var(--text-muted)]">{frozenReason}</p>
      ) : null}
    </Card>
  );
}
