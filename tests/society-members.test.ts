import { describe, expect, it } from "vitest";
import { formatMobile, normaliseMobile, positionKey, refuseEnd, refuseMember, temporaryPassword } from "@/lib/society-members";

describe("normaliseMobile", () => {
  it("strips the country code, a leading zero and spacing", () => {
    for (const m of ["+91 98110 22159", "098110-22159", "9811022159", "919811022159", "0091 9811022159"]) expect(normaliseMobile(m)).toBe("9811022159");
  });
  it("refuses what is not an Indian mobile", () => {
    for (const m of ["12345", "5811022159", "98110221590", "abc"]) expect(normaliseMobile(m)).toBeNull();
  });
  it("reads back as 5+5", () => expect(formatMobile("9811022159")).toBe("98110 22159"));
});

describe("refuseMember", () => {
  const ok = { name: "Asha Rao", mobile: "9811022159", email: "", positionId: "pos-treasurer", newPosition: "" };
  it("accepts a member without an email", () => expect(refuseMember(ok)).toBeNull());
  it("needs a name, a valid mobile and a position", () => {
    expect(refuseMember({ ...ok, name: " " })).toMatch(/name/);
    expect(refuseMember({ ...ok, mobile: "123" })).toMatch(/not a 10-digit/);
    expect(refuseMember({ ...ok, positionId: "", newPosition: "" })).toMatch(/position/);
    expect(refuseMember({ ...ok, positionId: "", newPosition: "Garden in-charge" })).toBeNull();
    expect(refuseMember({ ...ok, email: "not-an-email" })).toMatch(/email/);
  });
});

describe("positionKey", () => {
  it("treats case and spacing as one position", () => expect(positionKey(" Vice-President ")).toBe(positionKey("vice president")));
});

describe("refuseEnd", () => {
  const now = new Date("2026-09-25T10:00:00Z");
  it("needs a date not in the future, not before they started, and a reason", () => {
    expect(refuseEnd({ endedOn: "2026-09-30", reason: "x", startedOn: null, now })).toMatch(/future/);
    expect(refuseEnd({ endedOn: "2025-01-01", reason: "x", startedOn: new Date("2025-06-01T00:00:00Z"), now })).toMatch(/before they started/);
    expect(refuseEnd({ endedOn: "2026-09-01", reason: " ", startedOn: null, now })).toMatch(/why/);
    expect(refuseEnd({ endedOn: "2026-09-01", reason: "Term ended", startedOn: null, now })).toBeNull();
  });
});

it("temporary password is readable and long enough", () => {
  expect(temporaryPassword(() => 0.5).length).toBeGreaterThanOrEqual(8);
});
