import { describe, expect, it } from "vitest";
import { assignmentMessage, meterAlertMessage, shouldNotifyAssignee } from "@/lib/push-messages";

describe("push messages (19-field-app.md §18)", () => {
  it("names the work, when it is due and who assigned it, and opens its field page", () => {
    const m = assignmentMessage({ kind: "survey", what: "Ace City", when: "02-10-2026 10:30", by: "Ops Lead", url: "/field/survey/p1", ref: "p1" });
    expect(m).toEqual({ title: "New survey for you", body: "Ace City · 02-10-2026 10:30 · from Ops Lead", url: "/field/survey/p1", tag: "assign:survey:p1" });
  });
  it("leaves out what is not known yet", () => {
    expect(assignmentMessage({ kind: "replacement", what: "Ace City — Basement", url: "/field/demo/d1", ref: "d1" }).body).toBe("Ace City — Basement");
  });
  it("a re-assignment replaces its own notification (same tag)", () => {
    const a = assignmentMessage({ kind: "task", what: "A", url: "/admin/tasks", ref: "t1" });
    const b = assignmentMessage({ kind: "task", what: "B", url: "/admin/tasks", ref: "t1" });
    expect(a.tag).toBe(b.tag);
  });
  it("a meter alert names the meter and its society, and opens the meter", () => {
    const m = meterAlertMessage({ kind: "offline", meterName: "Tower A lift", place: "Ace City", meterId: "m1" });
    expect(m.title).toBe("Meter stopped reporting");
    expect(m.body).toBe("Tower A lift · Ace City");
    expect(m.url).toBe("/admin/meters/m1");
  });
  it("never notifies a person of work they gave themselves, or nobody", () => {
    expect(shouldNotifyAssignee("a", "a")).toBe(false);
    expect(shouldNotifyAssignee(null, "a")).toBe(false);
    expect(shouldNotifyAssignee("b", "a")).toBe(true);
  });
});
