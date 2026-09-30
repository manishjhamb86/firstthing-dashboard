import { describe, expect, it } from "vitest";
import { checkSocietyChronology, type Branch } from "@/lib/society-chronology";
import { flattenTimelineForExport, rowsToCsv } from "@/lib/timeline-export";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const today = d("2026-09-30");

function tree(): Branch {
  return {
    id: "soc",
    kind: "society",
    title: "Society",
    name: "Test Society",
    steps: [{ id: "soc:created", slot: "societyCreated", label: "Society added", date: d("2026-01-01") }],
    children: [
      {
        id: "line",
        kind: "line",
        title: "Service line",
        name: "Lighting",
        steps: [],
        children: [
          {
            id: "deal",
            kind: "deal",
            title: "Deal",
            name: "Lighting - Basement B1",
            steps: [
              { id: "deal:lead", slot: "lead", label: "Lead logged", date: d("2026-01-05") },
              // Out of order on purpose: the survey is dated BEFORE the
              // lead, which the real deal.survey-lead rule (error) flags.
              { id: "deal:survey", slot: "survey", label: "Site survey visited", date: d("2026-01-01") },
            ],
            children: [
              {
                id: "circuit",
                kind: "circuit",
                title: "Circuit",
                name: "Basement",
                steps: [],
                children: [
                  {
                    id: "demo",
                    kind: "demo",
                    title: "Demo 1",
                    name: "60 lights",
                    steps: [{ id: "demo:meter", slot: "meter", label: "Meter installed", date: null, expected: true }],
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

describe("flattenTimelineForExport", () => {
  it("carries society/line/deal/circuit context down to every step, and prefixes a demo step by its demo", () => {
    const root = tree();
    const rows = flattenTimelineForExport("Test Society", root, checkSocietyChronology(root, today));
    const row = rows.find((r) => r.step === "Demo 1: Meter installed");
    expect(row).toMatchObject({
      society: "Test Society",
      serviceLine: "Lighting",
      deal: "Lighting - Basement B1",
      circuit: "Basement",
      status: "Not recorded",
    });
  });

  it("marks a step the chronology check flags as out of order", () => {
    // deal.survey-lead's default flag names the EARLIER step (lead) when the
    // pair disagrees — dates are trusted from the end back, so the survey
    // reads as the true one and the lead as what needs fixing.
    const root = tree();
    const issues = checkSocietyChronology(root, today);
    expect(issues.some((i) => i.stepId === "deal:lead")).toBe(true);
    const rows = flattenTimelineForExport("Test Society", root, issues);
    const row = rows.find((r) => r.step === "Lead logged");
    expect(row?.status).toBe("Out of order");
    expect(row?.note.length).toBeGreaterThan(0);
  });

  it("a step with no issue reads in order", () => {
    const root = tree();
    const rows = flattenTimelineForExport("Test Society", root, checkSocietyChronology(root, today));
    const row = rows.find((r) => r.step === "Site survey visited");
    expect(row?.status).toBe("In order");
    expect(row?.date).toBe("01-01-2026");
  });
});

describe("rowsToCsv", () => {
  it("quotes a field carrying a comma and escapes an embedded quote", () => {
    const csv = rowsToCsv([
      { society: 'Society, "One"', serviceLine: "Lighting", deal: "", circuit: "", step: "", date: "", status: "", note: "" },
    ]);
    const line = csv.split("\r\n")[1];
    expect(line).toContain('"Society, ""One"""');
  });

  it("starts with a UTF-8 BOM so Excel reads it correctly", () => {
    const csv = rowsToCsv([]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });
});
