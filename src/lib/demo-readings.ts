// DEMO_MODE — synthesise a plausible day series for a circuit's current
// reading step, so the whole deal flow can be walked without hand-authoring
// a meter export ("upload feature can be tested later. once the full flow is
// validated and finalized" — the user, 2026-08-20).
//
// Two rules shape everything here:
//
//  1. It emits a REAL SONOFF-format CSV, and the rest of the flow is the
//     untouched upload path — same signature match, same day derivation,
//     same review table, same commit. A demo shortcut that wrote readings
//     directly would validate a code path nobody ships, which is the
//     opposite of what a demo is for.
//  2. Nothing here is random. A demo that produces different numbers on
//     every click cannot be checked against an expected figure, by a test
//     or by the person walking the flow.

import { addDays, utcMidnight, type UploadKind } from "./circuit-load";

export const DEMO_DEFAULT_DAYS = 7;
export const DEMO_MAX_DAYS = 40;
/** Comfortably inside CON-20's 60–80% band, so a straight walk-through confirms. */
export const DEMO_DEFAULT_SAVINGS_PCT = 68;
/** SONOFF exports are hourly; a day is 24 intervals or it is a partial day. */
export const HOURS_PER_DAY = 24;

/**
 * Per-day variation, in percent, cycled by day offset. Small enough that a
 * pre-install day stays inside ±5% of theoretical and a post-install day
 * stays inside the savings band it was aimed at — the demo should walk
 * cleanly by default, and a value can be edited to force a band.
 */
const JITTER_PCT = [0, 1.8, -1.4, 0.9, -2.1, 1.2, -0.7, 2.4, -1.9, 0.4];

export type DemoDay = { date: Date; kWh: number };

/**
 * Snap a day total to something 24 equal hourly cells can express exactly,
 * so the number reviewed is the number the parser produces back out of the
 * generated file rather than one off by a rounding tail.
 */
export function snapToHourly(kWh: number): number {
  const perHour = Math.round((kWh / HOURS_PER_DAY) * 10_000) / 10_000;
  return perHour * HOURS_PER_DAY;
}

/**
 * The anchor each generated day varies around:
 *   - pre-install  → the load inventory's theoretical figure, because that
 *     is exactly what the pre-install window is checking the meter against.
 *   - post/monitoring → the baseline discounted by the target savings.
 */
export function demoAnchorKwh(args: {
  kind: UploadKind;
  theoretical: number | null;
  baseline: number | null;
  savingsPct: number;
}): { kWh: number } | { error: string } {
  if (args.kind === "pre_install") {
    if (args.theoretical === null || args.theoretical <= 0) {
      return {
        error:
          "Record the load inventory first — the demo generates pre-installation days around the circuit's theoretical figure, and there isn't one yet.",
      };
    }
    return { kWh: args.theoretical };
  }
  if (args.baseline === null || args.baseline <= 0) {
    return {
      error:
        "There's no pre-installation baseline yet — post-installation days are generated as a savings percentage of it. Complete the baseline step first.",
    };
  }
  return { kWh: args.baseline * (1 - args.savingsPct / 100) };
}

/**
 * The days to offer. Generation starts after the last day already stored
 * inside the window, so clicking twice extends the series instead of
 * producing rows the review will show as already-in-system.
 */
export function draftDemoDays(args: {
  window: { from: Date; to: Date };
  lastStoredInWindow: Date | null;
  days: number;
  anchorKwh: number;
}): DemoDay[] {
  const start =
    args.lastStoredInWindow === null
      ? utcMidnight(args.window.from)
      : new Date(
          Math.max(
            utcMidnight(args.window.from).getTime(),
            addDays(args.lastStoredInWindow, 1).getTime(),
          ),
        );
  const count = Math.max(1, Math.min(args.days, DEMO_MAX_DAYS));
  const out: DemoDay[] = [];
  for (let i = 0; i < count; i++) {
    const date = addDays(start, i);
    if (date.getTime() > utcMidnight(args.window.to).getTime()) break;
    const jitter = JITTER_PCT[i % JITTER_PCT.length];
    out.push({ date, kWh: snapToHourly(args.anchorKwh * (1 + jitter / 100)) });
  }
  return out;
}

function hourLabel(h: number): string {
  // SONOFF's last slot of a day is "23:00-24:00", not "23:00-00:00".
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:00-${pad(h + 1)}:00`;
}

/**
 * A byte-for-byte SONOFF export of these days — BOM, the vendor's own
 * `data,time,consumption/KWh` header (note "data", not "date"), hourly
 * interval values. It has to match the signature exactly, because the
 * ingest path recognises the file rather than being told what it is.
 *
 * The profile is deliberately flat across the 24 hours: a demo file should
 * be obviously synthetic, and an invented load curve would be a fiction the
 * reports would then present as measured shape.
 */
export function buildSonoffCsv(days: DemoDay[]): string {
  const lines = ["﻿data,time,consumption/KWh"];
  for (const day of days) {
    const iso = day.date.toISOString().slice(0, 10);
    const perHour = (day.kWh / HOURS_PER_DAY).toFixed(4);
    for (let h = 0; h < HOURS_PER_DAY; h++) {
      lines.push(`${iso},${hourLabel(h)},${perHour}`);
    }
  }
  return lines.join("\n") + "\n";
}
