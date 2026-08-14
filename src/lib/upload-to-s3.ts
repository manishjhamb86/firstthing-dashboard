import { getUploadUrl } from "@/app/admin/uploads";
import type { DocType } from "./document-keys";

// Browser-side half of the presigned-PUT flow: ask the server for a
// short-lived URL, then PUT the bytes straight to S3. Returns the *key*, not
// a URL — the key is what gets stored, so the bucket's public/private posture
// can change later without touching any row.
export async function uploadFileToS3(
  file: File,
  params: { society: string; month: string; docType: DocType; dateLabel: string; identifier?: string },
): Promise<string> {
  if (!params.society || !params.month) {
    throw new Error("Select a society and a document period before uploading.");
  }

  const contentType = file.type || "application/pdf";
  const extension = file.name.split(".").pop() || "pdf";

  const { uploadUrl, key } = await getUploadUrl({ ...params, extension, contentType });

  const res = await fetch(uploadUrl, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": contentType },
  });
  if (!res.ok) throw new Error(`Upload failed (${res.status}).`);

  return key;
}
