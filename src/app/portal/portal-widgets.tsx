import type { SavingsBand } from "@/lib/circuit-load";
import type { ChipTone } from "@/components/ui";

/**
 * Small presentational pieces the portal pages share. Hook-free, so Server
 * Components render them directly — the same rule as ui.tsx.
 */

/**
 * Band → chip tone, the same mapping the monthly report settled (2026-08-29):
 * the band's own accent inks fail contrast at chip sizes, so the wording goes
 * through the app's contrast-tuned StatusChip tones. Six bands to five tones
 * is fine — the label is always the band's own words.
 */
export const BAND_TONE: Record<SavingsBand, ChipTone> = {
  green: "ok",
  cyan: "info",
  yellow: "warn",
  orange: "warn",
  red: "bad",
  suspect: "warn",
};

export function monthName(month: string): string {
  const d = new Date(`${month}-01T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return month;
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** "Wed 10" — same in-table date rule as the monthly report. */
export function dayShort(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", timeZone: "UTC" });
}

export function timeAgoShort(at: Date, now: Date = new Date()): string {
  const mins = Math.max(0, Math.floor((now.getTime() - at.getTime()) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.floor(h / 24);
  if (days === 1) return "yesterday";
  if (days < 31) return `${days} days ago`;
  return at.toISOString().slice(0, 10);
}

/**
 * The society's daily consumption as bars, with the "before FirsThing" rule
 * — the one line that says what the service is worth. Single hue (the app's
 * chart-mark blue); the baseline label sits BELOW the rule, the clipping
 * lesson the monthly report paid for.
 */
export function ConsumptionBars({
  days,
  baseline,
  height = 150,
}: {
  days: { date: string; kWh: number }[];
  baseline: number | null;
  height?: number;
}) {
  const w = 1020;
  const mx = Math.max((baseline ?? 0) * 1.06, Math.max(...days.map((d) => d.kWh)) * 1.15);
  const gap = 6;
  const bw = (w - gap * (days.length - 1)) / days.length;
  const y = baseline !== null ? height - (baseline / mx) * height : null;
  return (
    <svg viewBox={`0 0 ${w} ${height + 34}`} style={{ width: "100%", display: "block" }} role="img"
      aria-label={`Daily consumption, ${days.length} days`}>
      {y !== null && (
        <>
          <line x1={0} x2={w} y1={y} y2={y} stroke="var(--chart-rule)" strokeWidth={1.4} strokeDasharray="5 4" />
          <text x={w} y={y + 15} textAnchor="end" fontSize={10.5} fontWeight={600} fill="var(--text-muted)">
            before FirsThing · {baseline!.toFixed(1)} kWh/day
          </text>
        </>
      )}
      {days.map((d, i) => {
        const bh = Math.max(3, (d.kWh / mx) * height);
        return (
          <rect key={d.date} x={i * (bw + gap)} y={height - bh} width={bw} height={bh} rx={3.5}
            fill="var(--chart-mark)">
            <title>{`${d.date} · ${d.kWh.toFixed(2)} kWh`}</title>
          </rect>
        );
      })}
      <line x1={0} x2={w} y1={height} y2={height} stroke="var(--border)" strokeWidth={1} />
      {days.map((d, i) =>
        // Sparse x labels: first, last and every 5th, so 30 days do not smear.
        i === 0 || i === days.length - 1 || i % 5 === 0 ? (
          <text key={`l${d.date}`} x={i * (bw + gap) + bw / 2} y={height + 16} textAnchor="middle"
            fontSize={10} fill="var(--text-subtle)">
            {d.date.slice(8, 10)}
          </text>
        ) : null,
      )}
    </svg>
  );
}
