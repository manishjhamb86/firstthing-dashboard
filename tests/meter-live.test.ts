import { describe, it, expect } from "vitest";
import {
  shouldReadLive,
  freshnessLabel,
  isStale,
  minIntervalFor,
  STALE_AFTER_MS,
  LIVE_FRESH_MS,
  PORTAL_MIN_INTERVAL_MS,
} from "@/lib/meter-live";

const NOW = new Date("2026-08-28T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);

describe("shouldReadLive", () => {
  it("always reads a meter never read before", () => {
    expect(shouldReadLive({ lastReadAt: null, surface: "admin", now: NOW })).toBe(true);
    expect(shouldReadLive({ lastReadAt: null, surface: "portal", now: NOW })).toBe(true);
  });

  it("does not spend a call on a reading taken seconds ago", () => {
    expect(shouldReadLive({ lastReadAt: ago(5_000), surface: "admin", now: NOW })).toBe(false);
  });

  it("holds the portal to a longer floor than the back office", () => {
    const twoMinutes = ago(2 * 60 * 1000);
    expect(shouldReadLive({ lastReadAt: twoMinutes, surface: "admin", now: NOW })).toBe(true);
    expect(shouldReadLive({ lastReadAt: twoMinutes, surface: "portal", now: NOW })).toBe(false);
    expect(minIntervalFor("portal")).toBeGreaterThan(minIntervalFor("admin"));
    expect(minIntervalFor("admin")).toBe(LIVE_FRESH_MS);
    expect(minIntervalFor("portal")).toBe(PORTAL_MIN_INTERVAL_MS);
  });

  it("reads again once the floor has passed", () => {
    expect(shouldReadLive({ lastReadAt: ago(PORTAL_MIN_INTERVAL_MS), surface: "portal", now: NOW })).toBe(true);
  });
});

describe("freshnessLabel", () => {
  it("says how old a figure is, in the reader's terms", () => {
    expect(freshnessLabel(ago(3_000), NOW)).toBe("just now");
    expect(freshnessLabel(ago(7 * 60_000), NOW)).toBe("7 min ago");
    expect(freshnessLabel(ago(3 * 3_600_000 + 5 * 60_000), NOW)).toBe("3h 5m ago");
    expect(freshnessLabel(ago(50 * 3_600_000), NOW)).toBe("2 days ago");
  });

  it("says a meter has never been read rather than implying zero", () => {
    expect(freshnessLabel(null, NOW)).toBe("never read");
  });
});

describe("isStale", () => {
  it("does not call a healthy hourly reading stale — the cry-wolf bug", () => {
    // The poll runs once an hour, so these are what a working meter looks
    // like. Warning on them would fire for most of every hour.
    expect(isStale(ago(16 * 60_000), NOW)).toBe(false);
    expect(isStale(ago(55 * 60_000), NOW)).toBe(false);
  });

  it("calls it stale once a scheduled read has actually been missed", () => {
    expect(isStale(ago(91 * 60_000), NOW)).toBe(true);
    expect(isStale(ago(5 * 3_600_000), NOW)).toBe(true);
  });

  it("treats a meter never read as stale rather than as current", () => {
    expect(isStale(null, NOW)).toBe(true);
  });

  it("is looser than the read interval, so a poll cannot make its own figure stale", () => {
    expect(STALE_AFTER_MS).toBeGreaterThan(60 * 60 * 1000);
  });
});
