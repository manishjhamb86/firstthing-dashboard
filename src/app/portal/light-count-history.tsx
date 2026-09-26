import type { LightStage } from "@/lib/light-count-history";
import { formatDate } from "@/lib/format-date";

const kwh = (n: number) => n.toFixed(2);

/**
 * A circuit's light count as a short timeline: the count at the demo and how
 * long it held, then each change with its own period, the last one marked
 * current. Each stage states the baseline for that many lights and the most
 * the circuit may draw while meeting the benchmark — the figure a month is
 * judged against changes with the count, and a society should see when.
 */
export function LightCountHistory({ stages }: { stages: LightStage[] }) {
  if (stages.length === 0) return null;
  return (
    <ol className="relative mt-2.5 space-y-2.5 border-l pl-4" style={{ borderColor: "var(--border-subtle)" }}>
      {stages.map((s, i) => (
        <li key={`${s.from}-${i}`} className="relative">
          <span
            aria-hidden
            className="absolute top-[5px] -left-[21px] h-2.5 w-2.5 rounded-full border-2"
            style={{
              borderColor: s.current ? "var(--accent)" : "var(--border)",
              background: s.current ? "var(--accent)" : "var(--surface)",
            }}
          />
          <p className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
            <strong className="num">{s.lightCount.toLocaleString("en-IN")} lights</strong>
            <span className="num text-[12px]" style={{ color: "var(--text-muted)" }}>
              {s.from ? formatDate(s.from) : "from the start"} → {s.to ? formatDate(s.to) : "now"}
            </span>
            {s.current && (
              <span
                className="rounded-[var(--r-pill)] px-1.5 py-px text-[10.5px] font-bold uppercase tracking-wide"
                style={{ background: "var(--info-bg)", color: "var(--info-fg)" }}
              >
                Current
              </span>
            )}
          </p>
          {s.demo && (
            <p className="text-[11.5px]" style={{ color: "var(--text-subtle)" }}>
              Demo {formatDate(s.demo.from)} → {s.demo.to ? formatDate(s.demo.to) : "in progress"}
            </p>
          )}
          {s.baseline !== null && (
            <p className="num text-[11.5px]" style={{ color: "var(--text-subtle)" }}>
              Before FirsThing {kwh(s.baseline)} kWh/day
              {s.benchmarkPct !== null && s.ceilingKwh !== null && (
                <>
                  {" "}
                  · {s.benchmarkPct.toFixed(2)}% benchmark → at most {kwh(s.ceilingKwh)} kWh/day
                </>
              )}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}
