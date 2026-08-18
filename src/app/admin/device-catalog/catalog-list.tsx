"use client";

import { useMemo, useState, useTransition } from "react";
import { ErrorText, Field, StatusChip } from "@/components/ui";
import { Modal } from "@/components/modal";
import {
  createDeviceType,
  deleteDeviceType,
  restoreDeviceType,
  setReplacementOptions,
  updateDeviceType,
} from "./actions";

export type CatalogRow = {
  id: string;
  name: string;
  role: "original" | "replacement";
  defaultWattage: number | null;
  active: boolean;
  removed: boolean;
  /** originals only: the replacements an installer may pick for this device */
  replacementIds: string[];
  /** how many recorded lines point at this type — why removal is soft */
  usageCount: number;
};

function matches(row: CatalogRow, q: string) {
  if (!q) return true;
  const hay = `${row.name} ${row.role} ${row.defaultWattage ?? ""}`.toLowerCase();
  return hay.includes(q.toLowerCase());
}

/**
 * The replacement picker. CON-45's rule is that an installer only ever sees
 * the replacements mapped to the device in front of them, never the whole
 * catalog — which makes maintaining that mapping the point of this form, and
 * makes it worth searching once the catalog outgrows a dozen rows.
 */
function ReplacementPicker({
  all,
  selected,
  onToggle,
  disabled,
}: {
  all: { id: string; name: string }[];
  selected: string[];
  onToggle: (id: string) => void;
  disabled: boolean;
}) {
  const [q, setQ] = useState("");
  const shown = all.filter((r) => r.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <input
        className="field mb-2"
        placeholder="Search replacements…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        disabled={disabled}
        aria-label="Search replacements"
      />
      <div
        className="max-h-48 overflow-y-auto rounded-[var(--r-sm)] border p-2 space-y-1"
        style={{ borderColor: "var(--field-border)" }}
      >
        {shown.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)] p-1">
            {all.length === 0 ? "No replacement devices in the catalog yet." : "Nothing matches that."}
          </p>
        ) : (
          shown.map((r) => (
            <label key={r.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.includes(r.id)}
                onChange={() => onToggle(r.id)}
                disabled={disabled}
              />
              {r.name}
            </label>
          ))
        )}
      </div>
      <p className="mt-1.5 text-xs text-[var(--text-subtle)]">
        {selected.length} selected — the installer sees exactly these.
      </p>
    </div>
  );
}

function DeviceForm({
  open,
  onClose,
  editing,
  replacements,
}: {
  open: boolean;
  onClose: () => void;
  editing: CatalogRow | null;
  replacements: { id: string; name: string }[];
}) {
  const isEdit = editing !== null;
  const [name, setName] = useState(editing?.name ?? "");
  const [role, setRole] = useState<"original" | "replacement">(editing?.role ?? "original");
  const [watt, setWatt] = useState(editing?.defaultWattage != null ? String(editing.defaultWattage) : "");
  const [active, setActive] = useState(editing?.active ?? true);
  const [picked, setPicked] = useState<string[]>(editing?.replacementIds ?? []);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(undefined);
    const wattage = watt.trim() === "" ? null : Number(watt);
    startTransition(async () => {
      const result = isEdit
        ? await updateDeviceType({ id: editing.id, name, defaultWattage: wattage, active })
        : await createDeviceType({ name, role, defaultWattage: wattage });
      if ("error" in result) return setError(result.error);

      // The mapping is a second write, and only originals have one.
      if (isEdit && editing.role === "original") {
        const m = await setReplacementOptions(editing.id, picked);
        if ("error" in m) return setError(m.error);
      }
      onClose();
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? `Edit ${editing.name}` : "New catalog device"}
      description={
        isEdit
          ? "Changes reach every inventory and replacement dropdown immediately."
          : "Add it once here and it appears in the dropdowns — no code change."
      }
      footer={
        <>
          <button type="button" onClick={submit} disabled={pending} className="btn-primary">
            {pending ? "Saving…" : isEdit ? "Save changes" : "Add device"}
          </button>
          <button type="button" onClick={onClose} disabled={pending} className="btn-ghost">
            Cancel
          </button>
        </>
      }
    >
      <Field label="Name" htmlFor="dt-name" hint="Exactly what the dropdowns will show.">
        <input id="dt-name" className="field" value={name} onChange={(e) => setName(e.target.value)} disabled={pending} />
      </Field>

      <Field
        label="Kind"
        htmlFor="dt-role"
        hint={isEdit ? "Fixed once created — remove and re-add to change it." : "A device found on site that FirsThing will replace, or the replacement itself."}
      >
        <select
          id="dt-role"
          className="field"
          value={role}
          onChange={(e) => setRole(e.target.value as "original" | "replacement")}
          disabled={pending || isEdit}
        >
          <option value="original">To be replaced</option>
          <option value="replacement">Replacement</option>
        </select>
      </Field>

      <Field label="Default wattage" htmlFor="dt-watt" hint="Optional — it prefills, and stays editable per circuit.">
        <input
          id="dt-watt"
          type="number"
          min={1}
          max={2000}
          step="0.5"
          className="field"
          value={watt}
          onChange={(e) => setWatt(e.target.value)}
          disabled={pending}
        />
      </Field>

      {isEdit && editing.role === "original" && (
        <Field label="Compatible replacements">
          <ReplacementPicker
            all={replacements}
            selected={picked}
            onToggle={(id) => setPicked((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]))}
            disabled={pending}
          />
        </Field>
      )}

      {isEdit && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} disabled={pending} />
          Active — offered in dropdowns
        </label>
      )}

      {error && <ErrorText>{error}</ErrorText>}
    </Modal>
  );
}

