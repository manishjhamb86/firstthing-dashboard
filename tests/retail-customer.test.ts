import { describe, expect, it } from "vitest";
import { matchRetailCustomer, refuseRetailCustomer, retailNameKey } from "@/lib/retail-customer";

const blank = { name: "", gstin: "", address: "", phone: "", email: "" };

describe("retail customers", () => {
  it("normalises the name so spelling of case and spacing is one customer", () => {
    expect(retailNameKey("  PARK VIEW  Residency. ")).toBe(retailNameKey("Park View Residency"));
  });
  it("needs a name; a GSTIN is optional but must be one", () => {
    expect(refuseRetailCustomer(blank)).toMatch(/name/);
    expect(refuseRetailCustomer({ ...blank, name: "Park View Residency" })).toBeNull();
    expect(refuseRetailCustomer({ ...blank, name: "X", gstin: "06AADAP0184A1Z3" })).toBeNull();
    expect(refuseRetailCustomer({ ...blank, name: "X", gstin: "1234" })).toMatch(/not a GSTIN/);
  });
  it("matches an invoice's bill-to by GSTIN first, then by name", () => {
    const customers = [
      { id: "a", nameKey: "park view residency", gstin: null },
      { id: "b", nameKey: "other name", gstin: "06AADAP0184A1Z3" },
    ];
    expect(matchRetailCustomer({ name: "Anything", gstin: "06aadap0184a1z3" }, customers)).toBe("b");
    expect(matchRetailCustomer({ name: "PARK VIEW RESIDENCY", gstin: "" }, customers)).toBe("a");
    expect(matchRetailCustomer({ name: "Someone new", gstin: "" }, customers)).toBeNull();
  });
});
