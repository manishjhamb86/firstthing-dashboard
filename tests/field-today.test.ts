import { describe, expect, it } from "vitest";
import { firstName, greetingFor, istWallClock, planToday } from "@/lib/field-today";

const at = (iso: string) => ({ startAt: new Date(iso) });

describe("istWallClock", () => {
  it("reads 00:30 IST as the IST date, not yesterday's UTC date", () => {
    // 29 Sep 19:00Z is 30 Sep 00:30 IST.
    const wall = istWallClock(new Date("2026-09-29T19:00:00Z"));
    expect(wall.getUTCDate()).toBe(30);
    expect(wall.getUTCHours()).toBe(0);
    expect(wall.getUTCMinutes()).toBe(30);
  });
});

describe("planToday", () => {
  const now = new Date("2026-09-30T09:15:00Z"); // wall-clock 09:15 on 30 Sep

  it("puts a visit later today under today, not overdue by the hour", () => {
    const plan = planToday([at("2026-09-30T08:00:00Z"), at("2026-09-30T17:00:00Z")], now);
    expect(plan.today).toHaveLength(2);
    expect(plan.overdue).toHaveLength(0);
  });

  it("calls an open entry from a past day overdue", () => {
    const plan = planToday([at("2026-09-29T10:30:00Z")], now);
    expect(plan.overdue).toHaveLength(1);
  });

  it("lists the next seven days and only counts beyond", () => {
    const plan = planToday(
      [at("2026-10-01T10:00:00Z"), at("2026-10-07T10:00:00Z"), at("2026-10-08T10:00:00Z"), at("2026-11-01T10:00:00Z")],
      now,
    );
    expect(plan.soon).toHaveLength(2);
    expect(plan.laterCount).toBe(2);
  });

  it("orders each group by time", () => {
    const plan = planToday([at("2026-09-30T15:00:00Z"), at("2026-09-30T09:00:00Z")], now);
    expect(plan.today.map((i) => i.startAt.getUTCHours())).toEqual([9, 15]);
  });
});

describe("greeting", () => {
  it("follows the wall-clock hour", () => {
    expect(greetingFor(new Date("2026-09-30T08:00:00Z"))).toBe("Good morning");
    expect(greetingFor(new Date("2026-09-30T13:00:00Z"))).toBe("Good afternoon");
    expect(greetingFor(new Date("2026-09-30T19:00:00Z"))).toBe("Good evening");
  });

  it("uses the first name, or the email's local part without one", () => {
    expect(firstName("Yogendra Singh", "y@firsthing.earth")).toBe("Yogendra");
    expect(firstName(null, "yogendra@firsthing.earth")).toBe("yogendra");
  });
});
