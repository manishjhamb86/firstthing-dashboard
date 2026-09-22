"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, ErrorText, StatusChip, type ChipTone } from "@/components/ui";
import { Modal } from "@/components/modal";
import { sniffKind } from "@/lib/file-signature";
import { isZip, readZip } from "@/lib/zip-browser";
import { formatInstant } from "@/lib/format-date";
import {
  compareIntakes,
  INTAKE_SORTS,
  INTAKE_VIEWS,
  initialSortDir,
  intakeMatches,
  intakeViewOf,
  type IntakeSortKey,
  type IntakeView,
} from "@/lib/intake-list";
import { checkIntakeDuplicates, createIntakeUpload, extractIntake, retryIntake, submitReadyBatch, type IntakeDuplicate } from "./actions";

export type IntakeRow = {
  id: string;
  fileName: string;
  fileSize: number;
  status: string;
  statusLabel: string;
  statusTone: ChipTone;
  society: string | null;
  /** `YYYY-MM`, for sorting and the month filter; `period` is its label. */
  periodKey: string | null;
  period: string | null;
  invoiceNumber: string | null;
  total: number | null;
  uploadedAt: string;
  uploadedAtMs: number;
  uploadedAgo: string;
  uploadedBy: string;
  note: string | null;
  calculationId: string | null;
};

