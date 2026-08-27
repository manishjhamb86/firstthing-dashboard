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
front-page or stamp date), stampCertificateDate (the "Certificate Issued
Date" on the e-stamp certificate, page 1 — report it exactly as printed),
termMonths, firsthingSharePct, societySharePct,
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

/**
 * The free tier allows 20 requests a minute, and this job is 19 societies
 * times three documents. Hitting the ceiling is normal, not an error — the
 * API says how long to wait, so wait that long and carry on. Without this
 * the run dies a third of the way through and has to be nursed by hand.
 */
async function withRetry(fn, attempts = 6) {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      const msg = String(err?.message ?? err);
      const rateLimited = /429|quota|rate/i.test(msg);
      if (!rateLimited || i >= attempts) throw err;
      const stated = /retry in ([\d.]+)s/i.exec(msg)?.[1];
      const waitMs = Math.ceil((stated ? Number(stated) : 2 ** i) * 1000) + 1500;
      process.stderr.write(`rate limited; waiting ${Math.round(waitMs / 1000)}s (attempt ${i}/${attempts})\n`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
}

/**
 * The free tier's quota is per MODEL and is 20 requests a DAY, so an
 * exhausted model is not an exhausted key — but a run of 38 documents will
 * work through several. Ordered strongest first; the one that answered goes
 * to stderr, so a figure can be traced to the model that read it.
 *
 * Note "gemini-flash-latest" resolves to a concrete model (3.7 at the time of
 * writing) with its own separate allowance, which is why it is worth listing
 * alongside a pinned one rather than being a duplicate of it.
 */
const MODELS = ["gemini-3.6-flash", "gemini-flash-latest", "gemini-flash-lite-latest"];

async function readWith(model) {
  return withRetry(() =>
    ai.interactions.create({
      model,
      input: [
        { type: "text", text: PROMPTS[kind] },
        { type: "document", data: readFileSync(path).toString("base64"), mime_type: "application/pdf" },
      ],
      response_format: { type: "text", mime_type: "application/json" },
    }),
    // One wait, not six: a model whose daily quota is gone will never clear
    // inside this run, and the next model is right there.
    2,
  );
}

let res, lastErr;
for (const model of MODELS) {
  try {
    res = await readWith(model);
    process.stderr.write(`read by ${model}\n`);
    break;
  } catch (err) {
    lastErr = err;
    process.stderr.write(`${model} unavailable, trying the next\n`);
  }
}
if (!res) {
  // A raw SDK error here dumps the whole request — including the base64 of
  // the PDF — into the terminal. One line is what a person needs.
  const msg = String(lastErr?.message ?? lastErr).split("\n").slice(0, 3).join(" ");
  process.stderr.write(`\nno model could read this document: ${msg.slice(0, 300)}\n`);
  process.exit(1);
}
console.log(res.output_text);
