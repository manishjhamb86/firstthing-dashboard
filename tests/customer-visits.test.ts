import { describe, expect, it } from "vitest";
import { daysLeftInMonth, distanceMetres, isVisitLate, locationWords, monthVisitState, refuseReview, refuseVisit } from "@/lib/customer-visits";

const now = new Date("2026-11-18T12:00:00Z");
const ok = { societyId: "s", visitedAt: new Date("2026-11-18T10:00:00Z"), purpose: "feedback_upsell" as const, agenda: "Monthly feedback", outcome: "Happy with savings", rating: 4, interests: ["pump_automation"], photoKeys: [] };

describe("customer visits — the month's required visit", () => {
  it("counts only an approved feedback visit", () => {
    expect(monthVisitState([{ purpose: "complaint_followup", status: "approved", voided: false }])).toBe("missing");
    expect(monthVisitState([{ purpose: "feedback_upsell", status: "pending", voided: false }])).toBe("pending");
    expect(monthVisitState([{ purpose: "feedback_upsell", status: "sent_back", voided: false }, { purpose: "feedback_upsell", status: "approved", voided: false }])).toBe("approved");
    expect(monthVisitState([{ purpose: "feedback_upsell", status: "approved", voided: true }])).toBe("missing");
  });
  it("is late only in the month's last 7 days", () => {
    expect(daysLeftInMonth("2026-11-18")).toBe(13);
    expect(isVisitLate("missing", "2026-11-18")).toBe(false);
    expect(isVisitLate("missing", "2026-11-24")).toBe(true);
    expect(isVisitLate("pending", "2026-11-30")).toBe(true);
    expect(isVisitLate("approved", "2026-11-30")).toBe(false);
  });
});

describe("customer visits — logging and approving", () => {
  it("accepts a complete feedback visit and refuses gaps", () => {
    expect(refuseVisit(ok, now)).toBeNull();
    expect(refuseVisit({ ...ok, agenda: "" }, now)).toMatch(/agenda/);
    expect(refuseVisit({ ...ok, rating: null }, now)).toMatch(/1 to 5/);
    expect(refuseVisit({ ...ok, purpose: "complaint_followup", rating: 3 }, now)).toMatch(/only on a feedback/);
    expect(refuseVisit({ ...ok, visitedAt: new Date("2026-11-19T10:00:00Z") }, now)).toMatch(/before it happens/);
  });
  it("never lets anyone approve their own visit", () => {
    const base = { actorId: "a", loggedById: "b", canApprove: true, status: "pending" as const, voided: false };
    expect(refuseReview(base)).toBeNull();
    expect(refuseReview({ ...base, loggedById: "a" })).toMatch(/Someone else/);
    expect(refuseReview({ ...base, canApprove: false })).toMatch(/permission/);
    expect(refuseReview({ ...base, status: "approved" })).toMatch(/already approved/);
  });
  it("measures distance and words it", () => {
    const d = distanceMetres({ lat: 28.5355, lng: 77.391 }, { lat: 28.5365, lng: 77.391 });
    expect(Math.round(d)).toBe(111);
    expect(locationWords(d, true).atSociety).toBe(true);
    expect(locationWords(4200, true).text).toBe("4.2 km from the society");
    expect(locationWords(null, false).text).toBe("Location not shared");
  });
});
