import { db } from "@/lib/db";
import type { DemoReportCircuit } from "@/lib/demo-report";
import type { OfferCircuitTerm } from "@/lib/offer";

/**
 * The rows an offer worksheet starts from, per light type (CON-11).
 *
 * With a demo report, the rows are its snapshot — metered count, baseline and
 * measured benchmark — so the offer prices on exactly what the society was
 * shown. Without one (the CON-25 demo-skip path) the rows are the survey's
 * live circuits, carrying whatever the circuit record already holds; a row
 * with no baseline asks the operator to type what those lights burn today.
 */
export type OfferBaseRow = {
  circuitId: string;
  lightType: string;
  location: string | null;
  meteredLightCount: number;
  /** The circuit's own represented count today — the worksheet's default population. */
  representedLightCount: number;
  preInstallBaseline: number | null;
  demoBenchmarkSavingsPct: number | null;
};

export async function offerBaseRows(pipelineId: string): Promise<{ rows: OfferBaseRow[]; demoReportId: string | null }> {
  const pipeline = await db.pipeline.findUnique({
    where: { id: pipelineId },
    select: {
      demoReports: { orderBy: { version: "desc" }, take: 1, select: { id: true, circuitSnapshot: true } },
      siteSurvey: {
        select: {
          circuits: {
            where: { voidedAt: null },
            orderBy: { lightType: "asc" },
            select: {
              id: true,
              lightType: true,
              location: true,
              meteredLightCount: true,
              representedLightCount: true,
              preInstallBaseline: true,
              benchmarkSavingsPct: true,
            },
          },
        },
      },
    },
  });
  const report = pipeline?.demoReports[0] ?? null;
  const live = new Map((pipeline?.siteSurvey?.circuits ?? []).map((c) => [c.id, c]));
  if (report) {
    const snap = (report.circuitSnapshot as DemoReportCircuit[] | null) ?? [];
    return {
      demoReportId: report.id,
      rows: snap.map((c) => ({
        circuitId: c.circuitId,
        lightType: c.lightType,
        location: c.location,
        meteredLightCount: c.meteredLightCount,
        // The live record wins for the default population: a count corrected
        // after the report was generated is what the agreement is about.
        representedLightCount: live.get(c.circuitId)?.representedLightCount ?? c.representedLightCount,
        preInstallBaseline: c.preInstallBaseline,
        demoBenchmarkSavingsPct: c.benchmarkSavingsPct,
      })),
    };
  }
  return {
    demoReportId: null,
    rows: [...live.values()].map((c) => ({
      circuitId: c.id,
      lightType: c.lightType,
      location: c.location,
      meteredLightCount: c.meteredLightCount,
      representedLightCount: c.representedLightCount,
      preInstallBaseline: c.preInstallBaseline,
      demoBenchmarkSavingsPct: c.benchmarkSavingsPct,
    })),
  };
}

/** The worksheet's per-row inputs as an existing offer recorded them — what a draft's form reopens on. */
export function worksheetInputsFromTerms(terms: OfferCircuitTerm[]) {
  return terms.map((t) => ({
    circuitId: t.circuitId,
    agreedLightCount: t.representedLightCount,
    agreedBenchmarkSavingsPct: t.benchmarkSavingsPct,
    preInstallKwhPerDay: t.preInstallKwhPerDay ?? null,
  }));
}
