import { SERVICE_LINE_LABEL } from "@/lib/status-maps";

/**
 * CON-24 as amended 2026-08-31: a service line is delivered in PARTS, each
 * part its own deal (Pipeline) — lighting as up to ~8 (Basement B1, stilt
 * parking, lift lobby by tower batch, street lights…), water as up to 3
 * kinds of setup, solar and wastewater one deal at a time for now. This
 * module is the whole decision — pure, so the refusals unit-test without a
 * request context, the same split as portal-authority.ts.
 */

/** Lines that are still one open deal at a time (the user's call). */
const SINGLE_DEAL_LINES = new Set(["solar", "wastewater"]);

export type OpenDeal = { id: string; dealScope: string | null };

export type NewDealCheck =
  | { ok: true; dealScope: string | null }
  | { ok: false; error: string };

/** Case- and whitespace-insensitive, so "Basement B1" and "basement  b1" collide. */
function normalise(scope: string): string {
  return scope.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * May this lead open a new deal on the line, and under what scope?
 *
 * `openDeals` is every NON-closed-lost deal for (society, serviceLine) —
 * a deal at active_billing still occupies its scope (the part exists), while
 * a closed-lost one frees it for another attempt.
 *
 * The rules, each load-bearing:
 *  · solar/wastewater: one open deal, full stop — a second is refused
 *    whatever it is named.
 *  · a SECOND deal on a line must be named, and so must the first: two
 *    deals a screen can only label "Lighting" and "Lighting" are
 *    indistinguishable everywhere they appear, so the existing unnamed deal
 *    has to be named (ops can, via Edit) before a sibling opens.
 *  · a duplicate scope among open deals is refused outright — the same
 *    refuse-not-flag call already made for duplicate societies and duplicate
 *    circuits, because an override is exactly how those duplicates happened.
 */
export function checkNewDeal(input: {
  serviceLine: string;
  dealScope: string | undefined | null;
  openDeals: OpenDeal[];
}): NewDealCheck {
  const scope = input.dealScope?.trim().replace(/\s+/g, " ") || null;
  const line = SERVICE_LINE_LABEL[input.serviceLine] ?? input.serviceLine;

  if (SINGLE_DEAL_LINES.has(input.serviceLine) && input.openDeals.length > 0) {
    return {
      ok: false,
      error: `${line} is one deal at a time for now — this society already has an open ${line.toLowerCase()} deal. Close it as lost first, or work the existing deal.`,
    };
  }

  if (input.openDeals.length > 0) {
    if (!scope) {
      return {
        ok: false,
        error: `This society already has an open ${line.toLowerCase()} deal — name which part of the installation this new deal covers (e.g. "Basement B1", "Lift lobby — Towers 1–4").`,
      };
    }
    const unnamed = input.openDeals.find((d) => !d.dealScope?.trim());
    if (unnamed) {
      return {
        ok: false,
        error: `The existing open ${line.toLowerCase()} deal has no part name yet — edit that deal and name its scope first, so the two can be told apart everywhere they appear.`,
      };
    }
    const clash = input.openDeals.find((d) => normalise(d.dealScope!) === normalise(scope));
    if (clash) {
      return {
        ok: false,
        error: `An open ${line.toLowerCase()} deal already covers "${clash.dealScope}". Open the existing deal, or name a different part.`,
      };
    }
  }

  return { ok: true, dealScope: scope };
}

/**
 * "Lighting — Basement B1", or just "Lighting" for a line's only deal.
 * The one place this string is built, so a deal reads the same on the
 * pipeline list, the society page, the field list and the portal.
 */
export function dealLabel(serviceLine: string, dealScope: string | null | undefined): string {
  const line = SERVICE_LINE_LABEL[serviceLine] ?? serviceLine;
  const scope = dealScope?.trim();
  return scope ? `${line} — ${scope}` : line;
}

/**
 * FEAT-014-AC-7's demos, capped: "for each pipeline there can be multiple
 * demos between 1-3 max" (the user, 2026-08-31). Counted per circuit —
 * rejected demos included, since a rejected demo stays on record and the
 * sequence numbers are 1, 2, 3 by design.
 */
export const MAX_DEMOS_PER_CIRCUIT = 3;
