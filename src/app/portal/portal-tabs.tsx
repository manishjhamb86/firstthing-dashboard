import Link from "next/link";

/**
 * The portal's sections. Overview is everything the society has to act on;
 * Water tanks is live infrastructure. The tanks tab renders even when the
 * society has no tanks yet — the page then says so (INV-06's empty state)
 * rather than the tab appearing and vanishing as assignments change.
 */
export function PortalTabs({ active }: { active: "dashboard" | "tanks" | "lighting" | "committee" }) {
  const tab = (href: string, label: string, on: boolean) => (
    <Link
      href={href}
      className="inline-flex items-center rounded-full border px-4.5 py-2 text-sm font-semibold"
      style={
        on
          ? { background: "var(--accent-subtle)", borderColor: "var(--accent-line)", color: "var(--accent)" }
          : { background: "var(--surface)", borderColor: "var(--border)", color: "var(--text-muted)" }
      }
    >
      {label}
    </Link>
  );
  return (
    // flex-wrap, not a fixed row: two tabs fitted a phone, four do not — the
    // fourth pushed 60px off-screen at 390px (measured 2026-08-25). Same
    // class of bug as the admin nav's own wrap fix.
    <div className="mb-6 flex flex-wrap gap-2.5">
      {tab("/portal", "Dashboard", active === "dashboard")}
      {tab("/portal/tanks", "Water tanks", active === "tanks")}
      {tab("/portal/lighting", "Lighting", active === "lighting")}
      {tab("/portal/committee", "Committee", active === "committee")}
    </div>
  );
}
