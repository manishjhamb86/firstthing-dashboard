import { describe, expect, it } from "vitest";
import { checkNewDeal, dealLabel } from "@/lib/deal-scope";

// CON-24 as amended (2026-08-31): a service line is delivered in parts, each
// part its own deal. These are the refusals that keep two parts tellable
// apart — and solar/wastewater one deal at a time.
describe("checkNewDeal", () => {
  it("a line's first deal needs no scope", () => {
    const r = checkNewDeal({ serviceLine: "lighting", dealScope: undefined, openDeals: [] });
    expect(r).toEqual({ ok: true, dealScope: null });
  });

  it("a first deal may still carry a scope", () => {
    const r = checkNewDeal({ serviceLine: "lighting", dealScope: " Basement  B1 ", openDeals: [] });
    expect(r).toEqual({ ok: true, dealScope: "Basement B1" });
  });

  it("a second deal on the line must be named", () => {
    const r = checkNewDeal({
      serviceLine: "lighting",
      dealScope: "",
      openDeals: [{ id: "p1", dealScope: "Basement B1" }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/name which part/i);
  });

  it("a second deal is refused while the FIRST open deal is unnamed", () => {
    // Two deals a screen can only label "Lighting" and "Lighting — X" leave
    // the first one ambiguous everywhere it appears without its sibling.
    const r = checkNewDeal({
      serviceLine: "lighting",
      dealScope: "Stilt parking",
      openDeals: [{ id: "p1", dealScope: null }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/no part name yet/i);
  });

  it("a duplicate scope is refused, case- and whitespace-insensitively", () => {
    const r = checkNewDeal({
      serviceLine: "lighting",
      dealScope: "basement  b1",
      openDeals: [{ id: "p1", dealScope: "Basement B1" }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/already covers "Basement B1"/);
  });

  it("a genuinely different part is allowed", () => {
    const r = checkNewDeal({
      serviceLine: "lighting",
      dealScope: "Lift lobby — Towers 1–4",
      openDeals: [
        { id: "p1", dealScope: "Basement B1" },
        { id: "p2", dealScope: "Street lights" },
      ],
    });
    expect(r).toEqual({ ok: true, dealScope: "Lift lobby — Towers 1–4" });
  });

  it("water follows the same part rules as lighting", () => {
    const r = checkNewDeal({
      serviceLine: "pumps",
      dealScope: "Motor automation",
      openDeals: [{ id: "p1", dealScope: "Tank monitoring only" }],
    });
    expect(r.ok).toBe(true);
  });

  it("solar is one open deal at a time, whatever the new one is named", () => {
    const r = checkNewDeal({
      serviceLine: "solar",
      dealScope: "Phase 2",
      openDeals: [{ id: "p1", dealScope: null }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/one deal at a time/i);
  });

  it("wastewater too", () => {
    const r = checkNewDeal({ serviceLine: "wastewater", dealScope: undefined, openDeals: [{ id: "p1", dealScope: null }] });
    expect(r.ok).toBe(false);
  });

  it("a closed-lost deal frees the line — the caller passes only OPEN deals", () => {
    // Documented as the contract of the input rather than re-filtered here.
    const r = checkNewDeal({ serviceLine: "solar", dealScope: undefined, openDeals: [] });
    expect(r.ok).toBe(true);
  });
});

describe("dealLabel", () => {
  it("names the part when there is one", () => {
    expect(dealLabel("lighting", "Basement B1")).toBe("Lighting — Basement B1");
  });
  it("falls back to the line for a sole deal", () => {
    expect(dealLabel("lighting", null)).toBe("Lighting");
    expect(dealLabel("pumps", "  ")).toBe("Water pumps");
  });
});
