"use client";

import { useState } from "react";
import { StatusChip } from "@/components/ui";
import { Modal } from "@/components/modal";
import { SENSOR_STATUS_META } from "@/lib/inspection";

export type InspectionFindingRow = {
  id: string;
  srNo: number;
  location: string;
  sensorStatus: keyof typeof SENSOR_STATUS_META;
  actionReplace: boolean;
  remarks: string | null;
};

/**
 * The listing shows only a rollup — how many of each fault type — not every
 * fixture stacked as its own card (user-caught 2026-09-24, from a real
 * inspection: six full-width cards for six faults read as a wall of near-
 * identical rows before anyone could see the shape of the problem). A count
 * per status is the "important info" the list needs; the full line-item
 * list is one click away, in a popup, for whoever wants it.
 */
export function InspectionFindingsSummary({ findings }: { findings: InspectionFindingRow[] }) {
  const [open, setOpen] = useState(false);
  if (findings.length === 0) return null;

  const counts = new Map<string, number>();
  for (const f of findings) counts.set(f.sensorStatus, (counts.get(f.sensorStatus) ?? 0) + 1);
  // Worst first — the same "furthest behind first" rule this codebase
  // applies to every other status ordering (billing status, intake status).
  const order: (keyof typeof SENSOR_STATUS_META)[] = ["off", "flicker", "dim", "full", "ok"];
  const byCount = order.filter((k) => counts.has(k));

  return (
    <>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {byCount.map((status) => {
          const meta = SENSOR_STATUS_META[status];
          return (
            <StatusChip key={status} tone={meta.tone}>
              {counts.get(status)} {meta.label}
            </StatusChip>
          );
        })}
        <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(true)}>
          View {findings.length} {findings.length === 1 ? "fixture" : "fixtures"}
        </button>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Faulty fixtures" description={`${findings.length} recorded on this inspection.`} size="wide">
        <ul className="space-y-2">
          {findings.map((f) => {
            const meta = SENSOR_STATUS_META[f.sensorStatus];
            return (
              <li key={f.id} className="rounded-[var(--r-md)] border p-3" style={{ borderColor: "var(--border-subtle)" }}>
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <span className="min-w-0 truncate font-medium">
                    {f.srNo}. {f.location}
                  </span>
                  <StatusChip tone={meta.tone}>{meta.label}</StatusChip>
                </div>
                {(f.actionReplace || f.remarks) && (
                  <p className="mt-1 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                    {[f.actionReplace ? "To be replaced" : null, f.remarks].filter(Boolean).join(" · ")}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </Modal>
    </>
  );
}
