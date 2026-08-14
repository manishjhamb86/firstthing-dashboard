"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CircuitEditForm } from "./circuit-edit-form";

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

const STATE_LABEL: Record<string, string> = {
  surveyed: "Surveyed",
  eligible: "Eligible",
  ineligible: "Ineligible",
  meter_installed: "Meter installed",
  pre_install_monitoring: "Pre-install monitoring",
  awaiting_installation: "Awaiting installation",
  post_install_pending: "Post-install pending",
  post_install_monitoring: "Post-install monitoring",
  benchmark_confirmed: "Benchmark confirmed",
  benchmark_review: "Benchmark under review",
  active_billing: "Active billing",
  retired: "Retired",
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
    <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-[var(--r-lg)] divide-y divide-[var(--border-subtle)]">
      {circuits.map((c) => (
        <div key={c.id} className="p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <div>
              <Link href={`/admin/societies/${societyId}/circuits/${c.id}`} className="font-medium hover:underline">
                {c.location || c.lightType}
              </Link>
              <span className="text-[var(--text-muted)]">
                {" "}
                · {c.lightType} · {c.serviceLine} · {c.meteredLightCount} lights (
                {c.representedLightCount} represented) · {c.wattage}W
                {c.workingHours != null && ` · ${c.workingHours}h/day`}
              </span>
            </div>
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-subtle)]">
              {STATE_LABEL[c.state] ?? c.state}
            </span>
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
                <button
                  type="button"
                  onClick={() => setEditingId(c.id)}
                  className="text-xs font-semibold"
                  style={{ color: "var(--accent)" }}
                >
                  Edit configuration
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
