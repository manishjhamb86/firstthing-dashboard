"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, ErrorText, StatusChip } from "@/components/ui";
import { formatInstant } from "@/lib/format-date";
import { assignMeter, syncMetersNow } from "./actions";

type Meter = {
  id: string;
  name: string;
  productModel: string;
  uiid: number;
  online: boolean;
  hasEnergySignal: boolean;
  lastPowerW: number | null;
  societyId: string | null;
  societyName: string | null;
  circuitId: string | null;
  circuitLabel: string | null;
};

export function MetersListClient({
  canAssign,
  syncedAt,
  meters,
  societies,
  circuits,
}: {
  canAssign: boolean;
  syncedAt: string | null;
  meters: Meter[];
  societies: { id: string; name: string }[];
  circuits: { id: string; societyId: string; label: string; taken: boolean }[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [society, setSociety] = useState("");
  const [circuit, setCircuit] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function open(m: Meter) {
    setEditing(m.id);
    setSociety(m.societyId ?? "");
    setCircuit(m.circuitId ?? "");
    setError(null);
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn-secondary"
          disabled={pending || !canAssign}
          onClick={() =>
            start(async () => {
              setError(null);
              setNotice(null);
              const r = await syncMetersNow();
              if (r.error) setError(r.error);
              else {
                setNotice(`Synced — ${r.devices} devices, ${r.meters} metering.`);
                router.refresh();
              }
            })
          }
        >
          {pending ? "Working…" : "Sync device list"}
        </button>
        {syncedAt && (
          <span className="text-[12px]" style={{ color: "var(--text-subtle)" }}>
            Synced <span className="num">{formatInstant(new Date(syncedAt))}</span>
          </span>
        )}
      </div>

      {error && <ErrorText>{error}</ErrorText>}
      {notice && (
        <p className="mb-3 text-[13px]" style={{ color: "var(--ok-fg)" }}>
          {notice}
        </p>
      )}

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Device</th>
                <th>Model</th>
                <th>State</th>
                <th>Society</th>
                <th>Circuit</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {meters.map((m) => {
                const isEditing = editing === m.id;
                const forSociety = circuits.filter((c) => c.societyId === society);
                return (
                  <tr key={m.id}>
                    <td>
                      <span className="font-semibold">{m.name}</span>
                      {m.lastPowerW != null && (
                        <span className="block text-[12px]" style={{ color: "var(--text-muted)" }}>
                          <span className="num">{m.lastPowerW}</span> W now
                        </span>
                      )}
                    </td>
                    <td className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                      {m.productModel || "—"}
                      {/* The device type decides which energy protocol it
                          speaks, and only some are publicly documented — so
                          it is shown rather than hidden. */}
                      <span className="block text-[11px]" style={{ color: "var(--text-subtle)" }}>
                        UIID <span className="num">{m.uiid}</span>
                      </span>
                    </td>
                    <td>
                      {!m.hasEnergySignal ? (
                        <StatusChip tone="neu">No electricity signal</StatusChip>
                      ) : m.online ? (
                        <StatusChip tone="ok">Online</StatusChip>
                      ) : (
                        <StatusChip tone="warn">Offline</StatusChip>
                      )}
                    </td>
                    <td className="text-[13px]">
                      {isEditing ? (
                        <select
                          className="field field-auto"
                          aria-label={`Society for ${m.name}`}
                          value={society}
                          onChange={(e) => {
                            setSociety(e.target.value);
                            setCircuit("");
                          }}
                        >
                          <option value="">Unassigned</option>
                          {societies.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        m.societyName ?? <span style={{ color: "var(--text-subtle)" }}>Unassigned</span>
                      )}
                    </td>
                    <td className="text-[13px]">
                      {isEditing ? (
                        <select
                          className="field field-auto"
                          aria-label={`Circuit for ${m.name}`}
                          value={circuit}
                          onChange={(e) => setCircuit(e.target.value)}
                          disabled={!society}
                        >
                          <option value="">{society ? "Not decided yet" : "Pick a society first"}</option>
                          {forSociety.map((c) => (
                            <option key={c.id} value={c.id} disabled={c.taken && c.id !== m.circuitId}>
                              {c.label}
                              {c.taken && c.id !== m.circuitId ? " — already metered" : ""}
                            </option>
                          ))}
                        </select>
                      ) : (
                        m.circuitLabel ?? <span style={{ color: "var(--text-subtle)" }}>—</span>
                      )}
                    </td>
                    <td className="text-right">
                      {!canAssign ? null : isEditing ? (
                        <span className="inline-flex gap-2">
                          <button
                            type="button"
                            className="btn-primary"
                            disabled={pending}
                            onClick={() =>
                              start(async () => {
                                setError(null);
                                const r = await assignMeter({
                                  meterId: m.id,
                                  societyId: society || null,
                                  circuitId: circuit || null,
                                });
                                if (r.error) setError(r.error);
                                else {
                                  setEditing(null);
                                  router.refresh();
                                }
                              })
                            }
                          >
                            Save
                          </button>
                          <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="btn-secondary"
                          disabled={!m.hasEnergySignal}
                          title={m.hasEnergySignal ? undefined : "This device reports no electricity datapoint."}
                          onClick={() => open(m)}
                        >
                          {m.circuitId || m.societyId ? "Change" : "Assign"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
