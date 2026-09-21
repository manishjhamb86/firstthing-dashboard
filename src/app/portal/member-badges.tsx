import { Crown } from "lucide-react";
import { PORTAL_AUTHORITY_LABEL } from "@/lib/status-maps";
import { StatusChip } from "@/components/ui";

// Shared member-row anatomy for the Society admin page (design canvas
// fidelity, 2026-09-21: SocietyAdmin.dc.html's own committee row — avatar
// circle, name, a distinguishing badge for the office-bearer) — used by
// both CommitteeClient (add/remove/transfer) and AccessEditor (module
// grants), so the two lists on one page read as one row pattern rather than
// two hand-drawn versions that can drift.

export function initialsOf(name: string | null, email: string): string {
  const source = (name ?? email).trim();
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase() || "?";
}

export function MemberAvatar({ name, email }: { name: string | null; email: string }) {
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-bold"
      style={{ background: "var(--info-bg)", color: "var(--info-fg)" }}
      aria-hidden
    >
      {initialsOf(name, email)}
    </span>
  );
}

// The office-bearer is the one authority every screen on this page has to
// call out distinctly (it's the only one that can transfer, remove, or
// grant) — the same purple `kpi-tiles.tsx`'s HealthBubble already uses for
// "the one thing here that's different from the rest," reused for the same
// reason rather than inventing a second one-off hue.
const OB_PURPLE = { bg: "#F1EDFB", fg: "#5B3FB8" };

export function RoleBadge({ authority }: { authority: string }) {
  if (authority === "office_bearer") {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-[var(--r-pill)] px-2.5 py-1 text-[11px] font-bold"
        style={{ background: OB_PURPLE.bg, color: OB_PURPLE.fg }}
      >
        <Crown size={11} strokeWidth={2.4} aria-hidden />
        Office-bearer
      </span>
    );
  }
  return <StatusChip tone="neu">{PORTAL_AUTHORITY_LABEL[authority] ?? authority}</StatusChip>;
}
