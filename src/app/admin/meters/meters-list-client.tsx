"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardTitle, EmptyState, ErrorText, StatusChip } from "@/components/ui";
import { Modal } from "@/components/modal";
import { CeilingBar, MeterStateChip, Sparkline, SPARKLINE_WIDTH } from "@/components/meter-ui";
import type { MeterRow } from "@/lib/meter-view";
import { assignMeter, setMeterOwner, syncMeterNow, syncMetersNow } from "./actions";

type Society = { id: string; name: string };
type Circuit = { id: string; societyId: string; label: string; state: string; takenBy: string | null };

type Filter = "assigned" | "attention" | "unassigned" | "all";

// Assigned first and by default: an unassigned device is mirrored but not
// watched, so it is not yet this product's problem — and on an account where
// 30 of 45 are unbound, they bury the ones that are.
const FILTERS: { key: Filter; label: string }[] = [
  { key: "assigned", label: "Assigned" },
  { key: "attention", label: "Needs attention" },
  { key: "unassigned", label: "Not assigned" },
  { key: "all", label: "All devices" },
];

type SortKey = "name" | "society" | "state" | "power" | "today" | "history" | "owner";

const STATE_ORDER: Record<string, number> = { offline: 0, silent: 1, reporting: 2 };

/**
 * How a column sorts, and which way it starts.
 *
 * Text starts ascending; figures start descending, because the reason to
 * sort by power or by today is to find the biggest. State starts with the
 * worst — the point of sorting by state is to bring trouble to the top.
 */
const SORTS: Record<SortKey, { label: string; numeric: boolean; get: (m: MeterRow) => string | number | null }> = {
  name: { label: "Meter", numeric: false, get: (m) => m.name.toLowerCase() },
  society: { label: "Measures", numeric: false, get: (m) => m.societyName?.toLowerCase() ?? null },
  state: { label: "State", numeric: true, get: (m) => (m.state ? STATE_ORDER[m.state] : null) },
  power: { label: "Power now · 24h", numeric: true, get: (m) => m.powerW },
  today: { label: "Today vs ceiling", numeric: true, get: (m) => m.dayKwh },
  history: { label: "History", numeric: true, get: (m) => (m.hourlyCount === 0 ? null : m.hourlyCount) },
  owner: { label: "Chased by", numeric: false, get: (m) => m.ownerLabel?.toLowerCase() ?? null },
};

/**
 * A meter with nothing to show in the sorted column always sinks, whichever
 * way the sort runs. Thirty dashes floating to the top is not an ordering
 * anybody asked for — "sort by power" means "show me the meters that have
 * one", in either direction.
 */
