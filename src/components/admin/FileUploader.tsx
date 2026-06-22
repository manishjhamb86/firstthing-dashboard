"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabase";

type Props = {
  folder: string;
  onUploadComplete: (url: string) => void;
};

export default function FileUploader({
  folder,
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
      const fileName = `${Date.now()}-${file.name}`;
      const filePath = `${folder}/${fileName}`;

      const { data: uploadData, error: uploadError } =
        await supabase.storage
          .from("documents")
          .upload(filePath, file);

      console.log("UPLOAD DATA:", uploadData);
      console.log("UPLOAD ERROR:", uploadError);

      if (uploadError) {
        alert(uploadError.message);
        setUploading(false);
        return;
      }

      const { data: publicUrlData } =
        supabase.storage
          .from("documents")
          .getPublicUrl(filePath);

      console.log(
        "PUBLIC URL:",
        publicUrlData.publicUrl
      );

      onUploadComplete(
        publicUrlData.publicUrl
      );

      alert("PDF uploaded successfully");
    } catch (err) {
      console.error(err);
      alert("Upload failed");
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