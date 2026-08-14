"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CircuitEditForm } from "./circuit-edit-form";
import { Card, StatusChip } from "@/components/ui";
import { CIRCUIT_STATE, SERVICE_LINE_LABEL, statusMeta } from "@/lib/status-maps";

type Circuit = {
  id: string;
  serviceLine: string;
  location: string | null;
  lightType: string;
  meteredLightCount: number;
  representedLightCount: number;
  wattage: number;
  workingHours: number | null;
  workingHoursEffectiveAt: Date | null;
  state: string;
};

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

  return (
    <Card className="divide-y divide-[var(--border-subtle)]">
      {circuits.map((c) => {
        const state = statusMeta(CIRCUIT_STATE, c.state);
        return (
          <div key={c.id} className="p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div>
                <Link
                  href={`/admin/societies/${societyId}/circuits/${c.id}`}
                  className="font-medium hover:underline"
                >
                  {c.location || c.lightType}
                </Link>
                <p className="text-[var(--text-muted)]">
                  {c.lightType} · {SERVICE_LINE_LABEL[c.serviceLine] ?? c.serviceLine} ·{" "}
                  <span className="num">{c.meteredLightCount}</span> lights (
                  <span className="num">{c.representedLightCount}</span> represented) ·{" "}
                  <span className="num">{c.wattage}</span>W
                  {c.workingHours != null && (
                    <>
                      {" "}
                      · <span className="num">{c.workingHours}</span>h/day
                    </>
                  )}
                </p>
              </div>
              <StatusChip tone={state.tone}>{state.label}</StatusChip>
            </div>
            {canEdit && (
              <div className="mt-2">
                {editingId === c.id ? (
                  <CircuitEditForm
                    circuit={c}
                    onDone={() => {
                      setEditingId(null);
                      router.refresh();
                    }}
                  />
                ) : (
                  <button type="button" onClick={() => setEditingId(c.id)} className="btn-ghost btn-sm">
                    Edit configuration
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </Card>
  );
}
