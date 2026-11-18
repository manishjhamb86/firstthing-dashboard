import { describe, expect, it } from "vitest";
import { installationOpenReason } from "@/lib/installation-open";

const approved = (n: number) => ({ state: "approved", installedCount: n });

describe("installationOpenReason", () => {
  it("is open with no certificate", () => {
    expect(installationOpenReason({ certificate: null, batches: [approved(445)] })).toBe("not_certified");
  });
  it("is open on a partial certificate not yet completed (Prateek Laurel)", () => {
    expect(installationOpenReason({ certificate: { isPartial: true, completedAt: null }, batches: [approved(2000), { state: "draft", installedCount: 0 }] })).toBe("partial_certificate");
  });
  it("is closed once a partial certificate is completed", () => {
    expect(installationOpenReason({ certificate: { isPartial: true, completedAt: new Date() }, batches: [approved(2500)] })).toBeNull();
  });
  it("is open when a day is still with the society after a full certificate (Princely Tower D)", () => {
    expect(installationOpenReason({ certificate: { isPartial: false, completedAt: null }, batches: [approved(1300), { state: "awaiting_review", installedCount: 60 }] })).toBe("work_after_certificate");
    expect(installationOpenReason({ certificate: { isPartial: false, completedAt: null }, batches: [{ state: "disputed", installedCount: 10 }] })).toBe("work_after_certificate");
  });
  it("is closed for a finished job even when installed is short of contracted (Aditya Mega City)", () => {
    expect(installationOpenReason({ certificate: { isPartial: false, completedAt: null }, batches: [approved(512)] })).toBeNull();
  });
  it("ignores an empty draft left behind on a finished job", () => {
    expect(installationOpenReason({ certificate: { isPartial: false, completedAt: null }, batches: [approved(740), { state: "draft", installedCount: 0 }] })).toBeNull();
  });
});
