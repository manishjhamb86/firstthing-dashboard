// Raw vendor meter files live under `Ingest/`, deliberately NOT under
// `Documents/` (src/lib/document-keys.ts).
//
// FEAT-047-AC-4 is the reason: a raw vendor file must not be reachable by a
// non-internal actor. The bucket's public-read statement is scoped to
// `Documents/*` (user's call, 2026-08-15), so anything under this prefix is
// private and readable only through a short-lived presigned GET issued by an
// admin-gated action. Everything already under `Documents/` keeps working
// exactly as before.
//
// Note the shape difference from the document convention: no society/doctype
// label in the filename, and an upload stamp in the path. A replacement
// upload for the same circuit and period must NOT overwrite the file it
// replaces — FEAT-047-AC-5 keeps both in the history with the supersession
// recorded, and a colliding key would silently destroy the earlier evidence.

function slug(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export function buildRawReadingKey(params: {
  society: string;
  period: string; // YYYY-MM — the operator's explicit selection (INV-04)
  circuitId: string;
  fileName: string;
  uploadedAt: Date;
}): string {
  const stamp = params.uploadedAt.toISOString().replace(/[:.]/g, "-");
  const name = slug(params.fileName.replace(/\.[^.]+$/, ""));
  const ext = (params.fileName.split(".").pop() ?? "csv").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  return `Ingest/${slug(params.society)}/${params.period}/${params.circuitId}/${stamp}_${name}.${ext}`;
}

/**
 * CON-45 — the circuit-page flow's raw files. Same private `Ingest/` prefix
 * and same no-collision rule; the path names the phase the system derived
 * (pre_install / post_install / monitoring) instead of an operator-chosen
 * month, because that is what this flow anchors on.
 */
export function buildCircuitFlowReadingKey(params: {
  society: string;
  phase: "pre_install" | "post_install" | "monitoring";
  circuitId: string;
  fileName: string;
  uploadedAt: Date;
}): string {
  const stamp = params.uploadedAt.toISOString().replace(/[:.]/g, "-");
  const name = slug(params.fileName.replace(/\.[^.]+$/, ""));
  const ext = (params.fileName.split(".").pop() ?? "csv").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  return `Ingest/${slug(params.society)}/${params.phase}/${params.circuitId}/${stamp}_${name}.${ext}`;
}
