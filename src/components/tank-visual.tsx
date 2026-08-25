/**
 * The tank drawing — hook-free so Server Components render it directly, same
 * rule as ui.tsx. Fill height is the level; the wave animation pauses when
 * the sensor is offline rather than hiding, because the last known level is
 * still the most useful thing on screen (it just is not live).
 */
export function TankVisual({
  pct,
  offline = false,
  width = 180,
  height = 240,
  pctSize = 34,
}: {
  pct: number;
  offline?: boolean;
  width?: number;
  height?: number;
  pctSize?: number;
}) {
  const level = Math.max(0, Math.min(100, pct));
  // The figure sits at 16% from the top, so it is over the WATER only on a
  // nearly-full tank. Its ink follows what is actually behind it — one fixed
  // colour would fail against one of the two (the 45%-on-accent case the
  // user reported, 2026-08-25).
  const labelOverWater = level >= 78;
  return (
    <div className={`tank-visual ${offline ? "tank-offline" : ""}`} style={{ width, height }}>
      <div className="tank-water" style={{ height: `${level}%` }}>
        <div className="tank-wave tank-wave-1" />
        <div className="tank-wave tank-wave-2" />
      </div>
      {[75, 50, 25].map((t) => (
        <div
          key={t}
          className="absolute right-2 flex items-center gap-1.5"
          style={{ bottom: `${t}%` }}
        >
          <span
            className="num text-[10px] font-semibold"
            style={{
              // Submerged ticks need light ink, dry ones dark.
              color: offline
                ? "var(--text-subtle)"
                : t <= level
                  ? "var(--tank-ink-wet)"
                  : "var(--text-muted)",
              opacity: 0.9,
            }}
          >
            {t}
          </span>
          <span className="inline-block h-[1.5px] w-2.5" style={{ background: "var(--accent-line)" }} />
        </div>
      ))}
      <div
        className="num absolute left-0 right-0 text-center font-extrabold"
        style={{
          top: "16%",
          fontSize: pctSize,
          color: offline
            ? "var(--text-subtle)"
            : labelOverWater
              ? "var(--tank-ink-wet)"
              : "var(--tank-ink-dry)",
        }}
      >
        {level}%
      </div>
    </div>
  );
}

/** The small level bar list rows use. */
export function TankLevelBar({ pct, width = 90 }: { pct: number | null; width?: number }) {
  if (pct === null) {
    return <span className="text-[13px]" style={{ color: "var(--text-subtle)" }}>No water-level signal</span>;
  }
  const level = Math.max(0, Math.min(100, pct));
  const fill = level === 0 ? "var(--bad-fg)" : level < 25 ? "var(--warn-fg)" : "var(--accent)";
  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        className="inline-block h-2 overflow-hidden rounded-full"
        style={{ width, background: "var(--surface-active)" }}
      >
        <span className="block h-full rounded-full" style={{ width: `${level}%`, background: fill }} />
      </span>
      <span className="num text-[13px] font-semibold" style={{ color: level < 25 ? fill : "var(--text)" }}>
        {level}%
      </span>
    </span>
  );
}
