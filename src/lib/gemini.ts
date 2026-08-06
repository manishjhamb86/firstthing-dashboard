import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// The @google/genai package's own bundled README examples use "gemini-2.5-flash",
// but that's confirmed dead against the live API as of 2026-08-05 ("no longer
// available to new users") — this is the current model per ai.google.dev.
const MODEL = "gemini-3.6-flash";

export async function extractDocumentFields<T>(params: {
  fileBuffer: Buffer;
  mimeType: string;
  prompt: string;
  schema: Record<string, unknown>;
}): Promise<T> {
  const interaction = await ai.interactions.create({
    model: MODEL,
    input: [
      { type: "text", text: params.prompt },
      { type: "document", data: params.fileBuffer.toString("base64"), mime_type: params.mimeType },
    ],
    response_format: { type: "text", mime_type: "application/json", schema: params.schema },
  });

  if (!interaction.output_text) {
    throw new Error("Gemini returned no output");
  }

  return JSON.parse(interaction.output_text) as T;
}
