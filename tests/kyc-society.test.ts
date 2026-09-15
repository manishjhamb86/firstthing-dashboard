import { describe, expect, it } from "vitest";
import { bestKycAcross, kycCounts, kycMissing, type KycRow } from "@/lib/kyc-society";

const d = (s: string) => new Date(s);
const row = (pipelineId: string, type: KycRow["type"], status: KycRow["status"], at = "2026-09-01"): KycRow => ({
  pipelineId,
  type,
  status,
  updatedAt: d(at),
});

describe("bestKycAcross — a society's KYC is one set of documents across its deals", () => {
  it("a certificate verified on the first deal covers the second", () => {
    const best = bestKycAcross([row("deal-1", "gst_certificate", "verified"), row("deal-1", "electricity_bill", "verified")], "deal-2");
    expect(best.get("gst_certificate")?.record.pipelineId).toBe("deal-1");
    expect(best.get("gst_certificate")?.own).toBe(false);
    expect(kycCounts(best)).toEqual({ total: 2, resolved: 2 });
    expect(kycMissing(best)).toEqual([]);
  });

  it("ranks verified > not applicable > received > outstanding", () => {
    const best = bestKycAcross(
      [
        row("deal-2", "gst_certificate", "outstanding"),
        row("deal-1", "gst_certificate", "received"),
        row("deal-3", "gst_certificate", "not_applicable"),
      ],
      "deal-2",
    );
    expect(best.get("gst_certificate")?.record.pipelineId).toBe("deal-3");
    expect(kycCounts(best)).toEqual({ total: 1, resolved: 1 });
    expect(kycMissing(best)).toEqual(["electricity_bill"]);
  });

  it("the deal's own row wins a tie, so the screen shows what was recorded there", () => {
    const best = bestKycAcross(
      [row("deal-1", "gst_certificate", "verified", "2026-09-10"), row("deal-2", "gst_certificate", "verified", "2026-09-01")],
      "deal-2",
    );
    expect(best.get("gst_certificate")?.own).toBe(true);
  });

  it("a received-but-unverified sibling does not settle the gate", () => {
    const best = bestKycAcross([row("deal-1", "gst_certificate", "received")], "deal-2");
    expect(kycMissing(best)).toEqual(["gst_certificate", "electricity_bill"]);
    expect(kycCounts(best)).toEqual({ total: 1, resolved: 0 });
  });

  it("nothing anywhere → nothing started", () => {
    expect(kycCounts(bestKycAcross([], "deal-1"))).toEqual({ total: 0, resolved: 0 });
  });
});