type View = IntakeView | "all";

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
export function IntakeClient({ rows }: { rows: IntakeRow[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  // Opens on the first chip that has work in it, in the order work flows.
  const [view, setView] = useState<View>(() => INTAKE_VIEWS.find((v) => rows.some((r) => intakeViewOf(r.status) === v.key))?.key ?? "all");
  const [query, setQuery] = useState("");
  const [societyFilter, setSocietyFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [sortKey, setSortKey] = useState<IntakeSortKey>("uploaded");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  const [refusals, setRefusals] = useState<string[]>([]);
  // What a dropped archive yielded — information, not a refusal.
  const [archiveNotes, setArchiveNotes] = useState<string[]>([]);
  const [inFlight, setInFlight] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [, startTransition] = useTransition();
  // Files already in the system, waiting for a reprocess-or-skip decision.
  const [pendingDupes, setPendingDupes] = useState<{ dupes: IntakeDuplicate[]; fresh: File[]; chosen: Set<string> } | null>(null);
  const [retrying, setRetrying] = useState<Set<string>>(new Set());
  // SCR-093's bulk bar — only `ready` rows are ever selectable.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [batchResult, setBatchResult] = useState<{ submitted: number; failed: { fileName: string; error: string }[] } | null>(null);

  async function sha256Hex(file: File): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  /**
   * Drop → fingerprint every file → ask the server which are already here →
   * upload only the new ones now; the rest wait for the reprocess-or-skip
   * choice (user-asked 2026-09-15: "do not give duplicate rows").
   */
  /**
   * A zip is opened here and its PDFs join the drop as if dropped loose
   * (user-asked 2026-09-16) — a month's invoices arrive from Zoho as one
   * archive. Anything in it that is not a PDF is named and left out.
   */
  async function expandArchives(list: File[]): Promise<{ files: File[]; notes: string[] }> {
    const files: File[] = [];
    const notes: string[] = [];
    for (const f of list) {
      const head = new Uint8Array(await f.slice(0, 4).arrayBuffer());
      if (!isZip(head)) {
        files.push(f);
        continue;
      }
      try {
        const zip = await readZip(new Uint8Array(await f.arrayBuffer()), (name) => /\.pdf$/i.test(name));
        for (const z of zip.files) files.push(new File([z.bytes as BlobPart], z.name, { type: "application/pdf" }));
        notes.push(
          `${f.name} — ${zip.files.length} PDF${zip.files.length === 1 ? "" : "s"} taken out${
            zip.skipped.length > 0 ? `; left out: ${zip.skipped.join(", ")}` : ""
          }`,
        );
        if (zip.files.length === 0) notes.push(`${f.name} — no PDFs inside`);
      } catch (err) {
        notes.push(`${f.name} — ${err instanceof Error ? err.message : "could not be opened"}`);
      }
    }
    return { files, notes };
  }

  async function handleFiles(files: FileList | File[]) {
    const dropped = Array.from(files);
    if (dropped.length === 0) return;
    setRefusals([]);
    const expanded = await expandArchives(dropped);
    setArchiveNotes(expanded.notes);
    const list = expanded.files;
    if (list.length === 0) return;
    const hashed = await Promise.all(list.map(async (file) => ({ file, hash: await sha256Hex(file) })));
    // The same file twice in one drop is one file.
    const unique = new Map<string, File>();
    for (const h of hashed) if (!unique.has(h.hash)) unique.set(h.hash, h.file);
    const check = await checkIntakeDuplicates([...unique.keys()]);
    if (check.error) {
      setRefusals((cur) => [...cur, check.error!]);
      return;
    }
    const dupeByHash = new Map(check.duplicates!.map((d) => [d.hash, d]));
    const fresh: File[] = [];
    const dupes: IntakeDuplicate[] = [];
    for (const [hash, file] of unique) {
      const d = dupeByHash.get(hash);
      if (d) dupes.push({ ...d, fileName: file.name });
      else fresh.push(file);
    }
    if (dupes.length > 0) {
      // Hold everything until the operator decides — the fresh files go up
      // with that decision, so the batch stays one act.
      setPendingDupes({ dupes, fresh, chosen: new Set() });
      return;
    }
    // One invoice: the operator wants its review, not a list of one
    // (user-asked 2026-09-15). A batch populates the list and is worked
    // through row by row.
    await uploadFresh(fresh, new Map([...unique].map(([h, f]) => [f, h])), fresh.length === 1);
  }

  async function uploadFresh(list: File[], hashes: Map<File, string>, openWhenDone = false) {
    if (list.length === 0) return;
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
            fileHash: hashes.get(file) ?? (await sha256Hex(file)),
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
          // A single invoice is read now and opened; a batch is only STORED
          // (user's call 2026-09-16) — the operator reads each row when they
          // come to it, so a dozen files never hit the reader's rate limit
          // at once.
          if (openWhenDone) {
            const extracted = await extractIntake(created.intakeId!);
            if (extracted.error) setRefusals((cur) => [...cur, `${file.name} — ${extracted.error}`]);
            router.push(`/admin/billing/intake/${created.intakeId}`);
          }
        } catch (err) {
          setRefusals((cur) => [...cur, `${file.name} — ${err instanceof Error ? err.message : "failed"}`]);
        } finally {
          setInFlight((cur) => cur.filter((n) => n !== file.name));
          startTransition(() => router.refresh());
        }
      }),
    );
  }

  async function retry(intakeId: string, fresh = false) {
    setRetrying((cur) => new Set(cur).add(intakeId));
    startTransition(() => router.refresh());
    try {
      const r = fresh ? await extractIntake(intakeId) : await retryIntake(intakeId);
      if (r.error) setRefusals((cur) => [...cur, r.error!]);
    } finally {
      setRetrying((cur) => {
        const next = new Set(cur);
        next.delete(intakeId);
        return next;
      });
      startTransition(() => router.refresh());
    }
  }

  async function resolveDupes() {
    const decision = pendingDupes;
    if (!decision) return;
    setPendingDupes(null);
    const toReprocess = decision.dupes.filter((d) => decision.chosen.has(d.intakeId) && d.reprocessable);
    const hashes = new Map<File, string>();
    for (const f of decision.fresh) hashes.set(f, await sha256Hex(f));
    await Promise.all([
      uploadFresh(decision.fresh, hashes, decision.fresh.length === 1 && toReprocess.length === 0),
      ...toReprocess.map((d) => retry(d.intakeId)),
    ]);
  }

  function toggleSelect(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submitReady() {
    setSubmitting(true);
    setBatchResult(null);
    try {
      const r = await submitReadyBatch([...selected]);
      setBatchResult({ submitted: r.submitted.length, failed: r.failed.map((f) => ({ fileName: f.fileName || "—", error: f.error })) });
      setSelected(new Set());
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  // The search, society and month filters narrow EVERY chip, so typing an
  // invoice number shows which chip its row sits under rather than "nothing
  // here" on the one that happens to be open (user-reported 2026-09-16: a
  // partially typed number could not find its row).
  const narrowed = useMemo(() => {
    const q = query.trim();
    return rows.filter(
      (r) =>
        (!societyFilter || r.society === societyFilter) &&
        (!monthFilter || r.periodKey === monthFilter) &&
        intakeMatches({ ...r, periodLabel: r.period }, q),
    );
  }, [rows, query, societyFilter, monthFilter]);

  const counts = useMemo(() => {
    const c: Record<View, number> = { unread: 0, review: 0, ready: 0, submitted: 0, all: narrowed.length };
    for (const r of narrowed) {
      const v = intakeViewOf(r.status);
      if (v) c[v] += 1;
    }
    return c;
  }, [narrowed]);

  const visible = useMemo(
    () => narrowed.filter((r) => view === "all" || intakeViewOf(r.status) === view).sort(compareIntakes(sortKey, sortDir)),
    [narrowed, view, sortKey, sortDir],
  );

  const societies = useMemo(() => [...new Set(rows.map((r) => r.society).filter((s): s is string => !!s))].sort(), [rows]);
  const months = useMemo(
    () =>
      [...new Map(rows.filter((r) => r.periodKey).map((r) => [r.periodKey!, r.period!])).entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)),
    [rows],
  );
  const filtering = query.trim() !== "" || societyFilter !== "" || monthFilter !== "";

  // Only `ready` rows are ever bulk-selectable (SCR-093: "a Needs review row
  // has no checkbox") — scoped to what's currently visible, so "select all"
  // matches what's on screen rather than every ready row in the system.
  const readyVisible = useMemo(() => visible.filter((r) => r.status === "ready"), [visible]);
  const allReadySelected = readyVisible.length > 0 && readyVisible.every((r) => selected.has(r.id));
  function toggleAllReady() {
    setSelected(allReadySelected ? new Set() : new Set(readyVisible.map((r) => r.id)));
  }

  // Clicking the sorted column reverses it; another column starts at its own natural end.
  function sortBy(key: IntakeSortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 1 ? -1 : 1));
      return;
    }
    setSortKey(key);
    setSortDir(initialSortDir(key));
  }

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
            accept="application/pdf,application/zip,.zip"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) void handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <p className="font-semibold">Drop invoice PDFs — one, many, or a zip of them</p>
          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
            Each PDF starts its own row as soon as it lands; a zip is opened here and its PDFs join the drop. Up to 20 MB each.
          </p>
          {inFlight.length > 0 && (
            <p className="text-[12.5px]" style={{ color: "var(--text-subtle)" }}>
              Uploading and reading {inFlight.length} file{inFlight.length === 1 ? "" : "s"}…
            </p>
          )}
          {archiveNotes.length > 0 && (
            <div className="mt-1 w-full max-w-xl text-left text-[12.5px]" style={{ color: "var(--text-muted)" }}>
              {archiveNotes.map((n) => (
                <p key={n}>{n}</p>
              ))}
            </div>
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
        {INTAKE_VIEWS.map((v) => chip(v.key, v.label, counts[v.key]))}
        {chip("all", "All", counts.all)}
      </div>

      <div className="mb-3.5 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search invoice number, file, society or month"
          aria-label="Search invoices"
          className="field field-auto min-w-[16rem] flex-1 text-sm"
        />
        <select
          value={societyFilter}
          onChange={(e) => setSocietyFilter(e.target.value)}
          aria-label="Filter by society"
          className="field field-auto text-sm"
        >
          <option value="">Every society</option>
          {societies.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} aria-label="Filter by month" className="field field-auto text-sm">
          <option value="">Every month</option>
          {months.map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        {filtering && (
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={() => {
              setQuery("");
              setSocietyFilter("");
              setMonthFilter("");
            }}
          >
            Clear
          </button>
        )}
      </div>

      {batchResult && (
        <div
          className="mb-3.5 rounded-[var(--r-sm)] border px-4 py-3 text-sm"
          style={
            batchResult.failed.length === 0
              ? { background: "var(--ok-bg)", borderColor: "var(--ok-line)", color: "var(--ok-fg)" }
              : { background: "var(--warn-bg)", borderColor: "var(--warn-line)", color: "var(--warn-fg)" }
          }
        >
          <p className="font-semibold">
            {batchResult.submitted} submitted{batchResult.failed.length > 0 ? `, ${batchResult.failed.length} refused` : ""}.
          </p>
          {batchResult.failed.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {batchResult.failed.map((f, i) => (
                <li key={i}>
                  {f.fileName}: {f.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {readyVisible.length > 0 && (
        <div className="mb-3.5 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={allReadySelected} onChange={toggleAllReady} />
            Select all ready ({readyVisible.length})
          </label>
          {selected.size > 0 && (
            <button type="button" className="btn-primary btn-sm" disabled={submitting} onClick={() => void submitReady()}>
              {submitting ? "Submitting…" : `Submit ${selected.size} ready`}
            </button>
          )}
        </div>
      )}

      <Card className="overflow-hidden">
        {visible.length === 0 ? (
          <p className="p-6 text-sm" style={{ color: "var(--text-muted)" }}>
            {rows.length === 0
              ? "Nothing in flight. Drop this month's invoices, or the whole backfill — one file per invoice."
              : filtering
                ? `No invoice matches${counts.all > 0 ? " under this chip — " + counts.all + " match under All" : ""}.`
                : (INTAKE_VIEWS.find((v) => v.key === view)?.empty ?? "Nothing here.")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th className="w-8" />
                  <SortHeader k="invoice" sortKey={sortKey} dir={sortDir} onSort={sortBy} />
                  <SortHeader k="society" sortKey={sortKey} dir={sortDir} onSort={sortBy} className="hidden md:table-cell" />
                  <SortHeader k="period" sortKey={sortKey} dir={sortDir} onSort={sortBy} className="hidden md:table-cell" />
                  <SortHeader k="total" sortKey={sortKey} dir={sortDir} onSort={sortBy} align="right" />
                  <SortHeader k="status" sortKey={sortKey} dir={sortDir} onSort={sortBy} />
                  <SortHeader k="uploaded" sortKey={sortKey} dir={sortDir} onSort={sortBy} className="hidden lg:table-cell" />
                  <th />
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const reviewHref = `/admin/billing/intake/${r.id}`;
                  return (
                    <tr key={r.id}>
                      <td>
                        {r.status === "ready" && (
                          <input
                            type="checkbox"
                            checked={selected.has(r.id)}
                            onChange={() => toggleSelect(r.id)}
                            aria-label={`Select ${r.invoiceNumber ?? r.fileName}`}
                          />
                        )}
                      </td>
                      <td className="max-w-[18rem] md:max-w-[26rem]">
                        <p className="truncate font-medium" title={r.fileName}>
                          {r.invoiceNumber ?? r.fileName}
                        </p>
                        <p className="truncate text-[12px]" style={{ color: "var(--text-subtle)" }}>
                          {r.invoiceNumber ? `${r.fileName} · ` : ""}
                          {(r.fileSize / 1024).toFixed(0)} KB · {r.uploadedAgo} · {r.uploadedBy}
                        </p>
                        <p className="text-[12px] md:hidden" style={{ color: "var(--text-subtle)" }}>
                          {r.society ?? "Society not confirmed"} · {r.period ?? "month not confirmed"}
                        </p>
                      </td>
                      <td className="hidden md:table-cell">
                        {r.society ?? <span style={{ color: "var(--text-subtle)" }}>Not confirmed</span>}
                      </td>
                      <td className="hidden whitespace-nowrap md:table-cell">
                        {r.period ?? <span style={{ color: "var(--text-subtle)" }}>Not confirmed</span>}
                      </td>
                      <td className="num whitespace-nowrap text-right">{r.total !== null ? inr(r.total) : "—"}</td>
                      <td className="max-w-[16rem]">
                        <StatusChip tone={r.statusTone}>{r.statusLabel}</StatusChip>
                        {r.note && (
                          <p className="mt-1 line-clamp-2 text-[12px]" style={{ color: "var(--text-subtle)" }} title={r.note}>
                            {r.note}
                          </p>
                        )}
                      </td>
                      <td className="hidden whitespace-nowrap text-[12.5px] lg:table-cell" style={{ color: "var(--text-muted)" }} title={r.uploadedAt}>
                        {r.uploadedAgo}
                      </td>
                      <td className="whitespace-nowrap text-right">
                        {r.status === "submitted" && r.calculationId ? (
                          <Link href={`/admin/billing/${r.calculationId}`} className="btn-ghost btn-sm">
                            Open month
                          </Link>
                        ) : r.status === "reading" ? (
                          <span className="text-[12px]" style={{ color: "var(--text-subtle)" }}>
                            Reading…
                          </span>
                        ) : r.status === "uploaded" ? (
                          <span className="inline-flex items-center gap-1.5">
                            <button type="button" className="btn-primary btn-sm" disabled={retrying.has(r.id)} onClick={() => void retry(r.id, true)}>
                              {retrying.has(r.id) ? "Reading…" : "Read"}
                            </button>
                            <Link href={reviewHref} className="btn-ghost btn-sm">
                              Enter by hand
                            </Link>
                          </span>
                        ) : r.status === "could_not_read" ? (
                          <span className="inline-flex items-center gap-1.5">
                            <button type="button" className="btn-secondary btn-sm" disabled={retrying.has(r.id)} onClick={() => void retry(r.id)}>
                              {retrying.has(r.id) ? "Reading…" : "Retry"}
                            </button>
                            <Link href={reviewHref} className="btn-ghost btn-sm">
                              Enter by hand
                            </Link>
                          </span>
                        ) : (
                          <Link href={reviewHref} className="btn-secondary btn-sm">
                            Review
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={pendingDupes !== null}
        onClose={() => setPendingDupes(null)}
        title="Some of these are already here"
        description="Tick the ones to read again on their existing row. Unticked files are skipped. Nothing is uploaded twice."
        size="wide"
      >
        {pendingDupes && (
          <>
            <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
              {pendingDupes.dupes.map((d) => (
                <li key={d.intakeId} className="flex items-start gap-3 py-2.5">
                  <input
                    type="checkbox"
                    className="mt-1"
                    disabled={!d.reprocessable}
                    checked={pendingDupes.chosen.has(d.intakeId)}
                    onChange={(e) =>
                      setPendingDupes((cur) => {
                        if (!cur) return cur;
                        const chosen = new Set(cur.chosen);
                        if (e.target.checked) chosen.add(d.intakeId);
                        else chosen.delete(d.intakeId);
                        return { ...cur, chosen };
                      })
                    }
                    aria-label={`Reprocess ${d.fileName}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{d.fileName}</p>
                    <p className="text-[12px]" style={{ color: "var(--text-subtle)" }}>
                      Uploaded {formatInstant(d.uploadedAt)} · {d.status.replace("_", " ")}
                      {d.society ? ` · ${d.society}` : ""}
                      {d.period ? ` · ${d.period}` : ""}
                    </p>
                    {!d.reprocessable && (
                      <p className="text-[12px]" style={{ color: "var(--warn-fg)" }}>
                        Already submitted as a month of record — void that month to change it; it cannot be reprocessed from here.
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {pendingDupes.fresh.length > 0 && (
              <p className="mt-3 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                {pendingDupes.fresh.length} new file{pendingDupes.fresh.length === 1 ? "" : "s"} in this drop will be uploaded either way.
              </p>
            )}
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" className="btn-ghost" onClick={() => setPendingDupes(null)}>
                Cancel the drop
              </button>
              <button type="button" className="btn-primary" onClick={() => void resolveDupes()}>
                {pendingDupes.chosen.size > 0
                  ? `Reprocess ${pendingDupes.chosen.size} and continue`
                  : pendingDupes.fresh.length > 0
                    ? "Skip these and upload the rest"
                    : "Skip these"}
              </button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}

/**
 * A sortable column header — the meters list's own, hoisted to module scope
 * rather than declared inside the list (a component declared in a render
 * body is a new type every render). The caret shows only on the sorted
 * column: an arrow on every header says nothing about which is in force.
 */
function SortHeader({
  k,
  sortKey,
  dir,
  onSort,
  align = "left",
  className,
}: {
  k: IntakeSortKey;
  sortKey: IntakeSortKey;
  dir: 1 | -1;
  onSort: (k: IntakeSortKey) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const active = k === sortKey;
  return (
    <th className={[align === "right" ? "text-right" : "", className ?? ""].join(" ").trim() || undefined} aria-sort={active ? (dir === 1 ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className="inline-flex items-center gap-1.5 hover:opacity-80"
        style={{ color: active ? "var(--text)" : "inherit", font: "inherit", letterSpacing: "inherit", textTransform: "inherit" }}
      >
        {INTAKE_SORTS[k].label}
        <span aria-hidden style={{ opacity: active ? 1 : 0.25 }}>
          {active ? (dir === 1 ? "↑" : "↓") : "↕"}
        </span>
      </button>
    </th>
  );
}
