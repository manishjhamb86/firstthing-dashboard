import { describe, expect, it } from "vitest";
import { jumpResults } from "@/lib/jump-search";

const pages = [
  { label: "Home", href: "/admin" },
  { label: "Live monitoring", href: "/admin/live-monitoring", group: "Lighting" },
  { label: "Monthly close", href: "/admin/billing/close", group: "Billing" },
  { label: "Society requests", href: "/admin/tickets", group: "Service", keywords: "support tickets complaints" },
];
const societies = [
  { id: "a", name: "Ace City", location: "Greater Noida West" },
  { id: "h", name: "The Hyde Park", location: "Noida" },
];

describe("jumpResults", () => {
  it("lists the pages when nothing is typed", () => {
    expect(jumpResults("", pages, societies).map((r) => r.label)).toEqual(["Home", "Live monitoring", "Monthly close", "Society requests"]);
  });
  it("matches every word in any order, across label and group", () => {
    expect(jumpResults("billing close", pages, societies).map((r) => r.href)).toEqual(["/admin/billing/close"]);
    expect(jumpResults("close month", pages, societies).map((r) => r.href)).toEqual(["/admin/billing/close"]);
  });
  it("finds a page by its old name through keywords", () => {
    expect(jumpResults("support", pages, societies)[0].href).toBe("/admin/tickets");
  });
  it("finds societies by name or location and links to the society", () => {
    const r = jumpResults("hyde", pages, societies);
    expect(r).toEqual([{ kind: "society", label: "The Hyde Park", href: "/admin/societies/h", detail: "Noida" }]);
    expect(jumpResults("greater noida", pages, societies).map((x) => x.label)).toEqual(["Ace City"]);
  });
  it("ranks a label starting with the query first", () => {
    const r = jumpResults("noida", pages, [
      { id: "x", name: "Mahagun Noida", location: "Noida" },
      { id: "y", name: "Noida Heights", location: "Noida" },
    ]);
    expect(r.map((x) => x.label)).toEqual(["Noida Heights", "Mahagun Noida"]);
  });
});
