import { describe, expect, it } from "vitest";
import {
  afterRefusal,
  classifyReply,
  parseEnvelope,
  parseInspectionPayload,
  parseDemoMeterPayload,
  parseDemoReplacementPayload,
  parseMovePayload,
  parsePhotoPayload,
  retryDelayMs,
} from "@/lib/field-sync";

const ID = "3f2b8c1e-8d4a-4c1e-9b7a-2a1d5e6f7a8b";

describe("parseEnvelope", () => {
  it("accepts a known kind with a device uuid", () => {
    expect(parseEnvelope({ id: ID, kind: "inspection.file", payload: {} })).toEqual({ id: ID, kind: "inspection.file", payload: {} });
  });
  it("refuses a missing or made-up id, and an unknown kind", () => {
    expect(parseEnvelope({ id: "1", kind: "inspection.file" })).toHaveProperty("error");
    expect(parseEnvelope({ id: ID, kind: "circuit.delete" })).toHaveProperty("error");
    expect(parseEnvelope(null)).toHaveProperty("error");
  });
});

describe("parseInspectionPayload", () => {
  const good = {
    societyId: "soc-1",
    circuitId: "",
    period: "2026-09",
    inspectedAt: "2026-09-29T10:30",
    totalLightsChecked: "120",
    societyRepName: " R. Sharma ",
    notes: "",
    findings: [{ location: "Tower B lobby", sensorStatus: "dim", physicalDamage: true, actionReplace: "yes", remarks: "" }],
  };
  it("reads a whole inspection, no circuit as null, flags strictly boolean", () => {
    const r = parseInspectionPayload(good);
    expect(r).toMatchObject({ circuitId: null, totalLightsChecked: 120 });
    if ("error" in r) throw new Error(r.error);
    expect(r.findings[0]).toMatchObject({ physicalDamage: true, actionReplace: false });
  });
  it("refuses what cannot be filed at all", () => {
    expect(parseInspectionPayload({ ...good, period: "Sep" })).toHaveProperty("error");
    expect(parseInspectionPayload({ ...good, inspectedAt: "29/09/2026" })).toHaveProperty("error");
    expect(parseInspectionPayload({ ...good, totalLightsChecked: "12.5" })).toHaveProperty("error");
    expect(parseInspectionPayload({ ...good, findings: [{ location: "x", sensorStatus: "broken" }] })).toHaveProperty("error");
  });
});

describe("parsePhotoPayload", () => {
  it("needs the inspection item and an uploaded key", () => {
    expect(parsePhotoPayload({ inspectionItemId: ID, key: "Documents/X/2026-09/Inspections/a.jpg" })).not.toHaveProperty("error");
    expect(parsePhotoPayload({ inspectionItemId: ID, key: "Ingest/secret.csv" })).toHaveProperty("error");
  });
});

describe("classifyReply", () => {
  it("tells done, refusal, sign-in and network trouble apart", () => {
    expect(classifyReply(200)).toBe("done");
    expect(classifyReply(422)).toBe("refused");
    expect(classifyReply(403)).toBe("refused");
    expect(classifyReply(401)).toBe("sign_in");
    expect(classifyReply(500)).toBe("retry");
    expect(classifyReply(503)).toBe("retry");
  });
});

describe("retry and blocking", () => {
  it("backs off from 15 s and caps at 5 minutes", () => {
    expect(retryDelayMs(0)).toBe(15_000);
    expect(retryDelayMs(1)).toBe(30_000);
    expect(retryDelayMs(3)).toBe(120_000);
    expect(retryDelayMs(10)).toBe(300_000);
  });
  it("blocks the queue on the third refusal, not before", () => {
    expect(afterRefusal(2)).toBe("retry");
    expect(afterRefusal(3)).toBe("block");
  });
});

describe("parseMovePayload", () => {
  const good = { codes: ["B2609-001-00001", " ", "B2609-001-00002"], kind: "deploy", on: "2026-09-29", societyId: "soc-1" };
  it("keeps the scanned codes and fills absent destinations as empty", () => {
    const r = parseMovePayload(good);
    if ("error" in r) throw new Error(r.error);
    expect(r.codes).toEqual(["B2609-001-00001", "B2609-001-00002"]);
    expect(r).toMatchObject({ kind: "deploy", toOfficeId: "", circuitId: "", reason: "" });
  });
  it("refuses an empty pile, an unknown move and a bad date", () => {
    expect(parseMovePayload({ ...good, codes: [] })).toHaveProperty("error");
    expect(parseMovePayload({ ...good, kind: "receive" })).toHaveProperty("error");
    expect(parseMovePayload({ ...good, on: "29-09-2026" })).toHaveProperty("error");
  });
  it("is a known outbox kind", () => {
    expect(parseEnvelope({ id: ID, kind: "stock.move", payload: good })).not.toHaveProperty("error");
  });
});

describe("demo step payloads", () => {
  it("reads a meter install, no meter meaning an old paper demo", () => {
    expect(parseDemoMeterPayload({ demoId: "d1", meterId: "m1", installedOn: "2026-09-20", displayedLoad: "1840" })).toEqual({
      demoId: "d1", meterId: "m1", installedOn: "2026-09-20", displayedLoad: 1840,
    });
    expect(parseDemoMeterPayload({ demoId: "d1", meterId: "", installedOn: "2026-09-20", displayedLoad: "" })).toMatchObject({ meterId: null, displayedLoad: null });
    expect(parseDemoMeterPayload({ demoId: "d1", installedOn: "20-09-2026" })).toHaveProperty("error");
    expect(parseDemoMeterPayload({ demoId: "d1", installedOn: "2026-09-20", displayedLoad: "lots" })).toHaveProperty("error");
  });
  it("reads a replacement with its lines, exclusion strictly boolean", () => {
    const r = parseDemoReplacementPayload({ demoId: "d1", replacedOn: "2026-09-25", lines: [{ lineId: "l1", replacementTypeId: "t1", count: "55", wattage: "18", exclude: "yes" }] });
    if ("error" in r) throw new Error(r.error);
    expect(r.lines[0]).toEqual({ lineId: "l1", replacementTypeId: "t1", count: 55, wattage: 18, exclude: false });
    expect(parseDemoReplacementPayload({ demoId: "d1", replacedOn: "soon" })).toHaveProperty("error");
  });
});
