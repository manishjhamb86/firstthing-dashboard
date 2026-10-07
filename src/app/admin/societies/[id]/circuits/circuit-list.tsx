"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CircuitEditForm } from "./circuit-edit-form";
import { Card, StatusChip } from "@/components/ui";
import { CIRCUIT_STATE, SERVICE_LINE_LABEL, statusMeta } from "@/lib/status-maps";
import { RemoveCircuitButton } from "@/components/remove-circuit-button";
import { groupCircuitsByDeal } from "@/lib/circuit-deal-group";

type Circuit = {
  id: string;
  siteSurveyId: string | null;
  serviceLine: string;
  location: string | null;
  lightType: string;
  meteredLightCount: number;
  /** The full installation — not counting the demo lights (2026-09-27). */
  representedLightCount: number;
  demoLights: number;
  /** A real meter is currently attached and reporting through this circuit (2026-10-08). */
  isLive: boolean;
  wattage: number;
  workingHours: number | null;
  workingHoursEffectiveAt: Date | null;
  state: string;
  canRemove: boolean;
  blockLabel: string | null;
};

function CircuitRow({
  c,
  societyId,
  canEdit,
  editingId,
  setEditingId,
  onDone,
  /** Shown only inside a deal group, where "which demo is this" matters more than the circuit's own location. */
  demoOrdinal,
}: {
  c: Circuit;
  societyId: string;
  canEdit: boolean;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  onDone: () => void;
  demoOrdinal?: number;
}) {
  const state = statusMeta(CIRCUIT_STATE, c.state);
  return (
    <div className="p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div>
          <Link href={`/admin/societies/${societyId}/circuits/${c.id}`} className="font-medium hover:underline">
            {demoOrdinal ? `Demo ${demoOrdinal}` : c.location || c.lightType}
          </Link>
          <p className="text-[var(--text-muted)]">
            {c.lightType} · {SERVICE_LINE_LABEL[c.serviceLine] ?? c.serviceLine} ·{" "}
            <span className="num">{c.meteredLightCount}</span> metered ·{" "}
            <span className="num">{(c.representedLightCount + c.demoLights).toLocaleString("en-IN")}</span> installed (
            <span className="num">{c.representedLightCount.toLocaleString("en-IN")}</span> full +{" "}
            <span className="num">{c.demoLights.toLocaleString("en-IN")}</span> demo) ·{" "}
            <span className="num">{c.wattage}</span>W
            {c.workingHours != null && (
              <>
                {" "}
                · <span className="num">{c.workingHours}</span>h/day
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Which of the (possibly several) demo circuits on this deal is
              actually reporting right now, vs one a meter has since moved
              off — 2026-10-08, user-specified: "mention that this circuit
              is not live... depending on whether a demo circuit is still
              attached to it." Shown unconditionally, not just inside a
              group, since a solo circuit with no meter at all is exactly
              as worth stating. */}
          <StatusChip tone={c.isLive ? "ok" : "neu"}>
            {c.isLive ? "Live monitoring" : "Not live — no meter attached"}
          </StatusChip>
          <StatusChip tone={state.tone}>{state.label}</StatusChip>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        {canEdit &&
          (editingId === c.id ? (
            <CircuitEditForm circuit={c} onDone={onDone} />
          ) : (
            <button type="button" onClick={() => setEditingId(c.id)} className="btn-ghost btn-sm">
              Edit configuration
            </button>
          ))}
        {editingId !== c.id && (
          <RemoveCircuitButton
            circuitId={c.id}
            label={c.location || c.lightType}
            canRemove={c.canRemove}
            blockLabel={c.blockLabel}
          />
        )}
      </div>
    </div>
  );
}

export function CircuitList({
  circuits,
  canEdit,
  societyId,
}: {
  circuits: Circuit[];
  canEdit: boolean;
  societyId: string;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const router = useRouter();
  const onDone = () => {
    setEditingId(null);
    router.refresh();
  };

  const { groups, solo } = groupCircuitsByDeal(
    circuits.map((c) => ({
      id: c.id,
      siteSurveyId: c.siteSurveyId,
      location: c.location,
      lightType: c.lightType,
      demoLights: c.demoLights,
      fullInstallation: c.representedLightCount,
      isLive: c.isLive,
      state: c.state,
    })),
  );
  const byId = new Map(circuits.map((c) => [c.id, c]));

  return (
    <div className="flex flex-col gap-4">
      {/* More than one demo circuit recorded for the same deal/location —
          the society asked for a second demo, or the first one wasn't
          trusted, and a fresh circuit was walked through rather than a
          second demo added to the existing one (2026-10-08, user-
          specified). Shown together, under the shared deal name, rather
          than as two unrelated "Basement" rows — nothing about the
          underlying circuits is merged, only how they're read. */}
      {groups.map((g) => (
        <Card key={g.label + g.members.map((m) => m.id).join(",")} className="overflow-hidden">
          <div className="border-b border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-4 py-3">
            <p className="font-semibold">
              {g.label} — {g.members.length} demos on this deal
            </p>
            <p className="mt-1 text-[13px] text-[var(--text-muted)]">
              {g.members.map((m, i) => `Demo ${i + 1}: ${m.demoLights.toLocaleString("en-IN")}`).join(" · ")}
              {" · "}
              {g.combinedTotal !== null ? (
                <>
                  <span className="num">{g.combinedDemoLights.toLocaleString("en-IN")}</span> demo +{" "}
                  <span className="num">
                    {g.members[0]!.fullInstallation.toLocaleString("en-IN")}
                  </span>{" "}
                  full installation ={" "}
                  <span className="num font-semibold">{g.combinedTotal.toLocaleString("en-IN")}</span> total
                </>
              ) : (
                <span style={{ color: "var(--warn-fg)" }}>
                  these circuits disagree on the full installation (
                  {g.fullInstallationDisagreement!.map((n) => n.toLocaleString("en-IN")).join(" vs ")}) — correct
                  one before a combined total can show
                </span>
              )}
            </p>
          </div>
          <div className="divide-y divide-[var(--border-subtle)]">
            {g.members.map((m, i) => (
              <CircuitRow
                key={m.id}
                c={byId.get(m.id)!}
                societyId={societyId}
                canEdit={canEdit}
                editingId={editingId}
                setEditingId={setEditingId}
                onDone={onDone}
                demoOrdinal={i + 1}
              />
            ))}
          </div>
        </Card>
      ))}

      {solo.length > 0 && (
        <Card className="divide-y divide-[var(--border-subtle)]">
          {solo.map((s) => (
            <CircuitRow
              key={s.id}
              c={byId.get(s.id)!}
              societyId={societyId}
              canEdit={canEdit}
              editingId={editingId}
              setEditingId={setEditingId}
              onDone={onDone}
            />
          ))}
        </Card>
      )}
    </div>
  );
}
