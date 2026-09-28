import { describe, expect, it } from "vitest";
import {
  checkSocietyChronology,
  currentValue,
  gapLabel,
  locate,
  proposalWarnings,
  refuseProposal,
  spanLabel,
  summarise,
  withProposal,
  type Branch,
  type Step,
} from "@/lib/society-chronology";
import { buildTimelineView, summaryLine } from "@/lib/society-timeline-view";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const today = d("2026-09-28");

const step = (branchId: string, s: Omit<Step, "id">): Step => ({ ...s, id: `${branchId}:${s.slot}` });

/** The Hyde Park chronology from the reviewed design (stage data, 2026-09-28). */
function hydePark(over: { replacementAssigned?: Date | null; decided?: Date | null; enrolled?: Date } = {}): Branch {
  const demo: Branch = {
    id: "demo:1",
    kind: "demo",
    title: "Demo 1",
    name: "63 lights",
    steps: [
      step("demo:1", { slot: "meter", label: "Meter installed", date: d("2025-03-03"), expected: true, edit: { field: "demo.meterInstalledAt", entityId: "demo1" } }),
      step("demo:1", { slot: "pre", label: "Before-installation readings", date: d("2025-03-04"), end: d("2025-03-09"), expected: true, edit: { field: "demo.pre", entityId: "demo1" } }),
      step("demo:1", {
        slot: "replacementAssigned",
        label: "Replacement assigned to a crew",
        date: over.replacementAssigned === undefined ? d("2026-09-26") : over.replacementAssigned,
        expected: true,
        edit: { field: "demo.replacementAssignedAt", entityId: "demo1" },
      }),
      step("demo:1", { slot: "replaced", label: "Lights replaced", date: d("2025-03-23"), expected: true, edit: { field: "demo.lightReplacementDate", entityId: "demo1" } }),
      step("demo:1", { slot: "post", label: "After-installation readings", date: d("2025-03-24"), end: d("2025-03-28"), expected: true, edit: { field: "demo.post", entityId: "demo1" } }),
      step("demo:1", { slot: "gatePasses", label: "Gate passes approved", date: d("2026-09-26"), recordOnly: "Stamped when entered." }),
    ],
    children: [],
  };
  const deal: Branch = {
    id: "deal:1",
    kind: "deal",
    title: "Deal",
    name: "Lighting — Basement",
    steps: [
      step("deal:1", { slot: "lead", label: "Lead logged", date: d("2025-03-03"), expected: true, edit: { field: "pipeline.createdAt", entityId: "p1" } }),
      step("deal:1", { slot: "meeting", label: "Demo meeting held", date: d("2025-03-03"), expected: true }),
      step("deal:1", { slot: "decided", label: "Proposal decided", date: over.decided ?? null, expected: true }),
      step("deal:1", { slot: "surveyAssigned", label: "Survey assigned", date: null, expected: true }),
      step("deal:1", { slot: "survey", label: "Site survey done", date: d("2025-03-03"), expected: true, borrowed: "No survey visit was booked, so this is the date the survey record was opened." }),
    ],
    children: [{ id: "circuit:1", kind: "circuit", title: "Circuit", name: "Basement", steps: [], children: [demo] }],
    after: [
      step("deal:1", { slot: "reportShared", label: "Demo report shared", date: d("2026-09-26"), recordOnly: "Stamped when shared." }),
      step("deal:1", { slot: "offerIssued", label: "Offer issued", date: d("2025-06-07"), expected: true }),
      step("deal:1", { slot: "offerResponded", label: "Offer accepted", date: d("2025-06-07"), expected: true }),
      step("deal:1", {
        slot: "agreement",
        label: "Agreement signed",
        date: d("2025-06-07"),
        chain: [
          { slot: "agreementPrepared", label: "Prepared", date: d("2025-06-07"), edit: { field: "agreement.preparedAt", entityId: "p1" } },
          { slot: "agreementPrinted", label: "Printed", date: d("2025-06-07") },
          { slot: "agreementNotarized", label: "Notarised", date: d("2025-06-07") },
          { slot: "agreementSigned", label: "Signed", date: d("2025-06-07"), edit: { field: "agreement.signedAt", entityId: "p1" } },
          { slot: "agreementUploaded", label: "Scan uploaded", date: d("2025-06-08") },
        ],
      }),
      step("deal:1", { slot: "certificate", label: "Installation certificate signed", date: d("2025-07-05") }),
      step("deal:1", { slot: "term", label: "Contract term", date: d("2025-07-06"), end: d("2028-07-06"), futureOk: true, edit: { field: "contract.term", entityId: "p1" } }),
    ],
  };
  return {
    id: "society:1",
    kind: "society",
    title: "Society",
    name: "The Hyde Park",
    steps: [step("society:1", { slot: "societyCreated", label: "Society added", date: d("2026-08-26") })],
    children: [
      {
        id: "line:1",
        kind: "line",
        title: "Service line",
        name: "Lighting",
        steps: [step("line:1", { slot: "enrolled", label: "Enrolled in Lighting", date: over.enrolled ?? d("2026-08-28"), expected: true, edit: { field: "engagement.createdAt", entityId: "e1" } })],
        children: [deal],
      },
    ],
  };
}

