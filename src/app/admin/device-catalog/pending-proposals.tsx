"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardTitle, ErrorText, StatusChip } from "@/components/ui";
import { suggestDeviceType, type CatalogDevice } from "@/lib/device-match";
import { decideDeviceTypeProposal, mergeDeviceTypeProposal } from "./actions";

export type Proposal = {
  id: string;
  name: string;
  defaultWattage: number | null;
  note: string | null;
  proposedBy: string | null;
  proposedAt: string;
};

/**
 * Devices a surveyor added on site, waiting on operations.
 *
 * Approving and LISTING are two separate decisions on purpose: a one-off
 * fixture in one basement should be usable on that circuit without being
 * offered to every surveyor from then on, or the catalog fills with
 * near-duplicates nobody can choose between.
 */
export function PendingProposals({
  proposals,
  canDecide,
  catalog,
}: {
  proposals: Proposal[];
  canDecide: boolean;
  /** Confirmed devices this proposal might already be one of. */
  catalog: CatalogDevice[];
}) {
  const router = useRouter();
  const [addToCatalog, setAddToCatalog] = useState<Record<string, boolean>>({});
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [mergeInto, setMergeInto] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (proposals.length === 0) return null;

  return (
    <Card className="mb-5 p-6">
      <div className="mb-1 flex flex-wrap items-center gap-3">
        <CardTitle className="mb-0">Devices waiting for confirmation</CardTitle>
        <StatusChip tone="warn">{proposals.length}</StatusChip>
      </div>
      <p className="mb-4 text-[13px]" style={{ color: "var(--text-muted)" }}>
        Added from a survey. Their wattage feeds the load check and the savings benchmark, so the
        circuits using them cannot be validated until each one is decided.
      </p>
      {error && <ErrorText>{error}</ErrorText>}
      <ul className="space-y-3">
        {proposals.map((p) => (
          <li key={p.id} className="border-b pb-3 last:border-b-0" style={{ borderColor: "var(--border-subtle)" }}>
            <p className="text-sm font-semibold">
              {p.name}
              {p.defaultWattage !== null && (
                <>
                  {" · "}
                  <span className="num">{p.defaultWattage}</span> W
                </>
              )}
            </p>
            <p className="text-[12px]" style={{ color: "var(--text-subtle)" }}>
              {p.proposedBy ? `Proposed by ${p.proposedBy}` : "Proposed"} · {p.proposedAt}
              {p.note ? ` · ${p.note}` : ""}
            </p>

            {(() => {
              // Offer the device it is probably a duplicate of, before the
              // Confirm/Reject choice — that pair has no answer for "this
              // already exists under another name".
              const match = suggestDeviceType(p.name, p.defaultWattage, catalog);
              const chosen = mergeInto[p.id] ?? match?.device.id ?? "";
              if (!canDecide || !match) return null;
              return (
                <div
                  className="mt-2 rounded-[var(--r-sm)] border p-2.5 text-[13px]"
                  style={{ borderColor: "var(--warn-line)", background: "var(--warn-bg)" }}
                >
                  <p className="mb-1.5" style={{ color: "var(--warn-fg)" }}>
                    The catalog already has <strong>{match.device.name}</strong>
                    {match.sameWattage ? ", at the same wattage" : ""} — this may be the same fixture
                    under another name.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      className="field field-auto"
                      aria-label={`Merge ${p.name} into`}
                      value={chosen}
                      onChange={(e) => setMergeInto((m) => ({ ...m, [p.id]: e.target.value }))}
                    >
                      {catalog.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                          {c.defaultWattage !== null ? ` · ${c.defaultWattage}W` : ""}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn-primary"
                      // Several proposals can be waiting at once, each with its
                      // own button reading the same two words.
                      aria-label={`${p.name} is an existing device`}
                      disabled={pending || !chosen}
                      onClick={() =>
                        start(async () => {
                          setError(null);
                          const r = await mergeDeviceTypeProposal({ id: p.id, intoId: chosen });
                          if ("error" in r) setError(r.error);
                          else router.refresh();
                        })
                      }
                    >
                      It is this one
                    </button>
                  </div>
                </div>
              );
            })()}

            {!canDecide ? null : rejecting === p.id ? (
              <div className="mt-2 space-y-2">
                <input
                  className="field"
                  aria-label={`Reason for rejecting ${p.name}`}
                  placeholder="What should the surveyor record instead?"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        setError(null);
                        const r = await decideDeviceTypeProposal({ id: p.id, approve: false, reason });
                        if ("error" in r) setError(r.error);
                        else {
                          setRejecting(null);
                          setReason("");
                          router.refresh();
                        }
                      })
                    }
                  >
                    Reject
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => setRejecting(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      setError(null);
                      const r = await decideDeviceTypeProposal({
                        id: p.id,
                        approve: true,
                        addToCatalog: addToCatalog[p.id] ?? false,
                      });
                      if ("error" in r) setError(r.error);
                      else router.refresh();
                    })
                  }
                >
                  Confirm
                </button>
                <label className="flex items-center gap-1.5 text-[13px]">
                  <input
                    type="checkbox"
                    checked={addToCatalog[p.id] ?? false}
                    onChange={(e) => setAddToCatalog((m) => ({ ...m, [p.id]: e.target.checked }))}
                    aria-label={`Add ${p.name} to the catalog for everyone`}
                  />
                  also add it to the catalog for future surveys
                </label>
                <button
                  type="button"
                  className="btn-ghost text-[13px]"
                  style={{ color: "var(--bad-fg)" }}
                  onClick={() => {
                    setRejecting(p.id);
                    setReason("");
                  }}
                >
                  Reject
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