function compareBy(key: SortKey, dir: 1 | -1) {
  const { get } = SORTS[key];
  return (a: MeterRow, b: MeterRow) => {
    const av = get(a);
    const bv = get(b);
    if (av === null && bv === null) return a.name.localeCompare(b.name);
    if (av === null) return 1;
    if (bv === null) return -1;
    if (av === bv) return a.name.localeCompare(b.name);
    return (av > bv ? 1 : -1) * dir;
  };
}

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
  const [filter, setFilter] = useState<Filter>("assigned");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [society, setSociety] = useState("");
  const [circuit, setCircuit] = useState("");
  const [owner, setOwner] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = meters.filter((m) => {
      if (filter === "assigned" && m.state === null) return false;
      if (filter === "attention" && (m.state === null || m.state === "reporting") && m.openAlerts.length === 0)
        return false;
      if (filter === "unassigned" && (m.state !== null || !m.hasEnergySignal)) return false;
      if (!q) return true;
      return [m.name, m.societyName, m.circuitLabel, m.productModel]
        .filter(Boolean)
        .some((s) => s!.toLowerCase().includes(q));
    });
    return [...matched].sort(compareBy(sortKey, sortDir));
  }, [meters, filter, query, sortKey, sortDir]);

  // Clicking the sorted column reverses it; clicking another starts that
  // column at its own natural direction.
  function sortBy(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 1 ? -1 : 1));
      return;
    }
    setSortKey(key);
    setSortDir(SORTS[key].numeric ? -1 : 1);
  }

  const counts: Record<Filter, number> = {
    assigned: meters.filter((m) => m.state !== null).length,
    attention: meters.filter((m) => (m.state !== null && m.state !== "reporting") || m.openAlerts.length > 0).length,
    unassigned: meters.filter((m) => m.state === null && m.hasEnergySignal).length,
    all: meters.length,
  };

  function openAssign(m: MeterRow) {
    setEditing(m.id);
    setSociety(m.societyId ?? "");
    setCircuit(m.circuitId ?? "");
    setOwner(m.ownerId ?? "");
    setError(null);
  }

  const editingMeter = meters.find((m) => m.id === editing) ?? null;

  // Assignment first, then the owner if it changed — the owner write is ours
  // and cannot fail for outside reasons, so a refusal here is always the
  // assignment's, and the modal stays open with the reason.
  function saveAssignment() {
    if (!editingMeter) return;
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
    });
  }

  return (
    <Card className="p-6">
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
            <span className="flex items-center gap-2">
              {f.label}
              <span className="num text-[12px] opacity-75">{counts[f.key]}</span>
            </span>
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
                <SortHeader k="name" sortKey={sortKey} dir={sortDir} onSort={sortBy} />
                <SortHeader k="society" sortKey={sortKey} dir={sortDir} onSort={sortBy} />
                <SortHeader k="state" sortKey={sortKey} dir={sortDir} onSort={sortBy} />
                <SortHeader k="power" sortKey={sortKey} dir={sortDir} onSort={sortBy} align="right" />
                <SortHeader k="today" sortKey={sortKey} dir={sortDir} onSort={sortBy} />
                <SortHeader k="history" sortKey={sortKey} dir={sortDir} onSort={sortBy} align="right" />
                <SortHeader k="owner" sortKey={sortKey} dir={sortDir} onSort={sortBy} />
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
                  {/* Two fixed slots, always both present: the figure never
                      shifts because its neighbour's trend is missing, and the
                      left half renders whether or not the right half can. */}
                  <td>
                    <div className="flex items-center justify-end gap-3">
                      <div className="num text-right">
                        {m.powerW === null ? (
                          <span className="text-[var(--text-subtle)]">—</span>
                        ) : (
                          <>
                            <span style={{ color: m.stale ? "var(--text-muted)" : "var(--text)" }}>
                              {m.powerW.toFixed(0)} W
                            </span>
                            <div className="whitespace-nowrap text-xs text-[var(--text-subtle)]">{m.readAge}</div>
                          </>
                        )}
                      </div>
                      <div className="shrink-0" style={{ width: SPARKLINE_WIDTH }}>
                        {m.state !== null && <Sparkline values={m.spark} muted={m.state !== "reporting"} />}
                      </div>
                    </div>
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

      {/* In a modal, not appended to the card: the panel used to render
          below 45 rows of meters, so clicking Reassign scrolled nothing into
          view and read as a dead button (user-reported 2026-08-28). */}
      <Modal
        open={editingMeter !== null}
        onClose={() => setEditing(null)}
        title={editingMeter ? `Assign ${editingMeter.name}` : ""}
        description="A meter binds to one circuit, because a circuit is what gets billed — two meters on one circuit would be two sources for one figure. Leave the circuit blank while it is still undecided."
        size="wide"
        footer={
          <>
            <button type="button" className="btn-primary" disabled={pending} onClick={saveAssignment}>
              {pending ? "Saving…" : "Save"}
            </button>
            <button type="button" className="btn-ghost" disabled={pending} onClick={() => setEditing(null)}>
              Cancel
            </button>
          </>
        }
      >
        {editingMeter && (
          <AssignFields
            meter={editingMeter}
            societies={societies}
            circuits={circuits}
            society={society}
            circuit={circuit}
            owner={owner}
            fieldStaff={fieldStaff}
            pending={pending}
            error={error}
            onSociety={(v) => {
              setSociety(v);
              setCircuit("");
            }}
            onCircuit={setCircuit}
            onOwner={setOwner}
          />
        )}
      </Modal>
    </Card>
  );
}

/** The assign form's fields. Chrome, title and buttons belong to the Modal. */
function AssignFields({
  meter,
  societies,
  circuits,
  society,
  circuit,
  owner,
  fieldStaff,
  pending,
  error,
  onSociety,
  onCircuit,
  onOwner,
}: {
  meter: MeterRow;
  societies: Society[];
  circuits: Circuit[];
  society: string;
  circuit: string;
  owner: string;
  fieldStaff: { id: string; label: string }[];
  pending: boolean;
  error: string | null;
  onSociety: (v: string) => void;
  onCircuit: (v: string) => void;
  onOwner: (v: string) => void;
}) {
  const forSociety = circuits.filter((c) => c.societyId === society);
  return (
    <>
      {error && <ErrorText>{error}</ErrorText>}
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
      <p className="text-xs" style={{ color: "var(--text-subtle)" }}>
        An alert addressed to nobody is an alert nobody acts on — the owner is who goes and looks at
        the meter, so only accounts with field access are offered.
      </p>
    </>
  );
}

/**
 * A sortable column header. Hoisted to module scope rather than defined
 * inside the list — a component declared in another component's render body
 * is a new type every render, which throws away its state and is what this
 * repo's own lint rule already caught once.
 */
function SortHeader({
  k,
  sortKey,
  dir,
  onSort,
  align = "left",
}: {
  k: SortKey;
  sortKey: SortKey;
  dir: 1 | -1;
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = k === sortKey;
  return (
    <th
      className={align === "right" ? "text-right" : undefined}
      aria-sort={active ? (dir === 1 ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(k)}
        className="inline-flex items-center gap-1.5 hover:opacity-80"
        style={{ color: active ? "var(--text)" : "inherit", font: "inherit", letterSpacing: "inherit", textTransform: "inherit" }}
      >
        {SORTS[k].label}
        {/* The caret shows only on the sorted column: an arrow on every
            header says nothing about which one is in force. */}
        <span aria-hidden style={{ opacity: active ? 1 : 0.25 }}>
          {active ? (dir === 1 ? "↑" : "↓") : "↕"}
        </span>
      </button>
    </th>
  );
}
