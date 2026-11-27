"use client";

import { useState } from "react";
import Link from "next/link";
import { StatusChip, type ChipTone } from "@/components/ui";
import { WithdrawButton } from "@/app/admin/documents/withdraw-button";
import { monthLabel } from "@/lib/format-date";

export type SharedDocItem = {
  key: string;
  id: string;
  period: string;
  /** The document's own date, already formatted ("20-Nov-2026 15:40"). */
  dateLabel: string;
  title: string;
  detail: string;
  typeLabel: string;
  tone: ChipTone;
  href: string;
  external: boolean;
  /** Set only for a filed document that can be withdrawn here. */
  version?: number;
};

/**
 * The society page's "Documents shared with the society" card (2026-11-27,
 * user-asked): a tab per month that holds documents, opening on the latest,
 * and each row dated by the document itself. The signed agreement belongs to
 * no month, so it stays above the tabs.
 */
export function SharedDocuments({
  agreement,
  rows,
  canWithdraw,
}: {
  agreement: SharedDocItem | null;
  rows: SharedDocItem[];
  canWithdraw: boolean;
}) {
  const months = [...new Set(rows.map((r) => r.period))].sort().reverse();
  const [month, setMonth] = useState(months[0] ?? "");
  const shown = rows.filter((r) => r.period === month);

  return (
    <div className="mt-3 flex flex-col gap-3">
      {agreement && (
        <div className="overflow-x-auto">
          <DocTable items={[agreement]} canWithdraw={canWithdraw} />
        </div>
      )}
      {months.length > 0 && (
        <>
          <div className="seg" role="tablist" aria-label="Month">
            {months.map((m) => {
              const n = rows.filter((r) => r.period === m).length;
              return (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={m === month}
                  className={m === month ? "on" : undefined}
                  onClick={() => setMonth(m)}
                >
                  {monthLabel(m)} · {n}
                </button>
              );
            })}
          </div>
          <div className="overflow-x-auto" role="tabpanel">
            <DocTable items={shown} canWithdraw={canWithdraw} />
          </div>
        </>
      )}
    </div>
  );
}

function DocTable({ items, canWithdraw }: { items: SharedDocItem[]; canWithdraw: boolean }) {
  return (
    <table className="tbl tbl-compact">
      <thead>
        <tr>
          <th>Date</th>
          <th>Document</th>
          <th>Type</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {items.map((d) => (
          <tr key={d.key}>
            <td className="num whitespace-nowrap">{d.dateLabel}</td>
            <td>
              <span className="font-medium">{d.title}</span>
              <span className="block text-xs text-[var(--text-subtle)]">{d.detail}</span>
            </td>
            <td>
              <StatusChip tone={d.tone}>{d.typeLabel}</StatusChip>
            </td>
            <td className="text-right whitespace-nowrap">
              {d.external ? (
                <a href={d.href} target="_blank" rel="noreferrer" className="btn-secondary btn-sm">
                  Download
                </a>
              ) : (
                <Link href={d.href} className="btn-secondary btn-sm">
                  Open
                </Link>
              )}
              {d.external && d.version !== undefined && canWithdraw && (
                <div className="mt-1">
                  <WithdrawButton documentId={d.id} version={d.version} />
                </div>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
