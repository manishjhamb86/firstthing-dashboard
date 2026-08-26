"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardTitle, ErrorText, StatusChip } from "@/components/ui";
import { decideDeviceTypeProposal } from "./actions";

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
export function PendingProposals({ proposals, canDecide }: { proposals: Proposal[]; canDecide: boolean }) {
  const router = useRouter();
  const [addToCatalog, setAddToCatalog] = useState<Record<string, boolean>>({});
  const [rejecting, setRejecting] = useState<string | null>(null);
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
