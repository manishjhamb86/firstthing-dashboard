"use client";

import { useFreshness } from "@/components/shell/AppShell";

/** Registers "now" with the header's freshness pill on mount. Renders nothing. */
export default function PortfolioFreshness() {
  useFreshness(new Date());
  return null;
}