describe("checkSocietyChronology on the Hyde Park timeline", () => {
  const issues = checkSocietyChronology(hydePark(), today);
  const byStep = (id: string) => issues.filter((i) => i.stepId === id);

  it("flags the crew assigned after the lights were replaced, on the assignment row, with both dates and the rule", () => {
    const [i] = byStep("demo:1:replacementAssigned");
    expect(i.kind).toBe("order");
    expect(i.severity).toBe("error");
    expect(i.message).toContain("26-09-2026");
    expect(i.message).toContain("23-03-2025");
    expect(i.message).toContain("The crew is assigned on or before the day the lights are replaced.");
  });

  it("flags the enrolment after the first lead as a check, on the enrolment row", () => {
    const [i] = byStep("line:1:enrolled");
    expect(i.kind).toBe("check");
    expect(i.severity).toBe("warning");
    expect(i.message).toMatch(/after lead logged on 03-03-2025/);
  });

  it("marks the undated proposal decision and survey assignment as not recorded — later steps have dates", () => {
    expect(byStep("deal:1:decided").map((i) => i.kind)).toEqual(["missing"]);
    expect(byStep("deal:1:surveyAssigned").map((i) => i.kind)).toEqual(["missing"]);
  });

  it("marks the survey dated from its record as borrowed", () => {
    expect(byStep("deal:1:survey").map((i) => i.kind)).toEqual(["borrowed"]);
  });

  it("never checks record-time stamps: the report shared after the offer, gate passes after the demo", () => {
    expect(byStep("deal:1:reportShared")).toEqual([]);
    expect(byStep("demo:1:gatePasses")).toEqual([]);
    expect(byStep("deal:1:offerIssued")).toEqual([]);
  });

  it("lets a contract term end in the future", () => {
    expect(byStep("deal:1:term")).toEqual([]);
  });

  it("summarises one out of order, one check, two not recorded, one borrowed", () => {
    const s = summarise(hydePark(), issues);
    expect(s).toMatchObject({ order: 1, check: 1, future: 0, missing: 2, borrowed: 1 });
    expect(summaryLine(s)).toEqual({ tone: "bad", headline: "1 date is out of order" });
  });
});

describe("rules", () => {
  it("reads a parent's step from a child: a meter before the survey is out of order", () => {
    const t = withProposal(hydePark(), { field: "demo.meterInstalledAt", entityId: "demo1" }, "2025-03-01")!;
    const i = checkSocietyChronology(t, today).find((x) => x.stepId === "demo:1:meter");
    expect(i?.message).toMatch(/The meter goes in on or after the survey/);
  });

  it("checks the agreement chain in order, skipping steps with no date", () => {
    const t = withProposal(hydePark(), { field: "agreement.signedAt", entityId: "p1" }, "2025-06-01")!;
    const msgs = checkSocietyChronology(t, today).filter((x) => x.stepId === "deal:1:agreement").map((x) => x.message);
    expect(msgs.some((m) => m.startsWith("Signed on 01-06-2025 is before prepared on 07-06-2025"))).toBe(true);
  });

  it("flags a completed step dated in the future", () => {
    const t = withProposal(hydePark(), { field: "pipeline.createdAt", entityId: "p1" }, "2026-10-01")!;
    expect(checkSocietyChronology(t, today).some((x) => x.kind === "future" && x.stepId === "deal:1:lead")).toBe(true);
  });

  it("an undated step with nothing dated after it is not reached, not missing", () => {
    const tree = hydePark();
    const deal = tree.children[0].children[0];
    deal.steps = deal.steps.slice(0, 3);
    deal.children = [];
    deal.after = [];
    const issues = checkSocietyChronology(tree, today);
    expect(issues.some((x) => x.stepId === "deal:1:decided")).toBe(false);
    expect(summarise(tree, issues).notReached).toBe(1);
  });

  it("does not check a struck-through (removed) branch", () => {
    const tree = hydePark();
    tree.children[0].children[0].children[0].children[0].struck = "Removed";
    expect(checkSocietyChronology(tree, today).some((x) => x.stepId === "demo:1:replacementAssigned")).toBe(false);
  });
});

