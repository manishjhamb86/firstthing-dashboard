import type { ReactNode } from "react";

export type StatusTone = "good" | "warning" | "critical" | "info" | "pending" | "neutral";

export const TONE_VARS: Record<StatusTone, { bg: string; fg: string }> = {
  good: { bg: "var(--okb)", fg: "var(--okf)" },
  warning: { bg: "var(--wb)", fg: "var(--wf)" },
  critical: { bg: "var(--bb)", fg: "var(--bf)" },
  info: { bg: "var(--ib)", fg: "var(--if)" },
  pending: { bg: "var(--pb)", fg: "var(--pf)" },
  neutral: { bg: "var(--card3)", fg: "var(--m1)" },
};

export default function StatusChip({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  const c = TONE_VARS[tone];
  return (
    <span
      className="inline-flex items-center whitespace-nowrap rounded-[6px] px-2 py-1 font-mono text-[9.5px] font-bold uppercase tracking-wide"
      style={{ background: c.bg, color: c.fg }}
    >
      {children}
    </span>
  );
}
