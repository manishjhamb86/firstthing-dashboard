"use client";

import { useEffect, useState } from "react";
import type { Role } from "./roles";
import type { NavBadgeKey } from "./nav-config";

export type NavBadgeCounts = Partial<Record<NavBadgeKey, number>>;

/** Real, honest nav badge counts — only computed for roles/items that have a cheap, real query behind them. */
export function useNavBadgeCounts(role: Role): NavBadgeCounts {
  const [counts, setCounts] = useState<NavBadgeCounts>({});

  useEffect(() => {
    if (role !== "admin") return;
    let cancelled = false;

    async function load() {
      const res = await fetch("/api/admin/nav-badges");
      if (!res.ok || cancelled) return;
      const data = await res.json();

      if (cancelled) return;
      setCounts({
        societiesCount: data.societiesCount,
        unpaidInvoicesCount: data.unpaidInvoicesCount,
      });
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [role]);

  return counts;
}
