/**
 * Read one document for the one-time backfill of the 19 pre-system societies.
 *
 *   node scripts/read-backfill-doc.mjs <agreement|report|invoice> <file.pdf>
 *
 * Tooling for a manual job, deliberately not part of the app: it asks for
 * exactly the fields docs/backfill/*.csv need, demands the document's own
 * words behind every figure so each one can be checked, and is told to
 * answer "not stated" rather than infer. Contradictions and genuine
 * ambiguities come back as `conflicts` and `questions` instead of being
 * silently resolved.
 */
import { readFileSync } from "node:fs";
import { GoogleGenAI } from "@google/genai";

let key = "";
for (const f of [".env", ".env.local"]) {
  try {
    const m = /^GEMINI_API_KEY=(.+)$/m.exec(readFileSync(f, "utf8"));
    if (m) key = m[1].trim().replace(/^["']|["']$/g, "");
  } catch {}
}
if (!key) throw new Error("no GEMINI_API_KEY in .env or .env.local");

const COMMON = `Report ONLY what the document states. Use null for anything absent, and
never infer or compute a figure the document does not print. Every field is
an object {value, sourceText} where sourceText is the document's own words,
verbatim and short. Also return "conflicts" (an array of strings, one per
place the document contradicts itself) and "questions" (an array of
{question, because, options}) for anything a person must settle.`;

const PROMPTS = {
  agreement: `You are reading a signed energy-savings agreement between FirsThing and a
residential society in India. ${COMMON}

Fields: societyName, contactName, contactPhone, agreementSignedOn (the
front-page or stamp date), termMonths, firsthingSharePct, societySharePct,
tolerancePct (the permitted +/- on the SAVINGS percentage), unitRateInr
(rupees per kWh), monthlyFeeInr (the service charge excluding GST),
benchmarkedMonthlySavingsInr, agreedSavingsPct, contractedLightCount,
termStartBasis (quote what the term runs FROM).`,

  report: `You are reading a post-installation energy savings report for one metered
lighting circuit at a residential society in India. ${COMMON}

Fields: societyName, circuitLocation (the area served), meterInstalledOn,
lightsReplacedOn, baselineKwhPerDay (average daily consumption BEFORE),
afterKwhPerDay (AFTER), savingsPct, representedLightCount.

Plus "fixtures": an array of {label, count, watts, hoursPerDay, retrofitted,
sourceText}, one per KIND of fixture on the circuit — retrofitted false for
one that shares the circuit but was not replaced. Plus "dailyReadings": an
array of {date, kWh, phase} for every daily reading printed in a table,
phase "before" or "after".`,

  invoice: `You are reading FirsThing's invoice to a residential society in India for its
share of measured energy savings. ${COMMON}

Fields: societyName, billingAddress (the society's full postal address as
printed, on one line), gstin (the society's GST number if shown),
invoiceNumber, invoiceDate, billingPeriodFrom,
billingPeriodTo, daysBilled (how many days this invoice covers — if it says
so, or if the period implies it, report it and quote the period),
lightCount (the number of lights the invoice bills against),
savedKwh, unitRateInr, savingsValueInr, firsthingSharePct, amountBeforeTaxInr,
gstInr, totalInr.`,
};

const [kind, path] = process.argv.slice(2);
if (!PROMPTS[kind]) throw new Error(`kind must be one of: ${Object.keys(PROMPTS).join(", ")}`);

const ai = new GoogleGenAI({ apiKey: key });
const res = await ai.interactions.create({
  model: "gemini-3.6-flash",
  input: [
    { type: "text", text: PROMPTS[kind] },
    { type: "document", data: readFileSync(path).toString("base64"), mime_type: "application/pdf" },
  ],
  response_format: { type: "text", mime_type: "application/json" },
});
console.log(res.output_text);
