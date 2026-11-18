import { describe, expect, it } from "vitest";
import {
  cleanRecipients, closeStage, defaultClosePeriod, emailReady, fillTemplate, refuseTemplate, reportState, textToHtml, unknownWords,
  DEFAULT_MONTHLY_CLOSE_TEMPLATE,
} from "@/lib/monthly-close";

describe("monthly close — where a society stands", () => {
  it("reads the report across circuits", () => {
    expect(reportState(0, 0)).toBe("none");
    expect(reportState(2, 0)).toBe("draft");
    expect(reportState(2, 1)).toBe("partial");
    expect(reportState(2, 2)).toBe("published");
  });
  it("runs report, then bill, then email", () => {
    expect(closeStage({ report: "draft", bill: "released", emailed: false })).toBe("report");
    expect(closeStage({ report: "partial", bill: "not_fetched", emailed: false })).toBe("report");
    expect(closeStage({ report: "published", bill: "to_review", emailed: false })).toBe("bill");
    expect(closeStage({ report: "none", bill: "awaiting_release", emailed: false })).toBe("bill");
    expect(closeStage({ report: "published", bill: "released", emailed: false })).toBe("email");
    expect(closeStage({ report: "published", bill: "released", emailed: true })).toBe("done");
  });
  it("opens the email only when both are final", () => {
    expect(emailReady("published", "released")).toBe(true);
    expect(emailReady("none", "released")).toBe(true);
    expect(emailReady("partial", "released")).toBe(false);
    expect(emailReady("published", "awaiting_release")).toBe(false);
  });
  it("defaults to the month that has just ended, in India's time", () => {
    expect(defaultClosePeriod(new Date("2026-11-18T10:00:00Z"))).toBe("2026-10");
    expect(defaultClosePeriod(new Date("2027-01-03T10:00:00Z"))).toBe("2026-12");
    // 31 Oct 20:00 UTC is already 1 Nov in India
    expect(defaultClosePeriod(new Date("2026-10-31T20:00:00Z"))).toBe("2026-10");
  });
});

describe("monthly close — the template", () => {
  it("fills words and never leaves a brace for a missing value", () => {
    expect(fillTemplate("Dear {society}, due {due_date}", { society: "Hyde Park", due_date: null })).toBe("Dear Hyde Park, due —");
  });
  it("refuses an unknown word and empty text", () => {
    expect(unknownWords("{socety} {month}")).toEqual(["socety"]);
    expect(refuseTemplate("Hi {socety}", "x")).toMatch(/\{socety\}/);
    expect(refuseTemplate(" ", "x")).toMatch(/subject/);
    expect(refuseTemplate(DEFAULT_MONTHLY_CLOSE_TEMPLATE.subject, DEFAULT_MONTHLY_CLOSE_TEMPLATE.body)).toBeNull();
  });
  it("cleans recipients and escapes the HTML body", () => {
    expect(cleanRecipients([" A@x.in", "a@x.in", "not-an-email", "b@y.org"])).toEqual(["a@x.in", "b@y.org"]);
    expect(textToHtml("a <b>\nc\n\nd")).toBe('<p style="margin:0 0 14px">a &lt;b&gt;<br>c</p><p style="margin:0 0 14px">d</p>');
  });
});

import { PDFDocument } from "pdf-lib";
import { buildSavingsReportPdf, savingsReportFileName } from "@/lib/savings-report-pdf";

describe("monthly close — the savings report attachment", () => {
  const snap = (label: string) => ({
    societyName: "RG Residency", societyLocation: "Sector 120, Noida", circuitLabel: label, meteredLightCount: 69, representedLightCount: 1444, demoLights: 69,
    benchmarkSavingsPct: 66, month: "2026-10", baselineKwhPerDay: 32.69,
    days: Array.from({ length: 31 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, "0")}`, kWh: 11, intervalCount: 24, expectedIntervals: 24, excluded: i === 4, excludedReason: i === 4 ? "offline" : null, variancePct: null, varianceBand: null, savingsPct: 66.3, savingsBand: null })),
    summary: { averageKwh: 11, savingsPct: 66.3, band: null, warn: false }, fee: { savedValue: 47926, amount: 14050, societyNet: 33876 }, generatedAt: "2026-11-18T10:00:00Z",
  });
  it("puts each circuit on its own page", async () => {
    const doc = await PDFDocument.load(await buildSavingsReportPdf([snap("Basement") as never, snap("Lift lobby") as never]));
    expect(doc.getPageCount()).toBe(2);
  });
  it("names the file by society and month", () => {
    expect(savingsReportFileName("The Hyde Park", "2026-10")).toBe("The_Hyde_Park_Savings_Report_2026-10.pdf");
  });
});

import { emailAllowedHere, emailBlockedReason, sendEmail } from "@/lib/ses";

describe("email leaves only from production", () => {
  it("refuses to send unless APP_ENV is production, whatever else is set", async () => {
    const prev = { app: process.env.APP_ENV, from: process.env.SES_FROM_EMAIL, region: process.env.AWS_REGION };
    process.env.SES_FROM_EMAIL = "billing@example.com";
    process.env.AWS_REGION = "ap-south-1";
    for (const env of [undefined, "staging", "development", "Production"]) {
      if (env === undefined) delete process.env.APP_ENV; else process.env.APP_ENV = env;
      expect(emailAllowedHere()).toBe(false);
      expect(emailBlockedReason()).toMatch(/only ever sent from production/);
      const r = await sendEmail({ to: ["someone@example.com"], subject: "x", html: "x", text: "x" });
      expect(r.error).toMatch(/only ever sent from production/);
    }
    process.env.APP_ENV = "production";
    expect(emailAllowedHere()).toBe(true);
    expect(emailBlockedReason()).toBeNull();
    Object.assign(process.env, { APP_ENV: prev.app ?? "", SES_FROM_EMAIL: prev.from ?? "", AWS_REGION: prev.region ?? "" });
    if (!prev.app) delete process.env.APP_ENV;
  });
});
