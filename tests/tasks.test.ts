import { describe, expect, it } from "vitest";
import { dueInstant, mayActOnTask, refuseTask, taskState, taskSummary } from "@/lib/tasks";

const d = (s: string) => new Date(s);
const today = d("2026-09-25T10:00:00Z");

describe("taskState", () => {
  it("compares calendar days: due later today is due today, not overdue", () => {
    expect(taskState({ status: "scheduled", startAt: d("2026-09-25T17:00:00Z") }, today)).toBe("due_today");
    expect(taskState({ status: "scheduled", startAt: d("2026-09-24T00:00:00Z") }, today)).toBe("overdue");
    expect(taskState({ status: "scheduled", startAt: d("2026-09-26T00:00:00Z") }, today)).toBe("upcoming");
    expect(taskState({ status: "done", startAt: d("2026-09-01T00:00:00Z") }, today)).toBe("done");
  });
});

describe("taskSummary", () => {
  it("counts only open tasks", () => {
    const s = taskSummary(
      [
        { status: "scheduled", startAt: d("2026-09-20T00:00:00Z") },
        { status: "scheduled", startAt: d("2026-09-25T00:00:00Z") },
        { status: "scheduled", startAt: d("2026-09-29T00:00:00Z") },
        { status: "scheduled", startAt: d("2026-10-20T00:00:00Z") },
        { status: "done", startAt: d("2026-09-20T00:00:00Z") },
      ],
      today,
    );
    expect(s).toEqual({ open: 4, overdue: 1, dueToday: 1, dueThisWeek: 3 });
  });
});

describe("who may act", () => {
  it("the assignee, the creator, or operations", () => {
    const t = { assigneeId: "a", createdById: "c" };
    expect(mayActOnTask("a", t, false)).toBe(true);
    expect(mayActOnTask("c", t, false)).toBe(true);
    expect(mayActOnTask("x", t, false)).toBe(false);
    expect(mayActOnTask("x", t, true)).toBe(true);
  });
});

describe("refuseTask / dueInstant", () => {
  it("needs a title, an assignee and a due date", () => {
    expect(refuseTask({ title: "", assigneeId: "a", due: "2026-09-30", time: "" })).toMatch(/what the task/);
    expect(refuseTask({ title: "Call RWA", assigneeId: "", due: "2026-09-30", time: "" })).toMatch(/assigned/);
    expect(refuseTask({ title: "Call RWA", assigneeId: "a", due: "", time: "" })).toMatch(/due date/);
    expect(refuseTask({ title: "Call RWA", assigneeId: "a", due: "2026-09-30", time: "25:00" })).toMatch(/time/);
    expect(refuseTask({ title: "Call RWA", assigneeId: "a", due: "2026-09-30", time: "10:30" })).toBeNull();
  });
  it("a date alone is all-day; a time is kept as entered", () => {
    expect(dueInstant("2026-09-30", "")).toEqual({ startAt: d("2026-09-30T00:00:00Z"), allDay: true });
    expect(dueInstant("2026-09-30", "10:30")).toEqual({ startAt: d("2026-09-30T10:30:00Z"), allDay: false });
  });
});
