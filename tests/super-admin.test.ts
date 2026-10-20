import { describe, expect, it } from "vitest";
import { isSuperAdmin, SUPER_ADMIN_EMAIL } from "@/lib/super-admin";

describe("isSuperAdmin", () => {
  it("accepts the named account", () => expect(isSuperAdmin(SUPER_ADMIN_EMAIL)).toBe(true));
  it("is case-insensitive", () => expect(isSuperAdmin("Yogesh@FirsThing.Earth")).toBe(true));
  it("tolerates surrounding whitespace", () => expect(isSuperAdmin(`  ${SUPER_ADMIN_EMAIL}  `)).toBe(true));
  it("refuses anyone else", () => {
    expect(isSuperAdmin("admin@firsthing.earth")).toBe(false);
    expect(isSuperAdmin(null)).toBe(false);
    expect(isSuperAdmin(undefined)).toBe(false);
    expect(isSuperAdmin("")).toBe(false);
  });
});
