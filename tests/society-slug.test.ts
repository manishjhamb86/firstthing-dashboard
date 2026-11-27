import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normaliseSlug, refuseSlug, RESERVED_SLUG_KEYS, slugFromName, slugKey } from "@/lib/society-slug";

describe("society public page addresses", () => {
  it("drops a leading The and joins words with hyphens", () => {
    expect(slugFromName("The Hyde Park")).toBe("hyde-park");
    expect(slugFromName("Aditya Urban Casa, Sector 78")).toBe("aditya-urban-casa-sector-78");
    expect(slugFromName("Theatre Towers")).toBe("theatre-towers");
  });
  it("matches /hydepark and /hyde-park as one page", () => {
    expect(slugKey("hyde-park")).toBe(slugKey("HydePark"));
  });
  it("tidies a pasted link", () => {
    expect(normaliseSlug("https://firsthing.earth/Hyde Park")).toBe("hyde-park");
  });
  it("refuses the app's own paths and too-short addresses", () => {
    expect(refuseSlug("admin")).toMatch(/site's own/);
    expect(refuseSlug("ab")).toMatch(/3/);
    expect(refuseSlug("hyde-park")).toBeNull();
  });
  it("reserves every top-level folder of the app", () => {
    for (const d of readdirSync("src/app", { withFileTypes: true })) {
      if (!d.isDirectory() || d.name.startsWith("[") || d.name.startsWith("(")) continue;
      expect(RESERVED_SLUG_KEYS.has(slugKey(d.name)), d.name).toBe(true);
    }
  });
});
