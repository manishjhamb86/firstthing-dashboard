import { describe, expect, it } from "vitest";
import { appliedReason, decideApproval, refuseRaise, refuseRejection, refuseWithdrawal } from "@/lib/date-change-request";
import { encodeValue, parseValue, valueLabel } from "@/lib/timeline-fields";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe("refuseRaise", () => {
  const base = { reason: "Assigned in March", fromValue: "2026-09-26", toValue: "2025-03-15", open: null, liveApplicable: true };
  it("accepts a reasoned change", () => expect(refuseRaise(base)).toBeNull());
  it("needs a reason", () => expect(refuseRaise({ ...base, reason: "  " })).toMatch(/Say why/));
  it("refuses a no-op", () => expect(refuseRaise({ ...base, toValue: "2026-09-26" })).toMatch(/already on record/));
  it("refuses a second open request on the same date, naming the first", () => {
    expect(refuseRaise({ ...base, open: { requestedByName: "Yogendra", toLabel: "15-03-2025" } })).toMatch(/already waiting \(Yogendra, to 15-03-2025\)/);
  });
  it("refuses a date that is fixed after go-live", () => expect(refuseRaise({ ...base, liveApplicable: false })).toMatch(/only before go-live/));
});

describe("decideApproval", () => {
  const base = { status: "pending" as const, requesterId: "a", approverId: "b", canApprove: true, fromValue: "2026-09-26", currentValue: "2026-09-26" };
  it("applies a fresh request decided by someone else", () => expect(decideApproval(base)).toEqual({ action: "apply" }));
  it("refuses self-approval", () => expect(decideApproval({ ...base, approverId: "a" })).toMatchObject({ action: "refuse", log: "self_approval" }));
  it("refuses without the permission", () => expect(decideApproval({ ...base, canApprove: false })).toMatchObject({ action: "refuse", log: "no_permission" }));
  it("refuses a decided request", () => expect(decideApproval({ ...base, status: "approved" })).toMatchObject({ action: "refuse", log: "not_pending" }));
  it("supersedes when the date moved underneath the request", () => {
    expect(decideApproval({ ...base, currentValue: "2025-03-15" }).action).toBe("supersede");
    expect(decideApproval({ ...base, currentValue: null }).action).toBe("supersede");
  });
});

describe("refuseRejection / refuseWithdrawal", () => {
  it("rejection needs a note, the permission, and someone else", () => {
    const base = { status: "pending" as const, requesterId: "a", approverId: "b", canApprove: true, note: "Wrong day" };
    expect(refuseRejection(base)).toBeNull();
    expect(refuseRejection({ ...base, note: "" })).toMatch(/Say why/);
    expect(refuseRejection({ ...base, approverId: "a" })).toMatch(/withdraw it instead/);
    expect(refuseRejection({ ...base, canApprove: false })).toMatch(/permission/);
  });
  it("only the requester withdraws, and only while pending", () => {
    expect(refuseWithdrawal({ status: "pending", requesterId: "a", actorId: "a" })).toBeNull();
    expect(refuseWithdrawal({ status: "pending", requesterId: "a", actorId: "b" })).toMatch(/Only the person/);
    expect(refuseWithdrawal({ status: "rejected", requesterId: "a", actorId: "a" })).toMatch(/already been decided/);
  });
  it("the applied reason names the request and the approver", () => {
    expect(appliedReason("req1", " typo ", "Asha")).toBe("Change request req1, accepted by Asha: typo");
  });
});

describe("timeline values", () => {
  it("round-trips a day and a period", () => {
    expect(encodeValue(d("2025-03-04"))).toBe("2025-03-04");
    expect(encodeValue(d("2025-03-04"), d("2025-03-09"))).toBe("2025-03-04/2025-03-09");
    expect(encodeValue(d("2025-03-04"), null)).toBeNull();
    expect(parseValue("2025-03-04/2025-03-09", true)).toEqual({ from: d("2025-03-04"), to: d("2025-03-09") });
  });
  it("refuses malformed and impossible dates", () => {
    expect(parseValue("2025-02-31", false)).toBeNull();
    expect(parseValue("2025-03-04", true)).toBeNull();
    expect(parseValue("2025-03-04/2025-03-09", false)).toBeNull();
    expect(parseValue("04-03-2025", false)).toBeNull();
  });
  it("reads DD-MM-YYYY", () => {
    expect(valueLabel("2025-03-04/2025-03-09")).toBe("04-Mar-2025 → 09-Mar-2025");
    expect(valueLabel(null)).toBe("No date");
  });
});