export function CatalogList({ rows, canEdit }: { rows: CatalogRow[]; canEdit: boolean }) {
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<CatalogRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const replacements = useMemo(
    () => rows.filter((r) => r.role === "replacement" && !r.removed).map((r) => ({ id: r.id, name: r.name })),
    [rows],
  );

  const live = rows.filter((r) => !r.removed && matches(r, q));
  const removed = rows.filter((r) => r.removed && matches(r, q));

  function act(id: string, fn: () => Promise<{ error?: string } | { ok: true }>) {
    setRowError(null);
    startTransition(async () => {
      const result = await fn();
      if ("error" in result && result.error) setRowError({ id, message: result.error });
    });
  }

  function remove(row: CatalogRow) {
    const warning =
      row.usageCount > 0
        ? `${row.name} is recorded on ${row.usageCount} inventory line${row.usageCount === 1 ? "" : "s"}. Removing it hides it from the dropdowns; those lines keep it.`
        : `Remove ${row.name} from the dropdowns?`;
    if (!window.confirm(warning)) return;
    act(row.id, () => deleteDeviceType(row.id));
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <input
          className="field field-auto w-full sm:w-80"
          placeholder="Search the catalog…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search the catalog"
        />
        {canEdit && (
          <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
            Add device
          </button>
        )}
      </div>

      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>Device</th>
              <th>Kind</th>
              <th className="text-right">Default W</th>
              <th>Status</th>
              {canEdit && <th />}
            </tr>
          </thead>
          <tbody>
            {live.length === 0 ? (
              <tr>
                <td colSpan={canEdit ? 5 : 4} className="text-[var(--text-muted)]">
                  {q ? `Nothing matches "${q}".` : "The catalog is empty."}
                </td>
              </tr>
            ) : (
              live.map((r) => (
                <tr key={r.id}>
                  <td>
                    <span className="font-medium">{r.name}</span>
                    {rowError?.id === r.id && <ErrorText>{rowError.message}</ErrorText>}
                  </td>
                  <td>
                    {/* The one distinction the catalog turns on. */}
                    <StatusChip tone={r.role === "replacement" ? "ok" : "neu"}>
                      {r.role === "replacement" ? "Replacement" : "To be replaced"}
                    </StatusChip>
                  </td>
                  <td className="num text-right">{r.defaultWattage ?? "—"}</td>
                  <td>
                    {r.active ? (
                      <StatusChip tone="ok">Active</StatusChip>
                    ) : (
                      <StatusChip tone="warn">Retired</StatusChip>
                    )}
                  </td>
                  {canEdit && (
                    <td className="text-right whitespace-nowrap">
                      <button type="button" className="btn-ghost btn-sm" onClick={() => setEditing(r)} disabled={pending}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn-ghost btn-sm"
                        style={{ color: "var(--bad-fg)" }}
                        disabled={pending}
                        onClick={() => remove(r)}
                      >
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {removed.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-[var(--text-muted)]">
            {removed.length} removed device{removed.length === 1 ? "" : "s"}
          </summary>
          <div className="card overflow-x-auto mt-3">
            <table className="tbl">
              <tbody>
                {removed.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <span className="font-medium line-through">{r.name}</span>
                      <p className="text-[13px] text-[var(--text-muted)]">
                        {r.role === "replacement" ? "Replacement" : "To be replaced"}
                        {r.usageCount > 0 ? ` · still on ${r.usageCount} recorded line${r.usageCount === 1 ? "" : "s"}` : ""}
                      </p>
                      {rowError?.id === r.id && <ErrorText>{rowError.message}</ErrorText>}
                    </td>
                    {canEdit && (
                      <td className="text-right">
                        <button
                          type="button"
                          className="btn-ghost btn-sm"
                          disabled={pending}
                          onClick={() => act(r.id, () => restoreDeviceType(r.id))}
                        >
                          Restore
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {creating && <DeviceForm open onClose={() => setCreating(false)} editing={null} replacements={replacements} />}
      {editing && (
        <DeviceForm key={editing.id} open onClose={() => setEditing(null)} editing={editing} replacements={replacements} />
      )}
    </>
  );
}
