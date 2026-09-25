"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, StatusChip } from "@/components/ui";
import { ClickableRow } from "@/components/clickable-row";
import { Modal } from "@/components/modal";
import type { QueueRow } from "@/lib/release-queue-loader";
import { releaseRoutineBatch } from "./actions";

const rupees = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export function ReleaseQueueClient({ rows }: { rows: QueueRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ released: number; failed: { societyName: string; error: string }[] } | null>(null);

  const routineRows = useMemo(() => rows.filter((r) => r.triage.routine), [rows]);
  const selectedRows = useMemo(() => routineRows.filter((r) => selected.has(r.calculationId)), [routineRows, selected]);
  const allRoutineSelected = routineRows.length > 0 && selectedRows.length === routineRows.length;

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected(allRoutineSelected ? new Set() : new Set(routineRows.map((r) => r.calculationId)));
  }

  function confirmRelease() {
    setResult(null);
    startTransition(async () => {
      const r = await releaseRoutineBatch([...selected]);
      setResult({
        released: r.released.length,
        failed: r.failed.map((f) => ({ societyName: f.societyName || "—", error: f.error })),
      });
      setSelected(new Set());
      setConfirmOpen(false);
      router.refresh();
    });
  }

  const paidCount = selectedRows.filter((r) => r.paid).length;
  const willStartClock = selectedRows.length - paidCount;

  return (
    <>
      {result && (
        <div
          className="mb-4 rounded-[var(--r-sm)] border px-4 py-3 text-sm"
          style={
            result.failed.length === 0
              ? { background: "var(--ok-bg)", borderColor: "var(--ok-line)", color: "var(--ok-fg)" }
              : { background: "var(--warn-bg)", borderColor: "var(--warn-line)", color: "var(--warn-fg)" }
          }
        >
          <p className="font-semibold">
            {result.released} released{result.failed.length > 0 ? `, ${result.failed.length} failed` : ""}.
          </p>
          {result.failed.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {result.failed.map((f, i) => (
                <li key={i}>
                  {f.societyName}: {f.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {routineRows.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={allRoutineSelected} onChange={toggleAll} />
            Select all routine ({routineRows.length})
          </label>
          {selected.size > 0 && (
            <button type="button" className="btn-primary btn-sm" disabled={pending} onClick={() => setConfirmOpen(true)}>
              Release {selected.size} selected
            </button>
          )}
        </div>
      )}

      <Card className="overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th className="w-8" />
              <th>Society</th>
              <th>Month</th>
              <th className="text-right">Invoice total</th>
              <th className="hidden md:table-cell text-right">Saved</th>
              <th className="hidden lg:table-cell">Basis</th>
              <th>Status</th>
              <th className="hidden sm:table-cell" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const measured = r.lines.filter((l) => l.basis === "measured").length;
              const agreed = r.lines.length - measured;
              return (
                <ClickableRow key={r.calculationId} href={`/admin/billing/${r.calculationId}`}>
                  <td>
                    {r.triage.routine && (
                      <input
                        type="checkbox"
                        checked={selected.has(r.calculationId)}
                        onChange={() => toggle(r.calculationId)}
                        aria-label={`Select ${r.societyName} ${r.period}`}
                      />
                    )}
                  </td>
                  <td>
                    <span className="font-medium">{r.societyName}</span>
                    <p className="text-[13px] text-[var(--text-muted)]">
                      {r.invoiceNumber} {r.paid && <span className="text-[var(--ok-fg)]">· paid</span>}
                    </p>
                  </td>
                  <td className="num">{r.period}</td>
                  <td className="num text-right">{rupees(r.invoiceTotal)}</td>
                  <td className="hidden md:table-cell num text-right">
                    {r.savedKwh.toFixed(0)} kWh
                    {r.savingsPct !== null && <span className="text-[var(--text-subtle)]"> · {r.savingsPct.toFixed(1)}%</span>}
                  </td>
                  <td className="hidden lg:table-cell">
                    {measured > 0 && <StatusChip tone="ok">{measured} measured</StatusChip>}
                    {agreed > 0 && <StatusChip tone="info">{agreed} agreed</StatusChip>}
                  </td>
                  <td>
                    {r.triage.routine ? (
                      <StatusChip tone="ok">Routine</StatusChip>
                    ) : (
                      <div>
                        <StatusChip tone="warn">Needs review</StatusChip>
                        <p className="mt-1 text-[12px] text-[var(--text-muted)]">{r.triage.reasons.join(" · ")}</p>
                      </div>
                    )}
                  </td>
                  <td className="hidden sm:table-cell text-right whitespace-nowrap" aria-hidden>
                    <span className="row-link-cue text-sm font-semibold">Open →</span>
                  </td>
                </ClickableRow>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Release these months?"
        description={`${selected.size} routine · ${paidCount} already paid · ${willStartClock} will start their clock`}
        footer={
          <>
            <button type="button" className="btn-ghost" disabled={pending} onClick={() => setConfirmOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" disabled={pending} onClick={confirmRelease}>
              {pending ? "Releasing…" : `Release ${selected.size}`}
            </button>
          </>
        }
      >
        <p className="text-sm text-[var(--text-muted)]">
          Each month becomes visible to its society, with its invoice, immediately. A month already
          paid starts no arrears clock; an unpaid one starts its overdue clock from its own due date.
        </p>
      </Modal>
    </>
  );
}
