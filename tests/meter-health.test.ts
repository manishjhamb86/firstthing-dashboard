import { describe, it, expect } from "vitest";
import { evaluateMeterHealth, outageMessage, outageMinutes, SILENT_AFTER_MS } from "@/lib/meter-health";

const now = new Date("2026-08-26T10:00:00.000Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

describe("meter health", () => {
  it("a connected meter that just reported is reporting", () => {
    const h = evaluateMeterHealth({ online: true, reportedAt: ago(60_000), offlineSince: null, now });
    expect(h.state).toBe("reporting");
    expect(h.offlineSince).toBeNull();
  });

  // The distinction the tank work had to learn: connected is not reporting.
  it("a connected meter that has said nothing for hours is SILENT, not healthy", () => {
    const h = evaluateMeterHealth({ online: true, reportedAt: ago(SILENT_AFTER_MS + 1000), offlineSince: null, now });
    expect(h.state).toBe("silent");
    expect(h.offlineSince).toEqual(now);
    expect(h.becameUnhealthy).toBe(true);
  });

  it("an unreachable meter is offline whatever it last reported", () => {
    const h = evaluateMeterHealth({ online: false, reportedAt: ago(1000), offlineSince: null, now });
    expect(h.state).toBe("offline");
  });

  it("a meter that has never reported is not treated as fresh", () => {
    expect(evaluateMeterHealth({ online: true, reportedAt: null, offlineSince: null, now }).state).toBe("silent");
  });

  // The one that matters for the person being chased: "down since 09:00" is
  // the fact they act on, and restamping it hourly would erase it.
  it("keeps the original start time across a run of bad polls", () => {
    const started = ago(5 * 60 * 60 * 1000);
    const h = evaluateMeterHealth({ online: false, reportedAt: null, offlineSince: started, now });
    expect(h.offlineSince).toEqual(started);
    expect(h.becameUnhealthy).toBe(false); // already alerted — do not alert again
  });

  it("reports the transition once, and the recovery once", () => {
    const down = evaluateMeterHealth({ online: false, reportedAt: null, offlineSince: null, now });
    expect(down.becameUnhealthy).toBe(true);
    const stillDown = evaluateMeterHealth({ online: false, reportedAt: null, offlineSince: now, now });
    expect(stillDown.becameUnhealthy).toBe(false);
    const back = evaluateMeterHealth({ online: true, reportedAt: now, offlineSince: ago(9e6), now });
    expect(back.recovered).toBe(true);
    expect(back.offlineSince).toBeNull();
    const stillUp = evaluateMeterHealth({ online: true, reportedAt: now, offlineSince: null, now });
    expect(stillUp.recovered).toBe(false);
  });

  it("measures the outage in whole minutes, never negative", () => {
    expect(outageMinutes(ago(90 * 60 * 1000), now)).toBe(90);
    expect(outageMinutes(new Date(now.getTime() + 5000), now)).toBe(0);
    expect(outageMinutes(null, now)).toBeNull();
  });

  it("names the meter, what it measures and how long — not just 'a meter is offline'", () => {
    expect(
      outageMessage({
        meterName: "Block A meter",
        circuitLabel: "Basement · Tube",
        societyName: "RG Residency",
        state: "offline",
        minutes: 135,
      }),
    ).toBe("Block A meter on Basement · Tube (RG Residency) is not reachable — 2h 15m now.");
  });

  it("says silent differently from unreachable, because the fix differs", () => {
    const m = outageMessage({ meterName: "M", circuitLabel: null, societyName: null, state: "silent", minutes: 30 });
    expect(m).toMatch(/connected but has stopped reporting/);
    expect(m).toMatch(/30 minutes/);
  });
});
