import { describe, expect, it } from "vitest";
import { refusePasswordChange, MIN_PASSWORD_LENGTH } from "@/lib/password-policy";

describe("refusePasswordChange", () => {
  it("refuses a password shorter than the floor", () => {
    expect(refusePasswordChange({ newPassword: "short1", confirmPassword: "short1" })).toMatch(/at least 8/);
  });

  it("refuses when the confirmation doesn't match", () => {
    expect(refusePasswordChange({ newPassword: "longenough1", confirmPassword: "longenough2" })).toMatch(/don't match/);
  });

  it("accepts a long-enough, matching pair", () => {
    expect(refusePasswordChange({ newPassword: "longenough1", confirmPassword: "longenough1" })).toBeNull();
  });

  it("the floor is exactly 8", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
    expect(refusePasswordChange({ newPassword: "12345678", confirmPassword: "12345678" })).toBeNull();
    expect(refusePasswordChange({ newPassword: "1234567", confirmPassword: "1234567" })).toMatch(/at least 8/);
  });
});
