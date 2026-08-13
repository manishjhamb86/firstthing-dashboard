"use client";

import { useRef, useState } from "react";
import { UploadCloud, FileText } from "lucide-react";

export default function FileDropzone({
  file,
  onFileSelect,
  accept = ".pdf",
  hint = "PDF, up to 10MB",
  statusText,
  toneColor = "var(--ac)",
}: {
  file: File | null;
  onFileSelect: (file: File) => void;
  accept?: string;
  hint?: string;
  statusText?: string;
  toneColor?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function handleFiles(files: FileList | null) {
    const selected = files?.[0];
    if (selected) onFileSelect(selected);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        handleFiles(e.dataTransfer.files);
      }}
      className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[14px] border-2 border-dashed px-6 py-8 text-center transition-colors"
      style={{
        borderColor: dragOver ? toneColor : "var(--bd3)",
        background: dragOver ? "var(--card3)" : "var(--card2)",
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <div
        className="flex h-11 w-11 items-center justify-center rounded-full"
        style={{ background: dragOver ? toneColor : "var(--card3)", color: dragOver ? "var(--onac)" : "var(--m1)" }}
      >
        {file ? <FileText size={20} /> : <UploadCloud size={20} />}
      </div>
      {file ? (
        <>
          <div className="text-sm font-semibold text-ink">{file.name}</div>
          <div className="text-[11px] text-m2">{statusText ?? "Click to choose a different file"}</div>
        </>
      ) : (
        <>
          <div className="text-sm font-semibold text-ink">Click to upload or drag and drop</div>
          <div className="text-[11px] text-m2">{hint}</div>
        </>
      )}
    </div>
  );
}
