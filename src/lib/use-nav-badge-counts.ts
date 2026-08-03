"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabase";
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
      const [societies, invoices] = await Promise.all([
        supabase.from("societies").select("id", { count: "exact", head: true }),
        supabase
          .from("invoices")
          .select("id", { count: "exact", head: true })
          .neq("status", "Paid"),
      ]);

      if (cancelled) return;
      setCounts({
        societiesCount: societies.count ?? undefined,
        unpaidInvoicesCount: invoices.count ?? undefined,
      });
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [role]);

  return counts;
}
