import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin-permissions";
import type { OfferCircuitTerm } from "@/lib/offer";
import { SERVICE_LINE_LABEL } from "@/lib/status-maps";

// FEAT-029-AC-1 — "a document carrying exactly the accepted terms is produced
// for printing" (user's call, 2026-08-14: a print-styled route rather than a
// server-generated PDF). It renders straight from the accepted offer, so the
// printed paper and the record can never disagree — which is the property
// that actually matters here, more than the file format.
export default async function AgreementPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminPage();
  if (!session.user.adminPermissions?.includes("manage_pipeline")) redirect("/admin/pipeline");

  const { id } = await params;
  const pipeline = await db.pipeline.findUnique({
    where: { id },
    include: { society: true, agreement: { include: { offer: true } } },
  });
  if (!pipeline?.agreement) notFound();

  const offer = pipeline.agreement.offer;
  const circuits = (offer.circuitTerms as OfferCircuitTerm[]) ?? [];
  const exclusions = (offer.exclusions as string[]) ?? [];
  const amc = offer.amcTerms as { summary?: string } | null;

  return (
    <main className="print-doc mx-auto max-w-[820px] p-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Energy savings agreement</h1>
        <p className="text-sm mt-1">
          Between <strong>FirsThing</strong> and <strong>{pipeline.society.name}</strong>,{" "}
          {pipeline.society.location} — {SERVICE_LINE_LABEL[pipeline.serviceLine]}.
        </p>
        <p className="text-sm">Offer version {offer.version}, accepted on {offer.respondedAt?.toISOString().slice(0, 10) ?? "—"}.</p>
      </header>

      <section className="mb-8">
        <h2 className="text-base font-semibold mb-2">1. Commercial terms</h2>
        <table className="tbl">
          <tbody>
            <tr>
              <td>Revenue share</td>
              {/* Party-named on the printed document too — this split has
                  been shipped inverted twice in this project's history. */}
              <td className="num">
                {offer.revenueSharePct}% to the society, {100 - offer.revenueSharePct}% to FirsThing
              </td>
            </tr>
            <tr>
              <td>Tolerance band</td>
              <td className="num">±{offer.tolerancePct}%</td>
            </tr>
            <tr>
              <td>Contracted unit electricity rate</td>
              <td className="num">₹{offer.unitElectricityRate.toFixed(2)} per kWh</td>
            </tr>
            <tr>
              <td>Term</td>
              <td className="num">{offer.termMonths} months</td>
            </tr>
            <tr>
              <td>Contracted spare stock</td>
              <td className="num">{offer.spareStockCount}</td>
            </tr>
            <tr>
              <td>Benchmark basis</td>
              <td>
                {offer.benchmarkSource === "measured"
                  ? "Measured during the demo, per circuit (see section 2)"
                  : "Negotiated fixed percentage; consumption remains metered and monitored"}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-semibold mb-2">2. Per-circuit benchmarks</h2>
        <table className="tbl">
          <thead>
            <tr>
              <th>Light type</th>
              <th>Metered lights</th>
              <th>Lights represented</th>
              <th>Benchmark savings</th>
            </tr>
          </thead>
          <tbody>
            {circuits.map((c) => (
              <tr key={c.circuitId}>
                <td>
                  {c.lightType}
                  {c.location ? ` · ${c.location}` : ""}
                </td>
                <td className="num">{c.meteredLightCount}</td>
                <td className="num">{c.representedLightCount}</td>
                <td className="num">{c.benchmarkSavingsPct.toFixed(2)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {exclusions.length > 0 && (
        <section className="mb-8">
          <h2 className="text-base font-semibold mb-2">3. Exclusions</h2>
          <ul className="list-disc pl-6 text-sm">
            {exclusions.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </section>
      )}

      {amc?.summary && (
        <section className="mb-8">
          <h2 className="text-base font-semibold mb-2">4. Maintenance</h2>
          <p className="text-sm">{amc.summary}</p>
        </section>
      )}

      <section className="mt-16 grid grid-cols-2 gap-12 text-sm">
        <div>
          <div className="border-t pt-2" style={{ borderColor: "var(--text)" }}>
            For FirsThing
          </div>
        </div>
        <div>
          <div className="border-t pt-2" style={{ borderColor: "var(--text)" }}>
            For {pipeline.society.name} (office-bearer)
          </div>
        </div>
      </section>
    </main>
  );
}
