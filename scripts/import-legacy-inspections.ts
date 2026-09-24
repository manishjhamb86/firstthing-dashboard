import "./load-env";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import type { InspectionSensorStatus } from "@prisma/client";
import { db } from "../src/lib/db";
import { s3, S3_BUCKET } from "../src/lib/s3";
import { buildDocumentKey } from "../src/lib/document-keys";

/**
 * One-time import of the old app's monthly inspections (2026-09-24,
 * user-asked) from its Supabase project into the Inspection /
 * InspectionFinding tables.
 *
 *   LEGACY_SUPABASE_URL=… LEGACY_SUPABASE_KEY=… npx tsx scripts/import-legacy-inspections.ts [--write]
 *
 * Credentials come from the environment only — never from this file.
 * Without --write it prints the plan and writes nothing. Re-runnable: rows
 * get deterministic ids (`legacy-insp-<old id>`), so a second run skips what
 * the first one wrote.
 *
 * Decisions, stated rather than implied:
 *  - The period is the inspection date's month. The old app never recorded
 *    a separate "month this visit is for" (INV-04's explicit selection), so
 *    the visit date is the only evidence there is.
 *  - Areas are spelling-cleaned ("Besment" → "Basement"); the text as the
 *    inspector typed it is kept in the notes.
 *  - "Replace Required" becomes OFF + to be replaced.
 *  - The faulty count is the findings themselves (the new model never stores
 *    it twice); where the old form's own count disagreed, the notes say so.
 */

// Old Supabase society id → stage society id. Matched by name; 11 and 30
// are the same society entered twice in the old app ("Amrapali princely" /
// "Princely Estate ": both Noida, same light count, forms in different months).
const SOCIETY: Record<number, string> = {
  3: "soc-arihant-arden",
  5: "soc-rg-residency",
  11: "soc-amrapali-princely-estate",
  17: "soc-elite-homz",
  18: "soc-aditya-urban-casa",
  19: "soc-arihant-ambar",
  20: "soc-french-apartment",
  21: "soc-aditya-mega-city",
  22: "soc-the-hyde-park",
  26: "soc-pearls-gateway-towers",
  27: "soc-gaur-saundaryam",
  28: "soc-ace-aspire",
  30: "soc-amrapali-princely-estate",
  31: "soc-ats-greens-paradiso",
};

// The one uploaded report that is actually a photo of a filed inspection
// (Arihant Arden, 26 June 2026) — attached to that visit as its signed checklist.
const EVIDENCE: Record<number, string> = {
  3: "/storage/v1/object/public/documents/inspection-reports/1782480229463-Inspection%20report%20for%20June%20arihant%20arden%20.jpeg",
};

const STATUS: Record<string, InspectionSensorStatus> = { OFF: "off", Dim: "dim", Flicker: "flicker", "Replace Required": "off" };

const ACTOR = "sys-data-import";

export function cleanArea(raw: string): string {
  return raw
    .trim()
    .replace(/\b(besment|bestest)\b/gi, "Basement")
    .replace(/\bstild\b/gi, "stilt")
    .replace(/(\d)and\b/gi, "$1 and")
    .replace(/\s+/g, " ");
}

type Form = {
  id: number;
  society_id: number;
  area: string;
  inspection_date: string;
  inspector_name: string;
  contact_number: string;
  total_lights_checked: number;
  faulty_lights: number;
};
type Item = { id: number; inspection_form_id: number; location: string; issue_type: string; remarks: string | null };

async function fetchTable<T>(table: string): Promise<T[]> {
  const url = process.env.LEGACY_SUPABASE_URL;
  const key = process.env.LEGACY_SUPABASE_KEY;
  if (!url || !key) throw new Error("Set LEGACY_SUPABASE_URL and LEGACY_SUPABASE_KEY.");
  const res = await fetch(`${url}/rest/v1/${table}?select=*&limit=10000`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`${table}: HTTP ${res.status}`);
  return (await res.json()) as T[];
}

async function main() {
  const write = process.argv.includes("--write");
  const forms = await fetchTable<Form>("inspection_forms");
  const items = await fetchTable<Item>("inspection_form_items");
  const societies = await db.society.findMany({ select: { id: true, name: true } });
  const societyName = new Map(societies.map((s) => [s.id, s.name]));

  let created = 0;
  let skipped = 0;
  for (const f of forms.sort((a, b) => a.id - b.id)) {
    const societyId = SOCIETY[f.society_id];
    if (!societyId || !societyName.has(societyId)) {
      console.log(`  ✗ form ${f.id}: no stage society for old society ${f.society_id}`);
      skipped++;
      continue;
    }
    const id = `legacy-insp-${f.id}`;
    const area = cleanArea(f.area);
    const period = f.inspection_date.slice(0, 7);
    const own = items.filter((i) => i.inspection_form_id === f.id).sort((a, b) => a.id - b.id);

    const existing = await db.inspection.findFirst({ where: { OR: [{ id }, { societyId, area, period, voidedAt: null }] }, select: { id: true } });
    if (existing) {
      console.log(`  · form ${f.id}: already present (${existing.id}) — skipped`);
      skipped++;
      continue;
    }

    const notes = [
      `Imported from the old app (form #${f.id}).`,
      f.area.trim() !== area ? `Area as recorded: "${f.area.trim()}".` : null,
      f.faulty_lights !== own.length ? `The old form stated ${f.faulty_lights} faulty; ${own.length} fixtures were listed.` : null,
    ]
      .filter(Boolean)
      .join(" ");

    console.log(
      `  + ${id}: ${societyName.get(societyId)} · ${area} · ${period} · ${f.inspection_date} · ${f.total_lights_checked} checked · ${own.length} faulty`,
    );
    if (!write) {
      created++;
      continue;
    }

    let evidencePhotoKey: string | null = null;
    const evidencePath = EVIDENCE[f.id];
    if (evidencePath) {
      const img = await fetch(`${process.env.LEGACY_SUPABASE_URL}${evidencePath}`);
      if (img.ok) {
        const bytes = new Uint8Array(await img.arrayBuffer());
        evidencePhotoKey = buildDocumentKey({
          society: societyName.get(societyId)!,
          month: period,
          docType: "inspectionEvidence",
          dateLabel: f.inspection_date,
          identifier: id,
          extension: "jpeg",
        });
        await s3.send(new PutObjectCommand({ Bucket: S3_BUCKET, Key: evidencePhotoKey, Body: bytes, ContentType: "image/jpeg" }));
      } else {
        console.log(`    ! evidence photo not fetched (HTTP ${img.status}) — imported without it`);
      }
    }

    await db.inspection.create({
      data: {
        id,
        societyId,
        area,
        period,
        inspectedAt: new Date(`${f.inspection_date}T00:00:00Z`),
        inspectorName: f.inspector_name.trim(),
        inspectorContact: f.contact_number.trim(),
        totalLightsChecked: f.total_lights_checked,
        notes,
        evidencePhotoKey,
        createdById: ACTOR,
        findings: {
          create: own.map((it, i) => ({
            id: `legacy-insp-item-${it.id}`,
            srNo: i + 1,
            location: it.location.trim(),
            sensorStatus: STATUS[it.issue_type] ?? "off",
            actionReplace: it.issue_type === "Replace Required",
            remarks: it.remarks?.trim() || null,
          })),
        },
      },
    });
    created++;
  }
  console.log(`${write ? "Wrote" : "Would write"} ${created} inspections; skipped ${skipped}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
