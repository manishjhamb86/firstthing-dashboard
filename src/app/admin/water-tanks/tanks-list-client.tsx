"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClickableRow } from "@/components/clickable-row";
import { Card, ErrorText, StatusChip } from "@/components/ui";
import { SearchInput } from "@/components/search-input";
import { TankLevelBar } from "@/components/tank-visual";
import { formatInstant, timeAgo } from "@/lib/format-date";
import { assignTanks, syncTanksNow } from "./actions";

type Row = {
  id: string;
  name: string;
  deviceId: string;
  productName: string;
  hasLevelSignal: boolean;
  level: number | null;
  online: boolean;
  reportedAt: string | null;
  /** Connected, but its level has not changed in a long while. */
  stale: boolean;
  society: { id: string; name: string; location: string } | null;
};

type SocietyOption = { id: string; name: string; location: string };

/**
 * The list with the bulk hand-out: tick unassigned sensors, pick the society,
 * assign them all in one go (user-specified 2026-08-25). Search covers both
 * the tank's own name and the society's, since "which of Mahagun's tanks is
 * low" and "where is this device" are the same list read two ways.
 */
export function TanksListClient({
  tanks,
  societies,
  canAssign,
  syncedAt,
}: {
  tanks: Row[];
  societies: SocietyOption[];
  canAssign: boolean;
  syncedAt: string | null;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [view, setView] = useState<"all" | "unassigned" | "assigned">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [societyId, setSocietyId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return tanks.filter((t) => {
      if (view === "unassigned" && (t.society !== null || !t.hasLevelSignal)) return false;
      if (view === "assigned" && t.society === null) return false;
      if (!needle) return true;
      return (
        t.name.toLowerCase().includes(needle) ||
        (t.society?.name.toLowerCase().includes(needle) ?? false) ||
        t.deviceId.toLowerCase().includes(needle)
      );
    });
  }, [tanks, q, view]);

  const counts = useMemo(
    () => ({
      all: tanks.length,
      unassigned: tanks.filter((t) => t.hasLevelSignal && t.society === null).length,
      assigned: tanks.filter((t) => t.society !== null).length,
    }),
    [tanks],
  );

  function toggle(id: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function assign() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await assignTanks({ tankIds: [...selected], societyId });
      if (result.error) setError(result.error);
      else {
        const name = societies.find((s) => s.id === societyId)?.name ?? "the society";
        setNotice(`${result.assigned} tank${result.assigned === 1 ? "" : "s"} assigned to ${name}.`);
        setSelected(new Set());
        setSocietyId("");
        router.refresh();
      }
    });
  }

  function sync() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await syncTanksNow();
      if (result.error) setError(result.error);
      else {
        setNotice(`Synced — ${result.devices} devices, ${result.tanks} with a water level.`);
        router.refresh();
      }
    });
  }

  const seg = (key: typeof view, label: string, n: number) => (
    <button
      key={key}
      type="button"
      onClick={() => setView(key)}
      className="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[13px] font-semibold"
      style={
        view === key
          ? { background: "var(--accent-subtle)", borderColor: "var(--accent-line)", color: "var(--accent)" }
          : { background: "var(--surface)", borderColor: "var(--border)", color: "var(--text-muted)" }
      }
    >
      {label}
      <span
        className="num rounded-full px-1.5 text-[11px] font-bold"
        style={
          view === key
            ? { background: "var(--accent-line)", color: "var(--accent)" }
            : { background: "var(--surface-sunken)", color: "var(--text-subtle)" }
        }
      >
        {n}
      </span>
    </button>
  );

  return (
    <>
      <div className="mb-3.5 flex flex-wrap items-center gap-2.5">
        <SearchInput value={q} onChange={setQ} placeholder="Search tank or society…" label="Search tanks" className="w-72" />
        {seg("all", "All", counts.all)}
        {seg("unassigned", "Unassigned", counts.unassigned)}
        {seg("assigned", "Assigned", counts.assigned)}
        <div className="flex-1" />
        <button type="button" className="btn-ghost btn-sm" onClick={sync} disabled={pending}>
          {pending ? "Working…" : "Sync device list"}
        </button>
        {syncedAt && (
          <span className="text-[13px]" style={{ color: "var(--text-muted)" }}>
            Synced <span className="num">{formatInstant(new Date(syncedAt))}</span>
          </span>
        )}
      </div>

      {canAssign && selected.size > 0 && (
        <div
          className="mb-3.5 flex flex-wrap items-center gap-3 rounded-[var(--r-sm)] border px-4 py-3"
          style={{ background: "var(--accent-subtle)", borderColor: "var(--accent-line)" }}
        >
          <span className="text-sm font-semibold">
            {selected.size} tank{selected.size === 1 ? "" : "s"} selected
          </span>
          <div className="flex-1" />
          <select
            aria-label="Assign selected tanks to"
            className="field field-auto"
            value={societyId}
            onChange={(e) => setSocietyId(e.target.value)}
            disabled={pending}
          >
            <option value="">Choose a society…</option>
            {societies.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} — {s.location}
              </option>
            ))}
          </select>
          <button type="button" className="btn-primary" onClick={assign} disabled={pending || !societyId}>
            {pending ? "Assigning…" : "Assign to society"}
          </button>
          <button type="button" className="btn-ghost" onClick={() => setSelected(new Set())} disabled={pending}>
            Clear
          </button>
        </div>
      )}

      {error && <div className="mb-3"><ErrorText>{error}</ErrorText></div>}
      {notice && (
        <p className="mb-3 text-sm font-medium" style={{ color: "var(--ok-fg)" }}>
          {notice}
        </p>
      )}

      <Card className="overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 36 }} aria-label="Select" />
              <th>Tank</th>
              <th>Level</th>
              <th>Status</th>
              <th>Society</th>
              <th className="hidden lg:table-cell">Last report</th>
              <th style={{ width: 34 }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const selectable = canAssign && t.hasLevelSignal && t.society === null;
              return (
                <ClickableRow key={t.id} href={`/admin/water-tanks/${t.id}`}>
                  <td
                    onClick={(e) => {
                      // The checkbox cell is a control, not part of the row
                      // link. A click on the input itself already toggled via
                      // onChange — toggling here too would undo it.
                      e.stopPropagation();
                      if (selectable && !(e.target as HTMLElement).closest("input")) toggle(t.id);
                    }}
                  >
                    <input
                      type="checkbox"
                      aria-label={`Select ${t.name}`}
                      checked={selected.has(t.id)}
                      disabled={!selectable}
                      onChange={() => toggle(t.id)}
                    />
                  </td>
                  <td style={{ opacity: t.hasLevelSignal ? 1 : 0.55 }}>
                    <span className="text-sm font-semibold">{t.name}</span>
                    <p className="num mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                      {t.deviceId.slice(0, 6)}…{t.deviceId.slice(-4)} · {t.productName || "unknown product"}
                    </p>
                  </td>
                  <td style={{ opacity: t.hasLevelSignal ? 1 : 0.55 }}>
                    <TankLevelBar pct={t.hasLevelSignal ? (t.level ?? 0) : null} />
                  </td>
                  <td>
                    {t.online && t.stale ? (
                      <StatusChip tone="warn">Not reporting</StatusChip>
                    ) : t.online ? (
                      <StatusChip tone="ok">Online</StatusChip>
                    ) : t.hasLevelSignal ? (
                      <StatusChip tone="warn">Offline</StatusChip>
                    ) : (
                      <StatusChip tone="neu">Offline</StatusChip>
                    )}
                  </td>
                  <td>
                    {t.society ? (
                      <span>
                        <span className="text-sm font-medium">{t.society.name}</span>
                        <span className="block text-xs" style={{ color: "var(--text-muted)" }}>
                          {t.society.location}
                        </span>
                      </span>
                    ) : t.hasLevelSignal ? (
                      <StatusChip tone="warn">Unassigned</StatusChip>
                    ) : (
                      <span style={{ color: "var(--text-subtle)" }}>—</span>
                    )}
                  </td>
                  <td className="hidden text-[13px] lg:table-cell" style={{ color: "var(--text-muted)" }}>
                    <span className="num">{t.reportedAt ? formatInstant(new Date(t.reportedAt)) : "—"}</span>
                    {t.reportedAt && (
                      <span className="block text-xs" style={{ color: "var(--text-subtle)" }}>
                        {timeAgo(new Date(t.reportedAt))}
                      </span>
                    )}
                  </td>
                  <td className="text-right" aria-hidden>
                    <span className="row-link-cue text-sm font-semibold">→</span>
                  </td>
                </ClickableRow>
              );
            })}
          </tbody>
        </table>
      </Card>
      <p className="mt-3.5 text-[13px]" style={{ color: "var(--text-muted)" }}>
        Selection is offered on unassigned tank sensors only. Devices without a water-level signal stay
        listed so nothing in the account is invisible.
      </p>
    </>
  );
}
