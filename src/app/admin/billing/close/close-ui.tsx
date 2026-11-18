import Link from "next/link";
import { StatusChip, type ChipTone } from "@/components/ui";
import { formatDate, monthShort } from "@/lib/format-date";
import type { BillState, ReportState } from "@/lib/monthly-close";

/** The desk's shared chips and month picker — one wording for each state on every screen. */

export function ReportChip({ state, published, total }: { state: ReportState; published: number; total: number }) {
  const meta: Record<ReportState, [ChipTone, string]> = {
    none: ["neu", "No readings this month"],
    draft: ["info", "Draft · to review"],
    partial: ["warn", `${published} of ${total} published`],
    published: ["ok", "Published"],
  };
  const [tone, label] = meta[state];
  return <StatusChip tone={tone}>{label}</StatusChip>;
}

export function BillChip({ state }: { state: BillState }) {
  const meta: Record<BillState, [ChipTone, string]> = {
    not_fetched: ["warn", "Not fetched"],
    to_review: ["info", "Fetched · to review"],
    awaiting_release: ["info", "Awaiting release"],
    released: ["ok", "Released"],
  };
  const [tone, label] = meta[state];
  return <StatusChip tone={tone}>{label}</StatusChip>;
}

export function EmailChip({ emailedAt, ready }: { emailedAt: Date | null; ready: boolean }) {
  if (emailedAt) return <StatusChip tone="ok">Sent {formatDate(emailedAt)}</StatusChip>;
  if (ready) return <StatusChip tone="info">Ready to send</StatusChip>;
  return <StatusChip tone="neu">Not yet</StatusChip>;
}

/** The last six months, newest first, as links that keep the rest of the URL. */
export function MonthPicker({ period, months, basePath }: { period: string; months: string[]; basePath: string }) {
  const multiYear = new Set(months.map((m) => m.slice(0, 4))).size > 1;
  return (
    <nav className="seg" aria-label="Close month">
      {months.map((m) => (
        <Link key={m} href={`${basePath}?period=${m}`} className={m === period ? "on" : undefined} aria-current={m === period ? "page" : undefined}>
          {multiYear ? `${monthShort(m)} ${m.slice(2, 4)}` : monthShort(m)}
        </Link>
      ))}
    </nav>
  );
}

export function recentMonths(latest: string, count = 6): string[] {
  const [y, m] = latest.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

export function validPeriod(raw: string | undefined, fallback: string): string {
  return raw && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : fallback;
}
