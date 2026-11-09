/**
 * One-off, real-infrastructure verification (2026-11-09) for the EMS
 * pump-room ingestion feature — built once, run once, kept for the audit
 * trail per this repo's own one-off-script convention.
 *
 * Builds two tiny, genuinely valid .xlsx files in memory (a minimal ZIP +
 * OOXML writer local to this script — the app itself only ever READS a
 * workbook, src/lib/xlsx.ts, so a writer has no place in src/), uploads each
 * to the real S3 bucket, and calls the REAL `applyIngestToMeter` against the
 * real dev Postgres for two consecutive days — proving the S3 round trip,
 * the Prisma composite-key upsert, and the cross-day differencing all work
 * together, not just that the pure functions are individually correct
 * (already covered by tests/pump-room-xlsx.test.ts and
 * tests/pump-room-ingest.test.ts).
 *
 * Every DB row created here is deleted at the end, confirmed by count. The
 * two S3 objects CANNOT be deleted by this app's own IAM credentials
 * (PutObject-only, by design — the same standing limitation recorded
 * throughout PROJECT_CONTEXT.md for every other verification pass in this
 * repo) and are listed at the end for manual cleanup if desired.
 *
 *   pnpm tsx scripts/verify-pump-room-ingest.ts
 */
import "./load-env";
import { deflateRawSync } from "node:zlib";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { db } from "../src/lib/db";
import { s3, S3_BUCKET } from "../src/lib/s3";
import { applyIngestToMeter } from "../src/lib/pump-room-ingest";

// ── minimal xlsx writer (verification-only, not part of src/) ────────────

