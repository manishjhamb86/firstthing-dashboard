"use client";

/**
 * A photo, as the field surface keeps it (05-field.md §0.3): downscaled on the
 * phone to a 1,600px long edge, JPEG at ~0.75, orientation applied, and the
 * location metadata GONE — re-encoding through a canvas writes none of the
 * original's EXIF, so the phone's GPS never leaves the phone inside a photo.
 * The original is not kept.
 *
 * If the browser cannot decode the file (an unusual format), the original is
 * kept as-is rather than losing the evidence.
 */
export async function preparePhoto(file: File): Promise<{ blob: Blob; contentType: string; fileName: string }> {
  const LONG_EDGE = 1600;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, LONG_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/jpeg", 0.75),
    );
    return { blob, contentType: "image/jpeg", fileName: "photo.jpg" };
  } catch {
    return { blob: file, contentType: file.type || "image/jpeg", fileName: file.name || "photo.jpg" };
  }
}