describe("a proposed change", () => {
  const ref = { field: "demo.replacementAssignedAt" as const, entityId: "demo1" };

  it("reads the value on record in the stored shape, periods included", () => {
    expect(currentValue(hydePark(), ref)).toEqual({ found: true, value: "2026-09-26" });
    expect(currentValue(hydePark(), { field: "demo.pre", entityId: "demo1" }).value).toBe("2025-03-04/2025-03-09");
    expect(currentValue(hydePark(), { field: "agreement.signedAt", entityId: "p1" }).value).toBe("2025-06-07");
    expect(currentValue(hydePark(), { field: "offer.issuedAt", entityId: "nope" }).found).toBe(false);
  });

  it("accepts the fix the design proposes (15-03-2025) — it clears the error", () => {
    expect(refuseProposal(hydePark(), ref, "2025-03-15", today)).toBeNull();
    const t = withProposal(hydePark(), ref, "2025-03-15")!;
    expect(checkSocietyChronology(t, today).some((x) => x.stepId === "demo:1:replacementAssigned")).toBe(false);
  });

  it("refuses only an error the change ADDS, never one already there", () => {
    // Moving the lead leaves the crew error in place; that is not this edit's to answer for.
    expect(refuseProposal(hydePark(), { field: "pipeline.createdAt", entityId: "p1" }, "2025-03-02", today)).toBeNull();
    // Moving the lights replaced before the pre-period ends is new, and refused in the rule's words.
    expect(refuseProposal(hydePark(), { field: "demo.lightReplacementDate", entityId: "demo1" }, "2025-03-08", today)).toMatch(
      /after the before-installation readings end/,
    );
  });

  it("moves a period's both ends", () => {
    expect(refuseProposal(hydePark(), { field: "demo.post", entityId: "demo1" }, "2025-03-28/2025-03-24", today)).toMatch(/ends on or after the day it starts/);
    expect(refuseProposal(hydePark(), { field: "demo.post", entityId: "demo1" }, "2025-03-24/2025-03-30", today)).toBeNull();
  });

  it("reports new rule warnings without refusing", () => {
    const t = hydePark({ enrolled: d("2025-03-01") });
    expect(checkSocietyChronology(t, today).some((x) => x.stepId === "line:1:enrolled")).toBe(false);
    expect(proposalWarnings(t, { field: "engagement.createdAt", entityId: "e1" }, "2025-04-01", today)[0]).toMatch(/enrolled on or before its first lead/);
    expect(refuseProposal(t, { field: "engagement.createdAt", entityId: "e1" }, "2025-04-01", today)).toBeNull();
  });

  it("refuses a value that is not on the timeline or not a date", () => {
    expect(refuseProposal(hydePark(), { field: "offer.issuedAt", entityId: "nope" }, "2025-01-01", today)).toMatch(/not on this society's timeline/);
    expect(withProposal(hydePark(), ref, "2025-02-31")).toBeNull();
  });

  it("names where the date is", () => {
    expect(locate(hydePark(), ref)).toEqual({ label: "Replacement assigned to a crew", path: ["Lighting", "Lighting — Basement", "Basement", "Demo 1"] });
    expect(locate(hydePark(), { field: "agreement.signedAt", entityId: "p1" })?.label).toBe("Agreement signed — signed");
  });
});

describe("labels", () => {
  it("gaps and spans", () => {
    expect(gapLabel(d("2025-03-09"), d("2025-03-23"))).toBe("+14 days");
    expect(gapLabel(d("2025-03-03"), d("2025-03-03"))).toBe("same day");
    expect(gapLabel(null, d("2025-03-03"))).toBeNull();
    expect(spanLabel(d("2025-03-04"), d("2025-03-09"))).toBe("6 days");
  });
});

describe("buildTimelineView", () => {
  it("gives every row a state and a word, and counts problems up the tree", () => {
    const tree = hydePark();
    const view = buildTimelineView(tree, checkSocietyChronology(tree, today), new Map());
    const line = view.children[0];
    const demoRows = line.children[0].children[0].children[0].steps;
    expect(demoRows.find((r) => r.label.startsWith("Replacement"))).toMatchObject({ state: "bad", chip: { text: "Out of order" } });
    expect(demoRows.find((r) => r.label === "Gate passes approved")?.state).toBe("record");
    expect(demoRows.find((r) => r.label === "Before-installation readings")).toMatchObject({ dateText: "04-03-2025", endText: "09-03-2025", edit: { value: "2025-03-04/2025-03-09", range: true } });
    expect(line.counts).toEqual({ bad: 1, warn: 1, missing: 2 });
    const survey = line.children[0].steps.find((r) => r.label === "Site survey done");
    expect(survey).toMatchObject({ state: "info", dateText: "≈ 03-03-2025" });
  });

  it("shows an open request on the row it is about, chain items included", () => {
    const tree = hydePark();
    const req = { id: "r1", from: "07-06-2025", to: "05-06-2025", reason: "x", by: "Y", at: "now", mine: false };
    const view = buildTimelineView(tree, [], new Map([["agreement.signedAt|p1", [req]]]));
    const agreement = view.children[0].children[0].after.find((r) => r.label === "Agreement signed");
    expect(agreement?.requests).toEqual([req]);
  });
});
