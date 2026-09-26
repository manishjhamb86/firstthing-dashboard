import { describeExclusion, hasExclusion, type Exclusion } from "@/lib/circuit-load";

/**
 * How a saving is worked out on a circuit with fixtures left unreplaced
 * (2026-09-26). Hook-free, so Server and Client Components and the printed
 * reports share it — one explanation of one figure everywhere it appears.
 */
export function ExclusionNote({
  exclusion,
  before,
  after,
  title = "How the saving is worked out",
  className = "",
}: {
  exclusion: Exclusion | null | undefined;
  before: number | null;
  after: number | null;
  title?: string;
  className?: string;
}) {
  if (!exclusion || !hasExclusion(exclusion)) return null;
  const d = describeExclusion(exclusion, before, after);
  return (
    <div
      className={`break-inside-avoid rounded-[var(--r-md)] border px-4 py-3 text-[13.5px] leading-relaxed ${className}`}
      style={{ borderColor: "var(--info-line, var(--border-subtle))", background: "var(--info-bg, transparent)" }}
    >
      <p className="font-semibold" style={{ color: "var(--text)" }}>
        {title}
      </p>
      {d.lines.map((l, i) => (
        <p key={i} className="mt-1" style={{ color: "var(--text-muted)" }}>
          {l}
        </p>
      ))}
      {d.formula && (
        <p className="num mt-1.5 font-semibold" style={{ color: "var(--text)" }}>
          {d.formula}
        </p>
      )}
    </div>
  );
}
