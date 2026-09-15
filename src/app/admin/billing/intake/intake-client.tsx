"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, ErrorText, StatusChip, type ChipTone } from "@/components/ui";
import { sniffKind } from "@/lib/file-signature";
import { createIntakeUpload, extractIntake } from "./actions";

export type IntakeRow = {
  id: string;
  fileName: string;
  fileSize: number;
  status: string;
  statusLabel: string;
  statusTone: ChipTone;
  society: string | null;
  period: string | null;
  invoiceNumber: string | null;
  total: number | null;
  uploadedAt: string;
  uploadedAgo: string;
  uploadedBy: string;
  note: string | null;
  calculationId: string | null;
};

type View = "review" | "ready" | "submitted" | "all";

function inr(n: number): string {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * SCR-093's client half: the dropzone and the status-partitioned list.
 *
 * Every file is its own row the moment it lands — the batch never waits for
 * its slowest file. The bytes go straight to S3 by presigned PUT (the pattern
 * since 2026-08-05) after a client-side sniff of the first bytes; the server
 * sniffs again and is the one that decides. Extraction is kicked off per
 * file and the list refreshes as each completes.
 */
export function IntakeClient({ rows, counts }: { rows: IntakeRow[]; counts: { needsReview: number; ready: number; submitted: number } }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<View>("review");
  const [refusals, setRefusals] = useState<string[]>([]);
  const [inFlight, setInFlight] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [, startTransition] = useTransition();

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;
    setRefusals([]);
    setInFlight((cur) => [...cur, ...list.map((f) => f.name)]);
    await Promise.all(
      list.map(async (file) => {
        try {
          const head = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
          if (sniffKind(head) !== "pdf") {
            setRefusals((cur) => [...cur, `${file.name} — not a PDF, not uploaded`]);
            return;
          }
          const headBase64 = btoa(String.fromCharCode(...head));
          const created = await createIntakeUpload({
            fileName: file.name,
            fileSize: file.size,
            contentType: "application/pdf",
            headBase64,
          });
          if (created.error) {
            setRefusals((cur) => [...cur, `${file.name} — ${created.error}`]);
            return;
          }
          const put = await fetch(created.uploadUrl!, {
            method: "PUT",
            body: file,
            headers: { "Content-Type": "application/pdf" },
          });
          if (!put.ok) {
            setRefusals((cur) => [...cur, `${file.name} — upload failed (${put.status}); retry`]);
            return;
          }
          startTransition(() => router.refresh());
          const extracted = await extractIntake(created.intakeId!);
          if (extracted.error) setRefusals((cur) => [...cur, `${file.name} — ${extracted.error}`]);
        } catch (err) {
          setRefusals((cur) => [...cur, `${file.name} — ${err instanceof Error ? err.message : "failed"}`]);
        } finally {
          setInFlight((cur) => cur.filter((n) => n !== file.name));
          startTransition(() => router.refresh());
        }
      }),
    );
  }

  const visible = rows.filter((r) => {
    if (view === "review") return r.status === "needs_review" || r.status === "could_not_read" || r.status === "reading" || r.status === "refused_duplicate";
    if (view === "ready") return r.status === "ready";
    if (view === "submitted") return r.status === "submitted";
    return true;
  });

  const chip = (key: View, label: string, n: number) => (
    <button
      key={key}
      type="button"
      onClick={() => setView(key)}
      className="rounded-full border px-3.5 py-1.5 text-xs font-semibold"
      style={
        view === key
          ? { background: "var(--chrome)", borderColor: "var(--chrome)", color: "var(--chrome-text)" }
          : { background: "var(--surface)", borderColor: "var(--border)", color: "var(--text-muted)" }
      }
    >
      {label} <span className="num opacity-80">{n}</span>
    </button>
  );

  return (
    <>
      <Card className="mb-4 p-2">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void handleFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          className="flex cursor-pointer flex-col items-center gap-2 rounded-[var(--r-sm)] border-[1.5px] border-dashed px-4 py-7 text-center"
          style={{
            borderColor: dragging ? "var(--accent)" : "var(--field-border)",
            background: dragging ? "var(--accent-subtle)" : "var(--surface-sunken)",
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) void handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <p className="font-semibold">Drop invoice PDFs — one or many</p>
          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
            Each file starts its own row as soon as it lands. PDF only, up to 20 MB each.
          </p>
          {inFlight.length > 0 && (
            <p className="text-[12.5px]" style={{ color: "var(--text-subtle)" }}>
              Uploading and reading {inFlight.length} file{inFlight.length === 1 ? "" : "s"}…
            </p>
          )}
          {refusals.length > 0 && (
            <div className="mt-1 w-full max-w-xl text-left">
              {refusals.map((r) => (
                <ErrorText key={r}>{r}</ErrorText>
              ))}
            </div>
          )}
        </div>
      </Card>

      <div className="mb-3.5 flex flex-wrap items-center gap-2">
        {chip("review", "Needs review", counts.needsReview)}
        {chip("ready", "Ready to submit", counts.ready)}
        {chip("submitted", "Submitted", counts.submitted)}
        {chip("all", "All", rows.length)}
      </div>

      <Card className="overflow-hidden">
        {visible.length === 0 ? (
          <p className="p-6 text-sm" style={{ color: "var(--text-muted)" }}>
            {rows.length === 0
              ? "Nothing in flight. Drop this month's invoices, or the whole backfill — one file per invoice."
              : view === "review"
                ? "Nothing needs review."
                : view === "ready"
                  ? "Nothing is ready to submit."
                  : "Nothing submitted yet."}
          </p>
        ) : (
          <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
            {visible.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{r.fileName}</p>
                  <p className="text-[12px]" style={{ color: "var(--text-subtle)" }}>
                    {(r.fileSize / 1024).toFixed(0)} KB
                    {r.invoiceNumber ? ` · ${r.invoiceNumber}` : ""} · {r.uploadedAgo} · {r.uploadedBy}
                  </p>
                </div>
                <div className="min-w-0 sm:w-56">
                  <p className="truncate text-sm">{r.society ?? <span style={{ color: "var(--text-subtle)" }}>Society not confirmed</span>}</p>
                  <p className="text-[12px]" style={{ color: "var(--text-subtle)" }}>{r.period ?? "Month not confirmed"}</p>
                </div>
                <div className="num text-right text-sm sm:w-28">{r.total !== null ? inr(r.total) : "—"}</div>
                <div className="sm:w-44">
                  <StatusChip tone={r.statusTone}>{r.statusLabel}</StatusChip>
                  {r.note && (
                    <p className="mt-1 text-[12px]" style={{ color: "var(--text-subtle)" }}>
                      {r.note}
                    </p>
                  )}
                </div>
                <div className="sm:w-28 sm:text-right">
                  {r.status === "submitted" && r.calculationId ? (
                    <Link href={`/admin/billing/${r.calculationId}`} className="btn-ghost btn-sm">
                      Open month
                    </Link>
                  ) : r.status === "reading" ? (
                    <span className="text-[12px]" style={{ color: "var(--text-subtle)" }}>
                      Reading…
                    </span>
                  ) : (
                    <Link href={`/admin/billing/intake/${r.id}`} className="btn-secondary btn-sm">
                      {r.status === "could_not_read" ? "Enter by hand" : r.status === "ready" ? "Review" : "Review"}
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
