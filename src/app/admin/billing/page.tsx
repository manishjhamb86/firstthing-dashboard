import { redirect } from "next/navigation";

/**
 * The billing board was retired (2026-11-19, the user's call): Monthly close
 * does its job — every billing society's month, its report and bill state,
 * and the way into each calculation. Old links and bookmarks land there.
 * The calculation pages under /admin/billing/[calculationId] are unchanged.
 * The board's "Run month" (the readings-based run, phase two of CON-47) goes
 * with it; runCalculation in ./actions.ts stays for when that phase is built.
 */
export default function BillingIndex() {
  redirect("/admin/billing/close");
}
