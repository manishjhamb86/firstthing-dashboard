"use client";

import { useState } from "react";
import { uploadFileToS3 } from "@/lib/upload-to-s3";
import type { DocType } from "@/lib/document-keys";

type Props = {
  society: string;
  month: string; // YYYY-MM, an explicit selection made in the parent form
  docType: DocType;
  dateLabel: string; // YYYY-MM-DD or YYYY-MM, used in the stored filename
  identifier?: string; // e.g. invoice number
  onUploadComplete: (url: string) => void;
};

export default function FileUploader({
  society,
  month,
  docType,
  dateLabel,
  identifier,
  onUploadComplete,
}: Props) {
  const [uploading, setUploading] = useState(false);

  async function handleUpload(
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = e.target.files?.[0];

    if (!file) return;

    setUploading(true);

    try {
      const publicUrl = await uploadFileToS3(file, { society, month, docType, dateLabel, identifier });
      onUploadComplete(publicUrl);
      alert("PDF uploaded. Complete the form and click the save button.");
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Upload failed");
    }

    setUploading(false);
  }

  return (
    <div className="space-y-2">
      <input
        type="file"
        accept=".pdf"
        onChange={handleUpload}
        className="border rounded-lg md:rounded-xl p-2 md:p-3 w-full text-xs md:text-base cursor-pointer file:cursor-pointer file:bg-blue-500 file:text-white file:border-0 file:rounded-md file:px-3 file:py-1 file:text-xs md:file:text-sm"
      />

      {uploading && (
        <p className="text-xs md:text-sm text-gray-500">
          Uploading PDF...
        </p>
      )}
    </div>
  );
}
