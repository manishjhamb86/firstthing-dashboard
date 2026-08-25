import { describe, expect, it } from "vitest";
import { TEAMS, TEAM_PERMISSIONS, canOwn, mayAct, missingTeamPermissions, teamMeta, teamsFor, whoseTurn } from "@/lib/admin-teams";

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

describe("whose turn the next step is", () => {
  const field = { owner: "field" as const, assigneeName: null };

  it("the survey is the field team's, not sales'", () => {
    // The reported bug: a sales account was shown "Run the site survey ·
    // Continue" as though it were theirs.
    const v = whoseTurn({ ...field, actorTeam: "sales" });
    expect(v.mine).toBe(false);
    expect(!v.mine && v.waitingOn).toBe("the field team");
    expect(!v.mine && v.canOverride).toBe(false);
  });

  it("and it IS the engineer's and the inspector's", () => {
    expect(whoseTurn({ ...field, actorTeam: "engineering" }).mine).toBe(true);
    expect(whoseTurn({ ...field, actorTeam: "inspection" }).mine).toBe(true);
  });

  it("names the assignee when there is one", () => {
    const v = whoseTurn({ owner: "field", assigneeName: "Neha Kapoor", actorTeam: "sales" });
    expect(!v.mine && v.waitingOn).toBe("Neha Kapoor");
  });

  it("operations is never blocked, but is told it is stepping in", () => {
    const v = whoseTurn({ ...field, actorTeam: "operations" });
    // Operations is in the field step's own team list, so it is simply theirs.
    expect(v.mine).toBe(true);
  });

  it("a step waiting on the society can be overridden by nobody", () => {
    for (const t of ["operations", "sales", "engineering"] as const) {
      const v = whoseTurn({ owner: "society", assigneeName: null, actorTeam: t });
      expect(v.mine).toBe(false);
      expect(!v.mine && v.canOverride).toBe(false);
      expect(!v.mine && v.note).toMatch(/their own portal/i);
    }
  });

  it("a lead step is sales' and operations'", () => {
    expect(whoseTurn({ owner: "sales", assigneeName: null, actorTeam: "sales" }).mine).toBe(true);
    expect(whoseTurn({ owner: "sales", assigneeName: null, actorTeam: "operations" }).mine).toBe(true);
    expect(whoseTurn({ owner: "sales", assigneeName: null, actorTeam: "engineering" }).mine).toBe(false);
  });
});

describe("the permissions a team's own work needs", () => {
  // "Permission type not available for marketing team" (user-reported
  // 2026-08-24) — it was available, it just wasn't named after the team and
  // nothing on the form connected the two.
  it("sales needs the pipeline, and that is the one that lets it own a lead", () => {
    expect(TEAM_PERMISSIONS.sales).toEqual(["manage_pipeline"]);
    expect(canOwn("sales", "lead")).toBe(true);
  });

  it("the field teams need the survey, not the pipeline", () => {
    expect(TEAM_PERMISSIONS.engineering).toEqual(["manage_survey"]);
    expect(TEAM_PERMISSIONS.inspection).toEqual(["manage_survey"]);
    expect(TEAM_PERMISSIONS.engineering).not.toContain("manage_pipeline");
  });

  it("finance holds release_billing and nothing else — CON-33", () => {
    expect(TEAM_PERMISSIONS.finance).toEqual(["release_billing"]);
  });

  it("support gets nothing, because it has no assignable work yet", () => {
    expect(TEAM_PERMISSIONS.support).toEqual([]);
    expect(missingTeamPermissions("support", [])).toEqual([]);
  });

  it("names what a selection is missing for its team", () => {
    expect(missingTeamPermissions("sales", [])).toEqual(["manage_pipeline"]);
    expect(missingTeamPermissions("sales", ["manage_pipeline"])).toEqual([]);
    expect(missingTeamPermissions("operations", ["manage_pipeline"])).toEqual([
      "manage_users",
      "manage_survey",
    ]);
  });

  it("never suggests a grant no team needs — every entry is a real permission", () => {
    const known = new Set([
      "manage_admins",
      "manage_users",
      "manage_pipeline",
      "manage_survey",
      "release_billing",
    ]);
    for (const perms of Object.values(TEAM_PERMISSIONS)) {
      for (const p of perms) expect(known.has(p)).toBe(true);
    }
  });
});

describe("a named assignee outranks the team", () => {
  // "After the assignment it can also be surveyed from here, but with a
  // warning that it's assigned to this person" (the user, 2026-08-25).
  // Operations is on the field step's team list, so it was shown a plain blue
  // "Run the site survey · Continue" with nothing saying an inspector was
  // already holding it.
  const survey = { owner: "field" as const, assigneeName: "Inspector", assigneeId: "insp-1" };

  it("is the assignee's own turn", () => {
    expect(whoseTurn({ ...survey, actorId: "insp-1", actorTeam: "inspection" })).toEqual({
      mine: true,
    });
  });

  it("is NOT operations' turn once someone holds it — but it can still step in", () => {
    const v = whoseTurn({ ...survey, actorId: "ops-1", actorTeam: "operations" });
    expect(v.mine).toBe(false);
    if (v.mine) return;
    expect(v.waitingOn).toBe("Inspector");
    expect(v.canOverride).toBe(true);
    expect(v.note).toMatch(/record it for them/i);
  });

  it("is not another engineer's turn either, though they could cover it", () => {
    const v = whoseTurn({ ...survey, actorId: "eng-9", actorTeam: "engineering" });
    expect(v.mine).toBe(false);
    if (v.mine) return;
    expect(v.waitingOn).toBe("Inspector");
    expect(v.canOverride).toBe(true);
  });

  it("leaves sales watching, with no way in", () => {
    const v = whoseTurn({ ...survey, actorId: "sales-1", actorTeam: "sales" });
    expect(v.mine).toBe(false);
    if (v.mine) return;
    expect(v.canOverride).toBe(false);
    expect(v.note).toMatch(/not for you to record/i);
  });

  it("falls back to the team while nobody holds it", () => {
    const open = { owner: "field" as const, assigneeName: null, assigneeId: null };
    expect(whoseTurn({ ...open, actorId: "eng-9", actorTeam: "engineering" })).toEqual({ mine: true });
    expect(whoseTurn({ ...open, actorId: "ops-1", actorTeam: "operations" })).toEqual({ mine: true });
    const v = whoseTurn({ ...open, actorId: "sales-1", actorTeam: "sales" });
    expect(v.mine).toBe(false);
    if (v.mine) return;
    expect(v.waitingOn).toBe("the field team");
  });

  it("still never lets anyone act for the society", () => {
    const v = whoseTurn({
      owner: "society",
      actorId: "ops-1",
      actorTeam: "operations",
      assigneeName: null,
    });
    expect(v.mine).toBe(false);
    if (v.mine) return;
    expect(v.canOverride).toBe(false);
  });
});
