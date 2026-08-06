import { getUploadUrl } from "./uploads";
import type { DocType } from "./document-keys";

export async function uploadFileToS3(
  file: File,
  params: {
    society: string;
    month: string; // YYYY-MM, an explicit user selection
    docType: DocType;
    dateLabel: string;
    identifier?: string;
  }
): Promise<string> {
  if (!params.society || !params.month) {
    throw new Error("Select a society and month before uploading.");
  }

  const contentType = file.type || "application/pdf";
  const extension = file.name.split(".").pop() || "pdf";

  const { uploadUrl, publicUrl } = await getUploadUrl({
    ...params,
    extension,
    contentType,
  });

  const putResponse = await fetch(uploadUrl, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": contentType },
  });

  if (!putResponse.ok) {
    throw new Error("Upload failed");
  }

  return publicUrl;
}
