/**
 * A minimal ZIP reader for the BROWSER — enough to pull the files out of an
 * archive dropped on an upload zone (user-asked 2026-09-16: "accept zip files
 * also" on the invoice intake). The server-side twin is xlsx.ts's container
 * reader; this one cannot share it because that inflates through node:zlib.
 * Inflation here is the platform's own `DecompressionStream("deflate-raw")`.
 *
 * Reads the central directory, then each entry's local header. Directories,
 * and anything the caller's filter declines, are skipped. Encrypted or
 * unsupported-method entries are reported by name rather than silently
 * dropped. Zip64 is out of scope — nobody's month of invoices is 4 GB.
 */

export type ZipFile = { name: string; bytes: Uint8Array };
export type ZipResult = { files: ZipFile[]; skipped: string[] };

export function isZip(head: Uint8Array): boolean {
  return head.length >= 4 && head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function readZip(bytes: Uint8Array, keep: (name: string) => boolean): Promise<ZipResult> {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0 && i > bytes.length - 22 - 0xffff; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a zip archive.");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const files: ZipFile[] = [];
  const skipped: string[] = [];
  const decoder = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error("Corrupt zip central directory.");
    const flags = dv.getUint16(p + 8, true);
    const method = dv.getUint16(p + 10, true);
    const compressedSize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const localOffset = dv.getUint32(p + 42, true);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;

    const base = name.split("/").pop() ?? name;
    if (name.endsWith("/") || base.startsWith(".") || name.startsWith("__MACOSX/")) continue;
    if (!keep(base)) {
      skipped.push(base);
      continue;
    }
    if (flags & 0x1) {
      skipped.push(`${base} (encrypted)`);
      continue;
    }
    if (method !== 0 && method !== 8) {
      skipped.push(`${base} (unsupported compression)`);
      continue;
    }
    // The local header repeats the name/extra with its own lengths.
    const lNameLen = dv.getUint16(localOffset + 26, true);
    const lExtraLen = dv.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + lNameLen + lExtraLen;
    const raw = bytes.subarray(start, start + compressedSize);
    files.push({ name: base, bytes: method === 0 ? raw : await inflateRaw(raw) });
  }
  return { files, skipped };
}
