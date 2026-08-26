import { describe, it, expect } from "vitest";
import { suggestDeviceType, tokens, type CatalogDevice } from "@/lib/device-match";

const CATALOG: CatalogDevice[] = [
  { id: "t20", name: "Tube light 20W", defaultWattage: 20 },
  { id: "t18", name: "Tube light 18W", defaultWattage: 18 },
  { id: "s12", name: "Surface light 12W", defaultWattage: 12 },
  { id: "led9", name: "LED bulb 9W", defaultWattage: 9 },
];

describe("reading a fixture name", () => {
  it("drops the wattage, which is compared separately", () => {
    expect(tokens("Tube light 20W")).toEqual(["tube", "light"]);
    expect(tokens("Surface Light 18 W")).toEqual(["surface", "light"]);
  });
});

describe("matching a document's fixture to the catalog", () => {
  // The exact case reported: the report says "Tube lights", the catalog holds
  // "Tube light 20W", and matching on the name alone made a second device.
  it("matches 'Tube lights' at 20W to 'Tube light 20W'", () => {
    const m = suggestDeviceType("Tube lights", 20, CATALOG);
    expect(m?.device.id).toBe("t20");
    expect(m?.sameWattage).toBe(true);
  });

  it("prefers the entry whose wattage agrees when names tie", () => {
    expect(suggestDeviceType("Tube lights", 18, CATALOG)?.device.id).toBe("t18");
  });

  it("still matches when no wattage is known, on the words alone", () => {
    expect(suggestDeviceType("Tube light", null, CATALOG)?.device.id).toBeDefined();
  });

  // The dangerous direction: a wrong match silently changes a circuit's load.
  it("never matches on wattage alone", () => {
    // A 20W fitting that shares no identifying word with any catalogue entry.
    expect(suggestDeviceType("Exhaust fan", 20, CATALOG)).toBeNull();
  });

  it("does not confuse surface with tube", () => {
    expect(suggestDeviceType("Surface lights", 20, CATALOG)?.device.id).toBe("s12");
    expect(suggestDeviceType("Tube lights", 12, CATALOG)?.device.id).not.toBe("s12");
  });

  it("returns nothing for a name with no identifying words", () => {
    expect(suggestDeviceType("lights", 20, CATALOG)).toBeNull();
    expect(suggestDeviceType("", 20, CATALOG)).toBeNull();
  });

  it("is case- and punctuation-insensitive", () => {
    expect(suggestDeviceType("TUBE-LIGHTS", 20, CATALOG)?.device.id).toBe("t20");
  });

  it("does not score a partial name as a perfect match", () => {
    const long: CatalogDevice[] = [{ id: "x", name: "Tube light basement dimmable fitting", defaultWattage: 20 }];
    const m = suggestDeviceType("Tube", 20, long);
    // One word out of three, plus wattage — enough to offer, not to be certain.
    expect(m && m.score < 1).toBe(true);
  });
});
