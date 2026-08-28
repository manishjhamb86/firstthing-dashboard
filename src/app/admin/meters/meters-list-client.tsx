"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardTitle, EmptyState, ErrorText, StatusChip } from "@/components/ui";
import { CeilingBar, MeterStateChip, Sparkline } from "@/components/meter-ui";
import type { MeterRow } from "@/lib/meter-view";
import { assignMeter, setMeterOwner, syncMeterNow, syncMetersNow } from "./actions";

type Society = { id: string; name: string };
type Circuit = { id: string; societyId: string; label: string; state: string; takenBy: string | null };

type Filter = "all" | "attention" | "unassigned" | "metering";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All devices" },
  { key: "attention", label: "Needs attention" },
  { key: "unassigned", label: "Not assigned" },
  { key: "metering", label: "Metering only" },
];

export function MetersListClient({
  canAssign,
  syncedAt,
  meters,
  fieldStaff,
  societies,
  circuits,
}: {
  canAssign: boolean;
  syncedAt: string | null;
  meters: MeterRow[];
  fieldStaff: { id: string; label: string }[];
  societies: Society[];
  circuits: Circuit[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [society, setSociety] = useState("");
  const [circuit, setCircuit] = useState("");
  const [owner, setOwner] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return meters.filter((m) => {
      if (filter === "attention" && (m.state === null || m.state === "reporting") && m.openAlerts.length === 0)
        return false;
      if (filter === "unassigned" && (m.state !== null || !m.hasEnergySignal)) return false;
      if (filter === "metering" && !m.hasEnergySignal) return false;
      if (!q) return true;
      return [m.name, m.societyName, m.circuitLabel, m.productModel]
        .filter(Boolean)
        .some((s) => s!.toLowerCase().includes(q));
    });
  }, [meters, filter, query]);

  function openAssign(m: MeterRow) {
    setEditing(m.id);
    setSociety(m.societyId ?? "");
    setCircuit(m.circuitId ?? "");
    setOwner(m.ownerId ?? "");
    setError(null);
  }

  const editingMeter = meters.find((m) => m.id === editing) ?? null;

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div>
          <CardTitle>Devices</CardTitle>
          <p className="mt-1 text-[13px] text-[var(--text-muted)]">
            {syncedAt
              ? `Mirrored from the eWeLink account ${syncedAt.slice(0, 16).replace("T", " ")}.`
              : "Not yet mirrored from the eWeLink account."}
          </p>
        </div>
        {canAssign && (
          <button
            type="button"
            className="btn-secondary btn-sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setError(null);
                setNotice(null);
                const r = await syncMetersNow();
                if (r.error) setError(r.error);
                else {
                  setNotice(`${r.devices} devices in the account, ${r.meters} of them metering.`);
                  router.refresh();
                }
              })
            }
          >
            {pending ? "Syncing…" : "Sync account"}
          </button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className="chip"
            style={
              filter === f.key
                ? { background: "var(--accent)", color: "var(--text-on-accent)", borderColor: "var(--accent)" }
                : undefined
            }
          >
            {f.label}
          </button>
        ))}
        <input
          type="search"
          className="search-field ml-auto"
          placeholder="Search meter, society or circuit"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search meters"
        />
      </div>

      {error && <ErrorText>{error}</ErrorText>}
      {notice && (
        <p className="mb-3 text-[13px]" style={{ color: "var(--ok-fg)" }}>
          {notice}
        </p>
      )}

      {shown.length === 0 ? (
        <EmptyState title="Nothing matches">
          {meters.length === 0
            ? "No devices have been mirrored from the eWeLink account yet."
            : "No device matches this filter or search."}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Meter</th>
                <th>Measures</th>
                <th>State</th>
                <th className="text-right">Power now · 24h</th>
                <th>Today vs ceiling</th>
                <th className="text-right">History</th>
                <th>Chased by</th>
                {canAssign && <th />}
              </tr>
            </thead>
            <tbody>
              {shown.map((m) => (
                <tr key={m.id}>
                  <td>
                    <Link href={`/admin/meters/${m.id}`} className="font-semibold underline">
                      {m.name}
                    </Link>
                    <div className="text-xs text-[var(--text-subtle)]">{m.productModel}</div>
                    {m.openAlerts.length > 0 && (
                      <div className="mt-1">
                        <StatusChip tone="bad">
                          {m.openAlerts.length} open alert{m.openAlerts.length === 1 ? "" : "s"}
                        </StatusChip>
                      </div>
                    )}
                  </td>
                  <td className="text-[13px]">
                    {m.societyName ? (
                      <>
                        <div>{m.societyName}</div>
                        <div className="text-xs text-[var(--text-subtle)]">
                          {m.circuitLabel ?? "no circuit yet"}
                        </div>
                      </>
                    ) : m.hasEnergySignal ? (
                      <span className="text-[var(--text-subtle)]">Not assigned</span>
                    ) : (
                      <span className="text-[var(--text-subtle)]">Not a meter</span>
                    )}
                  </td>
                  <td>
                    <MeterStateChip state={m.state} />
                    {m.state !== null && m.state !== "reporting" && m.offlineSince && (
                      <div className="mt-1 text-xs text-[var(--text-subtle)]">
                        since {m.offlineSince.slice(0, 16).replace("T", " ")}
                      </div>
                    )}
                  </td>
                  {/* Every figure carries its age — a last known reading shown
                      as a current one is how a stale number becomes a decision. */}
                  <td>
                    {m.powerW === null ? (
                      <div className="num text-right text-[var(--text-subtle)]">—</div>
                    ) : (
                      <div className="flex items-center justify-end gap-3">
                        <div className="num text-right">
                          <span style={{ color: m.stale ? "var(--text-muted)" : "var(--text)" }}>
                            {m.powerW.toFixed(0)} W
                          </span>
                          <div className="whitespace-nowrap text-xs text-[var(--text-subtle)]">{m.readAge}</div>
                        </div>
                        <Sparkline values={m.spark} muted={m.state !== "reporting"} />
                      </div>
                    )}
                  </td>
                  <td>
                    {m.dayKwh === null ? (
                      <span className="num text-[var(--text-subtle)]">—</span>
                    ) : m.capacityKwh === null ? (
                      <>
                        <span className="num">{m.dayKwh.toFixed(2)} kWh</span>
                        <div className="whitespace-nowrap text-xs text-[var(--text-subtle)]">no ceiling</div>
                      </>
                    ) : (
                      <div className="flex w-[130px] flex-col gap-1.5">
                        <CeilingBar value={m.dayKwh} ceiling={m.capacityKwh} />
                        <span className="num whitespace-nowrap text-xs text-[var(--text-subtle)]">
                          {m.dayKwh.toFixed(2)} of {m.capacityKwh.toFixed(1)} kWh
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="num text-right">
                    {m.hourlyCount === 0 ? (
                      <span className="text-[var(--text-subtle)]">—</span>
                    ) : (
                      <>
                        {m.hourlyCount.toLocaleString()} h
                        <div className="whitespace-nowrap text-xs text-[var(--text-subtle)]">to {m.hourlyTo}</div>
                      </>
                    )}
                  </td>
                  <td className="text-[13px]">
                    {m.ownerLabel ?? (
                      <span className="text-[var(--text-subtle)]">
                        {m.state === null ? "—" : "Nobody"}
                      </span>
                    )}
                  </td>
                  {canAssign && (
                    <td className="text-right whitespace-nowrap">
                      {m.hasEnergySignal ? (
                        <>
                          <button type="button" className="btn-ghost btn-sm" onClick={() => openAssign(m)}>
                            {m.circuitId ? "Reassign" : "Assign"}
                          </button>
                          <button
                            type="button"
                            className="btn-ghost btn-sm"
                            disabled={pending || m.state === null}
                            title={m.state === null ? "Assign it first" : "Read this meter now"}
                            onClick={() =>
                              start(async () => {
                                setError(null);
                                const r = await syncMeterNow(m.id);
                                if (r.error) setError(r.error);
                                else router.refresh();
                              })
                            }
                          >
                            Read
                          </button>
                        </>
                      ) : (
                        <span
                          className="text-xs text-[var(--text-subtle)]"
                          title="This device reports no energy datapoint, so there is nothing to meter."
                        >
                          not a meter
                        </span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editingMeter && (
        <AssignPanel
          meter={editingMeter}
          societies={societies}
          circuits={circuits}
          society={society}
          circuit={circuit}
          owner={owner}
          fieldStaff={fieldStaff}
          pending={pending}
          onSociety={(v) => {
            setSociety(v);
            setCircuit("");
          }}
          onCircuit={setCircuit}
          onOwner={setOwner}
          onCancel={() => setEditing(null)}
          onSave={() =>
            start(async () => {
              setError(null);
              const r = await assignMeter({
                meterId: editingMeter.id,
                societyId: society || null,
                circuitId: circuit || null,
              });
              if (r.error) {
                setError(r.error);
                return;
              }
              if ((owner || null) !== editingMeter.ownerId) {
                const o = await setMeterOwner({ meterId: editingMeter.id, ownerId: owner || null });
                if (o.error) {
                  setError(o.error);
                  return;
                }
              }
              setEditing(null);
              router.refresh();
            })
          }
        />
      )}
    </Card>
  );
}

function AssignPanel({
  meter,
  societies,
  circuits,
  society,
  circuit,
  owner,
  fieldStaff,
  pending,
  onSociety,
  onCircuit,
  onOwner,
  onCancel,
  onSave,
}: {
  meter: MeterRow;
  societies: Society[];
  circuits: Circuit[];
  society: string;
  circuit: string;
  owner: string;
  fieldStaff: { id: string; label: string }[];
  pending: boolean;
  onSociety: (v: string) => void;
  onCircuit: (v: string) => void;
  onOwner: (v: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const forSociety = circuits.filter((c) => c.societyId === society);
  return (
    <div
      className="mt-5 rounded-[var(--r-md)] p-4"
      style={{ background: "var(--surface-sunken)", border: "1px solid var(--accent-line)" }}
    >
      <p className="mb-1 text-[15px] font-semibold">Assign {meter.name}</p>
      <p className="mb-3 text-[13px] text-[var(--text-muted)]">
        A meter binds to one circuit, because a circuit is what gets billed — two meters on one circuit
        would be two sources for one figure. Leave the circuit blank while it is still undecided.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="lbl mb-1 block">Society</span>
          <select className="field" value={society} disabled={pending} onChange={(e) => onSociety(e.target.value)}>
            <option value="">Not assigned</option>
            {societies.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="lbl mb-1 block">Circuit</span>
          <select
            className="field"
            value={circuit}
            disabled={pending || !society}
            onChange={(e) => onCircuit(e.target.value)}
          >
            <option value="">{society ? "Undecided" : "Choose a society first"}</option>
            {forSociety.map((c) => (
              <option key={c.id} value={c.id} disabled={c.takenBy !== null && c.takenBy !== meter.id}>
                {c.label}
                {c.takenBy !== null && c.takenBy !== meter.id ? " — already metered" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="lbl mb-1 block">Chased when it stops</span>
          <select className="field" value={owner} disabled={pending} onChange={(e) => onOwner(e.target.value)}>
            <option value="">Nobody</option>
            {fieldStaff.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="mt-2 text-xs" style={{ color: "var(--text-subtle)" }}>
        An alert addressed to nobody is an alert nobody acts on — the owner is who goes and looks at
        the meter, so only accounts with field access are offered.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn-primary btn-sm" disabled={pending} onClick={onSave}>
          {pending ? "Saving…" : "Save"}
        </button>
        <button type="button" className="btn-ghost btn-sm" disabled={pending} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