function buildWorksheetXml(rows: [string, string][][]): string {
  const rowXml = rows
    .map((row, ri) => {
      const cells = row
        .map(([col, val]) => {
          const ref = `${col}${ri + 1}`;
          const n = Number(val);
          return Number.isFinite(n) && val.trim() !== "" && /^[-\d.]+$/.test(val.trim())
            ? `<c r="${ref}"><v>${val}</v></c>`
            : `<c r="${ref}" t="inlineStr"><is><t>${val}</t></is></c>`;
        })
        .join("");
      return `<row r="${ri + 1}">${cells}</row>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowXml}</sheetData></worksheet>`;
}

function crc32(buf: Buffer): number {
  let c: number;
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (crc ^ buf[i]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildXlsx(worksheetXml: string): Buffer {
  const files: Record<string, string> = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    "xl/worksheets/sheet1.xml": worksheetXml,
  };

  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const [name, content] of Object.entries(files)) {
    const nameBuf = Buffer.from(name, "utf8");
    const raw = Buffer.from(content, "utf8");
    const compressed = deflateRawSync(raw);
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(8, 8); // method: deflate
    local.writeUInt16LE(0, 10); // mod time
    local.writeUInt16LE(0, 12); // mod date
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    const localEntry = Buffer.concat([local, nameBuf, compressed]);
    localParts.push(localEntry);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0, 8); // flags
    central.writeUInt16LE(8, 10); // method
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(Buffer.concat([central, nameBuf]));

    offset += localEntry.length;
  }

  const localBuf = Buffer.concat(localParts);
  const centralBuf = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(Object.keys(files).length, 8);
  eocd.writeUInt16LE(Object.keys(files).length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(localBuf.length, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([localBuf, centralBuf, eocd]);
}

// ── the verification itself ───────────────────────────────────────────────

const LABEL = "Verify Pump Room — one-off";

async function main() {
  console.log("Building two tiny .xlsx fixtures…");
  const day1 = buildXlsx(
    buildWorksheetXml([
      [["A", "ts"], ["B", "kwh"], ["C", "total_flow"]],
      [["A", "2026-11-07 23:30"], ["B", "100"], ["C", "500"]],
    ]),
  );
  const day2 = buildXlsx(
    buildWorksheetXml([
      [["A", "ts"], ["B", "kwh"], ["C", "total_flow"]],
      [["A", "2026-11-08 23:30"], ["B", "118.5"], ["C", "512"]],
    ]),
  );

  const key1 = `Ingest/PumpRooms/_verify/${Date.now()}_day1.xlsx`;
  const key2 = `Ingest/PumpRooms/_verify/${Date.now()}_day2.xlsx`;
  console.log("Uploading to S3:", key1, key2);
  await s3.send(new PutObjectCommand({ Bucket: S3_BUCKET, Key: key1, Body: day1, ContentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  await s3.send(new PutObjectCommand({ Bucket: S3_BUCKET, Key: key2, Body: day2, ContentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));

  console.log("Creating disposable meter + ingest rows…");
  const meter = await db.emsPumpMeter.create({ data: { vendorSubjectLabel: LABEL, roomType: "domestic" } });
  const ingest1 = await db.emsPumpEmailIngest.create({
    data: { gmailMessageId: `verify-${Date.now()}-1`, subjectLabel: LABEL, receivedAt: new Date("2026-11-08T00:05:00Z"), s3Key: key1, fileHash: "x1", byteSize: day1.length, status: "needs_assignment" },
  });
  const ingest2 = await db.emsPumpEmailIngest.create({
    data: { gmailMessageId: `verify-${Date.now()}-2`, subjectLabel: LABEL, receivedAt: new Date("2026-11-09T00:05:00Z"), s3Key: key2, fileHash: "x2", byteSize: day2.length, status: "needs_assignment" },
  });

  console.log("Applying day 1 (no prior day — expect dailyKwh: null)…");
  await applyIngestToMeter(ingest1.id, meter.id);
  const r1 = await db.emsPumpReading.findUnique({ where: { pumpMeterId_date: { pumpMeterId: meter.id, date: new Date("2026-11-07T00:00:00Z") } } });
  console.log("  ->", r1 ? { lastKwh: r1.lastKwh, dailyKwh: r1.dailyKwh, registerWentBackwards: r1.registerWentBackwards } : "MISSING");
  if (!r1 || r1.lastKwh !== 100 || r1.dailyKwh !== null) throw new Error("Day 1 result did not match expectation.");

  console.log("Applying day 2 (prior = 100 -> expect dailyKwh: 18.5)…");
  await applyIngestToMeter(ingest2.id, meter.id);
  const r2 = await db.emsPumpReading.findUnique({ where: { pumpMeterId_date: { pumpMeterId: meter.id, date: new Date("2026-11-08T00:00:00Z") } } });
  console.log("  ->", r2 ? { lastKwh: r2.lastKwh, dailyKwh: r2.dailyKwh, registerWentBackwards: r2.registerWentBackwards } : "MISSING");
  if (!r2 || r2.lastKwh !== 118.5 || r2.dailyKwh !== 18.5) throw new Error("Day 2 result did not match expectation.");

  const meterAfter = await db.emsPumpMeter.findUnique({ where: { id: meter.id } });
  console.log("Meter cache refreshed ->", { lastKwh: meterAfter?.lastKwh, lastTotalFlow: meterAfter?.lastTotalFlow });
  if (meterAfter?.lastKwh !== 118.5 || meterAfter?.lastTotalFlow !== 512) throw new Error("Meter cache did not refresh correctly.");

  const ingests = await db.emsPumpEmailIngest.findMany({ where: { subjectLabel: LABEL } });
  console.log("Ingest statuses ->", ingests.map((i) => i.status));
  if (!ingests.every((i) => i.status === "applied")) throw new Error("Not every ingest ended up applied.");

  console.log("PASS — cleaning up DB rows (S3 objects cannot be deleted by this app's PutObject-only credentials)…");
  await db.emsPumpReading.deleteMany({ where: { pumpMeterId: meter.id } });
  await db.emsPumpEmailIngest.deleteMany({ where: { subjectLabel: LABEL } });
  await db.emsPumpMeter.delete({ where: { id: meter.id } });
  const left = await db.emsPumpMeter.count({ where: { vendorSubjectLabel: LABEL } });
  console.log("Confirmed removed — remaining rows with this label:", left);
  console.log("Leftover S3 objects (manual cleanup only):", key1, key2);
}

main()
  .then(() => db.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await db.$disconnect();
    process.exit(1);
  });
