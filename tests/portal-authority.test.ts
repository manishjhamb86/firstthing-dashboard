import { describe, expect, it } from "vitest";
import { checkOfficeBearerTransfer } from "@/lib/portal-authority";

// First slice of NFR-05's tenancy-scoping suite (docs/backlog.yaml MS-02
// exit criteria) plus GATE-04's binding-act check — both against the same
// pure authorization function src/app/portal/actions.ts actually calls, so
// this exercises the real decision logic, not a re-implementation of it.

const officeBearer = { id: "actor-1", role: "office_bearer", societyId: "society-a" };
const committee = { id: "actor-2", role: "committee", societyId: "society-a" };

const targetSameSociety = { id: "target-1", societyId: "society-a", isActive: true };
const targetForeignSociety = { id: "target-2", societyId: "society-b", isActive: true };
const targetInactive = { id: "target-3", societyId: "society-a", isActive: false };

describe("GATE-04: binding-act role check", () => {
  it("allows an office-bearer to transfer within their own society", () => {
    const result = checkOfficeBearerTransfer(officeBearer, targetSameSociety);
    expect(result.ok).toBe(true);
  });

  it("refuses a committee account server-side, not just by hiding the UI (FEAT-108-AC-2)", () => {
    const result = checkOfficeBearerTransfer(committee, targetSameSociety);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_office_bearer");
  });

  it("refuses a manager account the same way", () => {
    const result = checkOfficeBearerTransfer(
      { id: "actor-3", role: "manager", societyId: "society-a" },
      targetSameSociety,
    );
    expect(result.ok).toBe(false);
  });

  it("refuses transferring to oneself", () => {
    const result = checkOfficeBearerTransfer(officeBearer, {
      id: officeBearer.id,
      societyId: "society-a",
      isActive: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("already_holder");
  });
});

describe("NFR-05 (first slice): tenancy isolation on the binding act", () => {
  it("refuses a target from a foreign societyId (0 cross-tenant writes)", () => {
    const result = checkOfficeBearerTransfer(officeBearer, targetForeignSociety);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("cross_tenant_or_missing");
  });

  it("refuses a missing target rather than defaulting to allow", () => {
    const result = checkOfficeBearerTransfer(officeBearer, null);
    expect(result.ok).toBe(false);
  });

  it("refuses an inactive target in the same society", () => {
    const result = checkOfficeBearerTransfer(officeBearer, targetInactive);
    expect(result.ok).toBe(false);
  });

  it("refuses an actor with no societyId at all", () => {
    const result = checkOfficeBearerTransfer(
      { id: "actor-4", role: "office_bearer", societyId: null },
      targetSameSociety,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("no_society");
  });
});
