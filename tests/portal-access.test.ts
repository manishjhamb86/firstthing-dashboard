import { describe, expect, it } from "vitest";
import {
  ALL_PORTAL_GRANTS,
  checkGrantEdit,
  effectiveGrants,
  hasGrant,
  sanitizeGrants,
} from "@/lib/portal-access";

describe("effectiveGrants", () => {
  it("the office-bearer holds every grant, whatever the row stores", () => {
    const g = effectiveGrants("office_bearer", []);
    for (const grant of ALL_PORTAL_GRANTS) expect(g.has(grant)).toBe(true);
  });

  it("a committee member holds exactly what was granted", () => {
    const g = effectiveGrants("committee", ["water_tanks"]);
    expect(g.has("water_tanks")).toBe(true);
    expect(g.has("electricity")).toBe(false);
    expect(g.has("documents")).toBe(false);
    expect(g.has("society_admin")).toBe(false);
  });

  it("tickets_manage implies tickets_view", () => {
    const g = effectiveGrants("manager", ["tickets_manage"]);
    expect(g.has("tickets_view")).toBe(true);
  });

  it("tickets_view alone does not imply manage", () => {
    const g = effectiveGrants("committee", ["tickets_view"]);
    expect(g.has("tickets_manage")).toBe(false);
  });

  it("an empty grant set sees no modules", () => {
    expect(effectiveGrants("committee", []).size).toBe(0);
  });
});

describe("hasGrant", () => {
  it("reads through the same implication rules", () => {
    expect(hasGrant({ role: "committee", grants: ["tickets_manage"] }, "tickets_view")).toBe(true);
    expect(hasGrant({ role: "committee", grants: [] }, "electricity")).toBe(false);
    expect(hasGrant({ role: "office_bearer", grants: [] }, "society_admin")).toBe(true);
  });
});

describe("checkGrantEdit", () => {
  const ob = { id: "p1", role: "office_bearer" as const, societyId: "s1" };
  const member = { id: "p2", societyId: "s1", portalAuthority: "committee" as const };

  it("the office-bearer edits a member of their own society", () => {
    expect(checkGrantEdit(ob, member)).toEqual({ ok: true });
  });

  it("a committee member cannot edit grants, even with society_admin", () => {
    const r = checkGrantEdit({ id: "p3", role: "committee", societyId: "s1" }, member);
    expect(r.ok).toBe(false);
  });

  it("INV-05: a target from another society is refused whatever the actor holds", () => {
    const r = checkGrantEdit(ob, { id: "px", societyId: "s2", portalAuthority: "committee" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/your society/);
  });

  it("the office-bearer's own grants are not editable — the designation moves by transfer", () => {
    const r = checkGrantEdit(ob, { id: "p1", societyId: "s1", portalAuthority: "office_bearer" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/transfer/);
  });

  it("an account with no portal authority is not a member to grant to", () => {
    expect(checkGrantEdit(ob, { id: "p9", societyId: "s1", portalAuthority: null }).ok).toBe(false);
  });
});

describe("sanitizeGrants", () => {
  it("passes real grants through, deduplicated", () => {
    expect(sanitizeGrants(["electricity", "electricity", "documents"])).toEqual([
      "electricity",
      "documents",
    ]);
  });

  it("refuses a smuggled value outright rather than dropping it", () => {
    expect(sanitizeGrants(["electricity", "admin_everything"])).toBeNull();
  });
});
