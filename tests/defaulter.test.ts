import { describe, expect, it } from "vitest";
import { refuseMarkDefaulter } from "@/lib/defaulter";

describe("refuseMarkDefaulter", () => {
  it("refuses a blank reason", () => {
    expect(refuseMarkDefaulter("")).toMatch(/say why/i);
    expect(refuseMarkDefaulter("   ")).toMatch(/say why/i);
  });

  it("accepts a stated reason", () => {
    expect(refuseMarkDefaulter("Stopped paying after the June invoice.")).toBeNull();
  });
});
