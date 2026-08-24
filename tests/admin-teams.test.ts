import { describe, expect, it } from "vitest";
import { TEAMS, canOwn, mayAct, teamMeta, teamsFor } from "@/lib/admin-teams";

describe("teams are the blueprint's personas, not a new vocabulary", () => {
  it("names a persona for every team", () => {
    expect(TEAMS.every((t) => /^PER-\d\d$/.test(t.persona))).toBe(true);
  });

  it("rejects an unknown team rather than guessing", () => {
    expect(() => teamMeta("marketing" as never)).toThrow();
  });
});

describe("who may be handed which work", () => {
  it("a lead goes to admin or sales, and nobody else", () => {
    expect(teamsFor("lead").sort()).toEqual(["operations", "sales"]);
    expect(canOwn("sales", "lead")).toBe(true);
    expect(canOwn("operations", "lead")).toBe(true);
    // The engineer who runs the demo is not the person who owns the lead.
    expect(canOwn("engineering", "lead")).toBe(false);
    expect(canOwn("inspection", "lead")).toBe(false);
    expect(canOwn("finance", "lead")).toBe(false);
    expect(canOwn("support", "lead")).toBe(false);
  });

  it("a survey goes to the field, not to sales", () => {
    expect(canOwn("engineering", "survey")).toBe(true);
    expect(canOwn("inspection", "survey")).toBe(true);
    expect(canOwn("operations", "survey")).toBe(true);
    expect(canOwn("sales", "survey")).toBe(false);
  });

  it("operations can own everything", () => {
    for (const kind of ["lead", "survey", "inspection"] as const) {
      expect(canOwn("operations", kind)).toBe(true);
    }
  });
});

describe("who may update a record assigned to someone else", () => {
  const owner = { actorId: "u-owner", actorTeam: "sales" as const, ownerId: "u-owner", creatorId: "u-creator" };

  it("the assignee acts with no caveat", () => {
    const r = mayAct(owner);
    expect(r.allowed).toBe(true);
    expect(r.allowed && r.onBehalf).toBe(false);
  });

  it("the creator may still update it, on the assignee's behalf", () => {
    // The reported bug: logging a lead for someone else locked the creator
    // out of the record they had just made.
    const r = mayAct({ ...owner, actorId: "u-creator", actorTeam: "sales" });
    expect(r.allowed).toBe(true);
    expect(r.allowed && r.onBehalf).toBe(true);
  });

  it("operations is never blocked", () => {
    const r = mayAct({ ...owner, actorId: "u-ops", actorTeam: "operations" });
    expect(r.allowed).toBe(true);
    expect(r.allowed && r.onBehalf).toBe(true);
  });

  it("an unrelated account is refused", () => {
    const r = mayAct({ ...owner, actorId: "u-other", actorTeam: "sales" });
    expect(r.allowed).toBe(false);
  });

  it("being the assignee outranks being operations — no spurious warning", () => {
    // An ops lead who owns the lead themselves is not acting "on behalf" of
    // anyone, and should not be warned as though they were.
    const r = mayAct({ actorId: "u-ops", actorTeam: "operations", ownerId: "u-ops", creatorId: "u-ops" });
    expect(r.allowed && r.onBehalf).toBe(false);
  });

  it("an unassigned record is not owned by whoever asks", () => {
    const r = mayAct({ actorId: "u-x", actorTeam: "sales", ownerId: null, creatorId: null });
    expect(r.allowed).toBe(false);
  });
});
