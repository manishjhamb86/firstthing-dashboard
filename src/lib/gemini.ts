import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Ported from archive/src/lib/gemini.ts. The @google/genai package's own
// bundled README examples use "gemini-2.5-flash", which is confirmed dead
// against the live API ("no longer available to new users") — don't trust the
// installed SDK's README for a model name, verify against a real call.
const MODEL = "gemini-3.6-flash";

/**
 * Structure inference over a *sample* of a text file.
 *
 * The archived app sent whole PDFs inline and let the model return the
 * extracted values. That shape is wrong for CON-30's meter CSVs, for two
 * reasons that both matter:
 *
 *   1. Volume. One circuit-month of hourly readings is ~720 rows, and the
 *      real ingest is ~90 circuits a month today and 800+ at GOAL-07.
 *      Sending the bulk data to a model, per file, every month, is a cost
 *      and latency profile nobody wants.
 *   2. Reproducibility. INV-02 requires every figure to trace back to the
 *      file that produced it. A model that transforms the rows itself makes
 *      that transform unrepeatable — re-running it could produce different
 *      numbers from the same file, and the provenance chain FEAT-047 exposes
 *      would be a chain to something we can't recompute.
 *
 * So the model only ever proposes a *mapping* over a sample, and
 * `reading-normalize.ts` applies that mapping deterministically to the whole
 * file. The mapping is persisted (FEAT-047-AC-1), which makes normalisation
 * replayable from the raw file alone.
 */
export async function inferStructure<T>(params: {
  sample: string;
  prompt: string;
  schema: Record<string, unknown>;
}): Promise<T> {
  const interaction = await ai.interactions.create({
    model: MODEL,
    input: [{ type: "text", text: `${params.prompt}\n\n---\n${params.sample}\n---` }],
    response_format: { type: "text", mime_type: "application/json", schema: params.schema },
  });

  if (!interaction.output_text) throw new Error("Gemini returned no output");
  return JSON.parse(interaction.output_text) as T;
}

/**
 * What the model actually gets to see: the head and tail of the file plus a
 * row count. The tail matters — vendor exports sometimes carry a totals row
 * or a footer, and a mapping inferred from the head alone would silently
 * treat it as a reading.
 */
export function sampleForInference(text: string, headRows = 25, tailRows = 5): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length <= headRows + tailRows) {
    return `Total lines: ${lines.length}\n${lines.join("\n")}`;
  }
  return [
    `Total lines: ${lines.length}`,
    ...lines.slice(0, headRows),
    `… ${lines.length - headRows - tailRows} more lines omitted …`,
    ...lines.slice(-tailRows),
  ].join("\n");
}
