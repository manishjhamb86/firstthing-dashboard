"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, ErrorText, StatusChip, type ChipTone } from "@/components/ui";
import { Modal } from "@/components/modal";
import { sniffKind } from "@/lib/file-signature";
import { isZip, readZip } from "@/lib/zip-browser";
import { formatDate, formatInstant } from "@/lib/format-date";
import {
  compareIntakes,
  INTAKE_SORTS,
  INTAKE_TABS,
  INTAKE_VIEWS,
  TODO_VIEWS,
  initialSortDir,
  intakeFilterMatches,
  intakeTabOf,
  tabOfFilter,
  intakeMatches,
  intakeViewOf,
  intakeFiltersQuery,
  INTAKE_LIST_PATH,
  INTAKE_LIST_RETURN_KEY,
  type IntakeFilters,
  type IntakeSortKey,
  type IntakeTab,
  type IntakeView,
} from "@/lib/intake-list";
import { READ_CUT_OFF_MESSAGE } from "@/lib/intake-read-error";
import { BULK_LABEL, bulkActionsFor, type BulkAction } from "@/lib/intake-bulk";
import {
  checkIntakeDuplicates,
  createIntakeUpload,
  extractIntake,
  fileIntakesAsDocuments,
  releaseIntakesToSociety,
  retryIntake,
  submitReadyBatch,
  unfileIntake,
  type IntakeDuplicate,
} from "./actions";

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
  /** The filed StoredDocument's own id — "View document" opens this. */
  filedDocumentId: string | null;
  /** Set only for a retail sale's row — the customer it was filed against. */
  retailCustomerId: string | null;
  /** The review's own confirmed society and month — what filing is keyed on. */
  hasSociety: boolean;
  hasPeriod: boolean;
  /** Fetched from Zoho Invoice rather than dropped as a PDF (2026-09-30). */
  fromZoho: boolean;
  /** Changed in Zoho since it was fetched — fetch it again from its page. */
  zohoChanged: boolean;
  /** Null when there's nothing to show yet (not submitted, or a filed
   *  document copy with no payment lifecycle). Service-line overdue states
   *  all ring "bad" — the user's "overdue invoices clearly visible in red". */
  paymentStatus: { label: string; tone: ChipTone } | null;
  /** `YYYY-MM-DD` — the live bill's due date, else the review's. */
  dueDate: string | null;
};

type View = IntakeView | IntakeTab;

// No ".00" on a whole-rupee total (2026-11-27 redesign); paise only when there are some.
function inr(n: number): string {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: n % 1 === 0 ? 0 : 2, minimumFractionDigits: n % 1 === 0 ? 0 : 2 })}`;
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
export function IntakeClient({
  rows,
  initialFilters,
  canRelease,
}: {
  rows: IntakeRow[];
  initialFilters: IntakeFilters;
  /** Holds release_billing — the accountant's act (CON-33). */
  canRelease: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  // Opens on To do (2026-11-27 redesign) — always the same tab, so the
  // landing page stays predictable (2026-09-24's reason for opening on All),
  // and it is the one that holds work.
  // Starting values come from the URL (the page parses them), so a return
  // from a review lands on the same filtered list (user-reported 2026-09-25).
  const [view, setView] = useState<View>(initialFilters.view);
  const [query, setQuery] = useState(initialFilters.q);
  const [societyFilter, setSocietyFilter] = useState(initialFilters.society);
  const [monthFilter, setMonthFilter] = useState(initialFilters.month);
  const [sortKey, setSortKey] = useState<IntakeSortKey>(initialFilters.sort);
  const [sortDir, setSortDir] = useState<1 | -1>(initialFilters.dir);
  // Independent of the view chips (2026-10-15, user-asked): "which of these
  // need chasing for money" is a different question from "where is this in
  // processing", so it combines with any status chip rather than being one.
  const [overdueOnly, setOverdueOnly] = useState(initialFilters.overdue);

  // Mirror the filters into the URL (replace, not push — a filter change is
  // not a page the Back button should step through) and remember that URL
  // for this tab, so the review page's own return goes back to it.
  useEffect(() => {
    const href = `${INTAKE_LIST_PATH}${intakeFiltersQuery({ view, q: query, society: societyFilter, month: monthFilter, sort: sortKey, dir: sortDir, overdue: overdueOnly })}`;
    if (`${window.location.pathname}${window.location.search}` !== href) window.history.replaceState(window.history.state, "", href);
    try {
      window.sessionStorage.setItem(INTAKE_LIST_RETURN_KEY, href);
    } catch {
      // Storage can be unavailable (private mode); the URL alone still works.
    }
  }, [view, query, societyFilter, monthFilter, sortKey, sortDir, overdueOnly]);
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
  const [batchResult, setBatchResult] = useState<{ verb: string; done: number; failed: { fileName: string; error: string }[] } | null>(null);

  // Reverses "filed as document" so the row can be resubmitted as a real
  // billed month instead (2026-10-02, user-asked).
  const [unfileTarget, setUnfileTarget] = useState<{ id: string; fileName: string } | null>(null);
  const [unfileReason, setUnfileReason] = useState("");
  const [unfilePending, setUnfilePending] = useState(false);
  const [unfileError, setUnfileError] = useState<string | null>(null);
  async function confirmUnfile() {
    if (!unfileTarget) return;
    setUnfilePending(true);
    setUnfileError(null);
    const r = await unfileIntake(unfileTarget.id, unfileReason);
    setUnfilePending(false);
    if (r.error) {
      setUnfileError(r.error);
      return;
    }
    setUnfileTarget(null);
    setUnfileReason("");
    router.refresh();
  }

  // The background sweep (job-worker.ts) reads a row on its own timer,
  // independent of any open tab — without this, a row it just started
  // reading would still show "Read", inviting a second, wasted attempt on
  // the same invoice (user-asked 2026-09-24: "that should prevent the
  // frontend user to click read button and instead show reading"). Polling
  // is scoped to WHILE there is actually a backlog for the sweep to work
  // through — once every row has moved past "uploaded"/"reading", it stops
  // rather than refreshing an admin page forever for no reason.
  const hasPendingReads = useMemo(() => rows.some((r) => r.status === "uploaded" || r.status === "reading"), [rows]);
  useEffect(() => {
    if (!hasPendingReads) return;
    const id = setInterval(() => startTransition(() => router.refresh()), 10_000);
    return () => clearInterval(id);
  }, [hasPendingReads, router, startTransition]);

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
            const extracted = await extractIntake(created.intakeId!).catch(() => ({ error: READ_CUT_OFF_MESSAGE }));
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
    } catch {
      // Without this, a rejected request (a dropped connection, a Server
      // Action that genuinely threw) left the button quietly reverting to
      // "Read" with nothing said and no visible change — user-reported
      // 2026-09-24: "after the document is read, the button changes back...
      // and the listing also remains same." The `finally` below still runs
      // either way, so the button always recovers; this just makes sure a
      // real failure is said out loud instead of looking like nothing
      // happened.
      setRefusals((cur) => [...cur, READ_CUT_OFF_MESSAGE]);
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

  // Which bulk actions this viewer may take on a row: release is the
  // accountant's alone, so it is not offered to anyone else.
  const actionsOf = (r: IntakeRow): BulkAction[] =>
    bulkActionsFor(r).filter((a) => a !== "release" || canRelease);

  async function runBulk(action: BulkAction) {
    const ids = rows.filter((r) => selected.has(r.id) && actionsOf(r).includes(action)).map((r) => r.id);
    if (ids.length === 0) return;
    setSubmitting(true);
    setBatchResult(null);
    try {
      if (action === "submit") {
        const r = await submitReadyBatch(ids);
        setBatchResult({ verb: "submitted", done: r.submitted.length, failed: r.failed.map((f) => ({ fileName: f.fileName || "—", error: f.error })) });
      } else {
        const r = action === "file" ? await fileIntakesAsDocuments(ids) : await releaseIntakesToSociety(ids);
        setBatchResult({
          verb: action === "file" ? "filed as documents" : "released to the society",
          done: r.done,
          failed: r.failed.map((f) => ({ fileName: f.fileName || "—", error: f.error })),
        });
      }
      setSelected(new Set());
      router.refresh();
    } catch {
      setBatchResult({ verb: "done", done: 0, failed: [{ fileName: "—", error: "The request did not complete — refresh to see what was done before retrying." }] });
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

  // Every view's count, under the search/society/month narrowing.
  const counts = useMemo(() => {
    const c: Record<IntakeView, number> = {
      unread: 0,
      failed: 0,
      duplicate: 0,
      review: 0,
      ready: 0,
      filed: 0,
      sent_back: 0,
      awaiting_release: 0,
      released: 0,
      superseded: 0,
    };
    for (const r of narrowed) {
      const v = intakeViewOf(r.status);
      if (v) c[v] += 1;
    }
    return c;
  }, [narrowed]);
  const tabCount = (t: IntakeTab): number =>
    t === "all" ? narrowed.length : narrowed.filter((r) => intakeTabOf(intakeViewOf(r.status)) === t).length;

  // "Overdue" means the LIVE payment status is one of overdue/warning/
  // suspended — the "bad" tone (page.tsx). A retail sale's "Unpaid" is
  // tone "warn", not "bad" — it has no arrears clock, so it never counts.
  const overdueCount = useMemo(() => narrowed.filter((r) => r.paymentStatus?.tone === "bad").length, [narrowed]);

  // Overdue is answered across every tab: an overdue bill is released, and
  // asking for it from To do must not show nothing.
  const visible = useMemo(
    () =>
      narrowed
        .filter((r) => (overdueOnly ? r.paymentStatus?.tone === "bad" : intakeFilterMatches(intakeViewOf(r.status), view)))
        .sort(compareIntakes(sortKey, sortDir)),
    [narrowed, view, overdueOnly, sortKey, sortDir],
  );

  // Rows grouped by their confirmed month (2026-11-27 redesign) — the month
  // column is gone, so the full society name has the room. Rows with no
  // month yet come first: they are the ones still waiting on someone.
  const groups = useMemo(() => {
    const byKey = new Map<string, IntakeRow[]>();
    for (const r of visible) {
      const k = r.periodKey ?? "";
      const list = byKey.get(k);
      if (list) list.push(r);
      else byKey.set(k, [r]);
    }
    const monthDir = sortKey === "period" ? sortDir : -1;
    return [...byKey.entries()]
      .sort(([a], [b]) => (a === "" ? -1 : b === "" ? 1 : a === b ? 0 : (a > b ? 1 : -1) * monthDir))
      .map(([key, list]) => {
        const total = list.reduce((s, r) => s + (r.total ?? 0), 0);
        return {
          key,
          label: key ? (list[0].period ?? key) : "Month not confirmed",
          summary: `${list.length} invoice${list.length === 1 ? "" : "s"}${total > 0 ? ` · ${inr(total)}` : ""}`,
          rows: list,
        };
      });
  }, [visible, sortKey, sortDir]);

  const societies = useMemo(() => [...new Set(rows.map((r) => r.society).filter((s): s is string => !!s))].sort(), [rows]);
  const months = useMemo(
    () =>
      [...new Map(rows.filter((r) => r.periodKey).map((r) => [r.periodKey!, r.period!])).entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)),
    [rows],
  );
  const filtering = query.trim() !== "" || societyFilter !== "" || monthFilter !== "";

  // A row is selectable when it can take at least one bulk action; "select
  // all" means the actionable rows currently on screen, not every row in
  // the system (2026-09-25: file as document / release to society in bulk).
  const selectableVisible = visible.filter((r) => actionsOf(r).length > 0);
  const allSelected = selectableVisible.length > 0 && selectableVisible.every((r) => selected.has(r.id));
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(selectableVisible.map((r) => r.id)));
  }
  const selectedRows = rows.filter((r) => selected.has(r.id));
  const countFor = (a: BulkAction) => selectedRows.filter((r) => actionsOf(r).includes(a)).length;

  // Clicking the sorted column reverses it; another column starts at its own natural end.
  function sortBy(key: IntakeSortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 1 ? -1 : 1));
      return;
    }
    setSortKey(key);
    setSortDir(initialSortDir(key));
  }

  const activeTab = tabOfFilter(view);
  const tabMeta = INTAKE_TABS.find((t) => t.key === activeTab)!;
  const todoSubViews = INTAKE_VIEWS.filter((v) => TODO_VIEWS.includes(v.key) && counts[v.key] > 0);
  const pickTab = (t: IntakeTab) => {
    setView(t);
    setOverdueOnly(false);
  };

  // Drop anywhere on the page (2026-11-27 redesign): the slim strip names
  // it, and a page-wide overlay shows while files are held over the window.
  const handleFilesRef = useRef(handleFiles);
  useEffect(() => {
    handleFilesRef.current = handleFiles;
  });
  useEffect(() => {
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files");
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setDragging(true);
    };
    const leave = (e: DragEvent) => {
      if (!e.relatedTarget) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setDragging(false);
      if (e.dataTransfer?.files.length) void handleFilesRef.current(e.dataTransfer.files);
    };
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, []);

  function actionFor(r: IntakeRow) {
    const reviewHref = `/admin/billing/intake/${r.id}`;
    return (
      <>
                          {r.status.startsWith("submitted") && r.calculationId ? (
                            <Link href={`/admin/billing/${r.calculationId}`} className="link-arrow text-[13px] font-semibold">
                              Open month →
                            </Link>
                          ) : r.status === "submitted_retail" && r.retailCustomerId ? (
                            <Link href={`/admin/retail-customers/${r.retailCustomerId}`} className="link-arrow text-[13px] font-semibold">
                              View customer →
                            </Link>
                          ) : (r.status === "submitted_filed_document" || r.status === "submitted_filed_released") && r.filedDocumentId ? (
                            <span className="inline-flex items-center gap-1.5">
                              <Link href={`/admin/documents/${r.filedDocumentId}`} className="link-arrow text-[13px] font-semibold">
                                View document →
                              </Link>
                              {/* Only while still unreleased — once a society
                                  has it, the way back is its own page. */}
                              {r.status === "submitted_filed_document" && (
                                <button
                                  type="button"
                                  className="btn-ghost btn-sm"
                                  onClick={() => {
                                    setUnfileTarget({ id: r.id, fileName: r.invoiceNumber ?? r.fileName });
                                    setUnfileReason("");
                                    setUnfileError(null);
                                  }}
                                >
                                  Unfile
                                </button>
                              )}
                            </span>
                          ) : r.status === "reading" || r.status === "uploaded" || r.status === "could_not_read" ? (
                            // One fixed-width button for all three states, so
                            // "Read" turning into "Reading…" never moves a column.
                            <span className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                className="btn-secondary btn-sm w-[92px] shrink-0"
                                disabled={r.status === "reading" || retrying.has(r.id)}
                                onClick={() => void retry(r.id, r.status === "uploaded")}
                              >
                                {r.status === "reading" || retrying.has(r.id) ? "Reading…" : r.status === "uploaded" ? "Read" : "Retry"}
                              </button>
                              <Link href={reviewHref} className="btn-ghost btn-sm">
                                By hand
                              </Link>
                            </span>
                          ) : (
                            <Link href={reviewHref} className="btn-secondary btn-sm">
                              {r.status === "ready" ? "Submit" : "Review"}
                            </Link>
                          )}
      </>
    );
  }

  const emptyText =
    rows.length === 0
      ? "Nothing in flight. Drop this month's invoices, or the whole backfill — one file per invoice."
      : filtering && narrowed.length > 0
        ? `No invoice matches under this tab — ${narrowed.length} match under All.`
        : filtering
          ? "No invoice matches."
          : overdueOnly
            ? "No invoice is overdue."
            : (INTAKE_VIEWS.find((v) => v.key === view)?.empty ?? tabMeta.empty);

  return (
    <>
      {dragging && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: "color-mix(in srgb, var(--accent) 12%, transparent)" }}
        >
          <div className="rounded-[var(--r-md)] border-2 border-dashed px-8 py-6 text-center font-semibold" style={{ borderColor: "var(--accent)", background: "var(--surface)", color: "var(--accent)" }}>
            Drop invoice PDFs or a zip to upload them
          </div>
        </div>
      )}

      <div
        className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--r-md)] border-[1.5px] border-dashed px-4 py-3"
        style={{ borderColor: "var(--accent-line)", background: "var(--surface)" }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0">
          <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
          <path d="M14 3v6h6" />
          <path d="M12 18v-6" />
          <path d="m9 15 3-3 3 3" />
        </svg>
        <p className="min-w-0 flex-1 text-[13px]" style={{ color: "var(--text-muted)" }}>
          <span className="font-semibold" style={{ color: "var(--text)" }}>
            Drop invoice PDFs or a zip anywhere on this page.
          </span>{" "}
          Each PDF becomes a row in To do. Up to 20 MB each.
        </p>
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
        <button type="button" className="btn-secondary btn-sm shrink-0" onClick={() => inputRef.current?.click()}>
          Upload PDFs
        </button>
        {(inFlight.length > 0 || archiveNotes.length > 0 || refusals.length > 0) && (
          <div className="w-full text-[12.5px]" style={{ color: "var(--text-muted)" }}>
            {inFlight.length > 0 && (
              <p>
                Uploading and reading {inFlight.length} file{inFlight.length === 1 ? "" : "s"}…
              </p>
            )}
            {archiveNotes.map((n) => (
              <p key={n}>{n}</p>
            ))}
            {refusals.map((r) => (
              <ErrorText key={r}>{r}</ErrorText>
            ))}
          </div>
        )}
      </div>

      {/* Tabs — five questions instead of ten chips (2026-11-27). On a
          phone one <select> carries the same choices (2026-10-07's rule). */}
      <div className="mb-3 sm:hidden">
        <select value={view} onChange={(e) => pickTab(e.target.value as IntakeTab)} aria-label="Filter by status" className="field w-full text-sm">
          {INTAKE_TABS.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label} · {tabCount(t.key)}
            </option>
          ))}
          {todoSubViews.map((v) => (
            <option key={v.key} value={v.key}>
              To do › {v.label} · {counts[v.key]}
            </option>
          ))}
        </select>
      </div>
      <div className="mb-3 hidden flex-wrap items-end justify-between gap-3 border-b sm:flex" style={{ borderColor: "var(--border)" }}>
        <div role="tablist" aria-label="Invoice status" className="-mb-px flex flex-wrap gap-1">
          {INTAKE_TABS.map((t) => {
            const on = activeTab === t.key && !overdueOnly;
            const n = tabCount(t.key);
            const urgent = t.key === "todo" && n > 0;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => pickTab(t.key)}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-t-[var(--r-sm)] border-b-2 px-3.5 text-sm hover:bg-[var(--surface-hover)]"
                style={{ borderColor: on ? "var(--accent)" : "transparent", color: on ? "var(--text)" : "var(--text-muted)", fontWeight: on ? 700 : 500 }}
              >
                {t.label}
                <span
                  className="tabular-nums min-w-[22px] rounded-full px-1.5 py-px text-center text-[12px] font-semibold"
                  style={
                    urgent
                      ? { background: "var(--accent)", color: "var(--text-on-accent)" }
                      : on
                        ? { background: "var(--accent-subtle)", color: "var(--accent-deep)" }
                        : { background: "var(--neu-bg)", color: "var(--text-muted)" }
                  }
                >
                  {n}
                </span>
              </button>
            );
          })}
        </div>
        {/* A toggle, not one more tab — "needs chasing for money" is a
            different question from "where is this in processing". */}
        <button
          type="button"
          aria-pressed={overdueOnly}
          onClick={() => setOverdueOnly((v) => !v)}
          className="mb-1.5 inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold"
          style={
            overdueOnly
              ? { background: "var(--bad-fg)", borderColor: "var(--bad-fg)", color: "var(--surface)" }
              : { background: "var(--bad-bg)", borderColor: "var(--bad-line)", color: "var(--bad-fg)" }
          }
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
          Overdue only · {overdueCount}
        </button>
      </div>
      <label className="mb-3 flex items-center gap-2 text-sm font-medium sm:hidden">
        <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} />
        Overdue only · {overdueCount}
      </label>

      {/* Under To do, its parts — only those holding something. */}
      {activeTab === "todo" && !overdueOnly && todoSubViews.length > 1 && (
        <div className="mb-3 hidden flex-wrap items-center gap-2 sm:flex">
          {[{ key: "todo" as const, label: "All to do", n: tabCount("todo") }, ...todoSubViews.map((v) => ({ key: v.key, label: v.label, n: counts[v.key] }))].map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setView(c.key)}
              className="rounded-full border px-3 py-1 text-xs font-semibold"
              style={
                view === c.key
                  ? { background: "var(--accent-subtle)", borderColor: "var(--accent-line)", color: "var(--accent-deep)" }
                  : { background: "var(--surface)", borderColor: "var(--border)", color: "var(--text-muted)" }
              }
            >
              {c.label} <span className="tabular-nums opacity-80">{c.n}</span>
            </button>
          ))}
        </div>
      )}
      {(overdueOnly || tabMeta.hint) && (
        <p className="mb-3 text-[13px]" style={{ color: "var(--text-muted)" }}>
          {overdueOnly ? "Released invoices past their due date and not fully paid, from every tab." : tabMeta.hint}
        </p>
      )}

      <div className="mb-3.5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search invoice number, file, society or month"
          aria-label="Search invoices"
          className="field w-full text-sm sm:w-auto sm:min-w-[16rem] sm:flex-[3]"
        />
        <div className="flex gap-2 sm:flex-[2]">
          <select value={societyFilter} onChange={(e) => setSocietyFilter(e.target.value)} aria-label="Filter by society" className="field min-w-0 flex-1 text-sm">
            <option value="">Every society</option>
            {societies.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} aria-label="Filter by month" className="field min-w-0 flex-1 text-sm">
            <option value="">Every month</option>
            {months.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        {filtering && (
          <button
            type="button"
            className="btn-ghost btn-sm self-start sm:self-auto"
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
            {batchResult.done} {batchResult.verb}{batchResult.failed.length > 0 ? `, ${batchResult.failed.length} refused` : ""}.
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

      {selected.size > 0 && (
        <div
          className="mb-3.5 flex flex-wrap items-center gap-3 rounded-[var(--r-md)] px-4 py-2.5"
          style={{ background: "var(--accent-subtle)", border: "1px solid var(--accent-line)" }}
        >
          <span className="text-sm font-semibold">
            {selected.size} selected{submitting ? " · working…" : ""}
          </span>
          <span className="flex-1" />
          {(["file", "release", "submit"] as BulkAction[]).map((a) => {
            const n = countFor(a);
            if (n === 0) return null;
            return (
              <button key={a} type="button" className="btn-secondary btn-sm" disabled={submitting} onClick={() => void runBulk(a)}>
                {BULK_LABEL[a](n)}
              </button>
            );
          })}
          <button type="button" className="btn-ghost btn-sm" disabled={submitting} onClick={() => setSelected(new Set())}>
            Clear
          </button>
        </div>
      )}

      <Card className="overflow-hidden">
        {visible.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="font-semibold">Nothing here</p>
            <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
              {emptyText}
            </p>
          </div>
        ) : (
          <>
          {/* A phone gets a stacked list — four columns cannot share 390px. */}
          <div className="md:hidden">
            {groups.map((g) => (
              <div key={g.key || "unconfirmed"}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 px-4 pb-2 pt-3" style={{ background: "var(--surface-sunken)" }}>
                  <span className="text-[13px] font-bold">{g.label}</span>
                  <span className="tabular-nums text-[12px]" style={{ color: "var(--text-muted)" }}>
                    {g.summary}
                  </span>
                </div>
                <ul>
                  {g.rows.map((r) => (
                    <li key={r.id} className="flex gap-3 border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
                      {actionsOf(r).length > 0 && (
                        <input
                          type="checkbox"
                          className="mt-1 shrink-0"
                          checked={selected.has(r.id)}
                          onChange={() => toggleSelect(r.id)}
                          aria-label={`Select ${r.invoiceNumber ?? r.fileName}`}
                        />
                      )}
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="min-w-0 font-semibold" style={{ color: r.society ? "var(--text)" : "var(--text-subtle)" }}>
                            {r.society ?? "Society not confirmed"}
                          </p>
                          <p className="shrink-0 font-semibold tabular-nums">{r.total !== null ? inr(r.total) : ""}</p>
                        </div>
                        <p className="truncate text-[12.5px]" style={{ color: "var(--text-subtle)" }}>
                          {r.invoiceNumber ?? r.fileName} · {r.fromZoho ? "from Zoho" : "PDF"} · {r.uploadedAgo}
                          {r.dueDate ? ` · due ${formatDate(r.dueDate)}` : ""}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusChip tone={r.statusTone}>{r.statusLabel}</StatusChip>
                          {r.paymentStatus && <StatusChip tone={r.paymentStatus.tone}>{r.paymentStatus.label}</StatusChip>}
                        </div>
                        {r.note && (
                          <p className="line-clamp-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
                            {r.note}
                          </p>
                        )}
                        {r.zohoChanged && (
                          <p className="text-[12px]" style={{ color: "var(--warn-fg)" }}>
                            Changed in Zoho since {r.status.startsWith("submitted") ? "this was processed — open it to review" : "it was fetched"}
                          </p>
                        )}
                        <div className="pt-0.5">{actionFor(r)}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="tbl tbl-compact" style={{ tableLayout: "fixed", width: "100%", minWidth: 760 }}>
              <colgroup>
                <col style={{ width: 44 }} />
                <col />
                <col style={{ width: 108 }} />
                <col style={{ width: 230 }} />
                <col style={{ width: 104 }} />
                <col style={{ width: 176 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>
                    {selectableVisible.length > 0 && (
                      <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label={`Select all ${selectableVisible.length} on screen`} />
                    )}
                  </th>
                  <SortHeader k="society" label="Society · invoice" sortKey={sortKey} dir={sortDir} onSort={sortBy} />
                  <SortHeader k="total" label="Amount" sortKey={sortKey} dir={sortDir} onSort={sortBy} align="right" />
                  <SortHeader k="status" sortKey={sortKey} dir={sortDir} onSort={sortBy} />
                  <SortHeader k="due" sortKey={sortKey} dir={sortDir} onSort={sortBy} />
                  <th>
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              {groups.map((g) => (
                <tbody key={g.key || "unconfirmed"}>
                  <tr>
                    <td colSpan={6} style={{ background: "var(--surface-sunken)", paddingTop: 12, paddingBottom: 8 }}>
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span className="text-[13px] font-bold">{g.label}</span>
                        <span className="tabular-nums text-[12px]" style={{ color: "var(--text-muted)" }}>
                          {g.summary}
                        </span>
                      </div>
                    </td>
                  </tr>
                  {g.rows.map((r) => {
                    const overdue = r.paymentStatus?.tone === "bad";
                    return (
                      <tr key={r.id}>
                        <td>
                          {actionsOf(r).length > 0 && (
                            <input
                              type="checkbox"
                              checked={selected.has(r.id)}
                              onChange={() => toggleSelect(r.id)}
                              aria-label={`Select ${r.invoiceNumber ?? r.fileName}`}
                            />
                          )}
                        </td>
                        <td>
                          <p className="font-semibold" style={{ color: r.society ? "var(--text)" : "var(--text-subtle)" }}>
                            {r.society ?? "Society not confirmed"}
                          </p>
                          <p className="truncate text-[12.5px]" style={{ color: "var(--text-subtle)" }} title={`${r.fileName} · ${r.uploadedAt} · ${r.uploadedBy}`}>
                            <span>{r.invoiceNumber ?? r.fileName}</span>
                            {" · "}
                            {r.fromZoho ? "from Zoho" : `${(r.fileSize / 1024).toFixed(0)} KB PDF`} · {r.uploadedAgo}
                          </p>
                          {r.zohoChanged && (
                            <p className="text-[12px]" style={{ color: "var(--warn-fg)" }}>
                              {r.status.startsWith("submitted") ? "Changed in Zoho since this was processed — open it to review" : "Changed in Zoho since it was fetched"}
                            </p>
                          )}
                        </td>
                        <td className="tabular-nums whitespace-nowrap text-right font-semibold">{r.total !== null ? inr(r.total) : "—"}</td>
                        <td>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <StatusChip tone={r.statusTone}>{r.statusLabel}</StatusChip>
                            {r.paymentStatus && <StatusChip tone={r.paymentStatus.tone}>{r.paymentStatus.label}</StatusChip>}
                          </div>
                          {r.note && (
                            <p className="mt-1 line-clamp-2 text-[12px]" style={{ color: "var(--text-muted)" }} title={r.note}>
                              {r.note}
                            </p>
                          )}
                        </td>
                        <td className="tabular-nums whitespace-nowrap text-[13px]" style={{ color: overdue ? "var(--bad-fg)" : "var(--text-muted)", fontWeight: overdue ? 600 : 400 }}>
                          {r.dueDate ? formatDate(r.dueDate) : "—"}
                        </td>
                        <td className="whitespace-nowrap text-right">{actionFor(r)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              ))}
            </table>
          </div>
          </>
        )}
        <div className="flex flex-wrap justify-between gap-2 border-t px-5 py-3 text-[12.5px]" style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
          <span>
            Showing {visible.length} of {rows.length}
          </span>
        </div>
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

      <Modal
        open={unfileTarget !== null}
        onClose={() => {
          if (unfilePending) return;
          setUnfileTarget(null);
          setUnfileError(null);
        }}
        title="Unfile this invoice"
        description={
          unfileTarget
            ? `Withdraws the filed copy for ${unfileTarget.fileName} and reopens it so it can be reconciled against a circuit and submitted as a real billed month instead — the way Billing and "Saved this month" actually get their figures.`
            : undefined
        }
      >
        {unfileTarget && (
          <>
            <label htmlFor="unfile-reason" className="lbl">
              Why
            </label>
            <input
              id="unfile-reason"
              type="text"
              className="field mt-1"
              value={unfileReason}
              onChange={(e) => setUnfileReason(e.target.value)}
              placeholder="Filed as a document by mistake — should be a billed month"
            />
            {unfileError && <ErrorText>{unfileError}</ErrorText>}
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="btn-ghost"
                disabled={unfilePending}
                onClick={() => {
                  setUnfileTarget(null);
                  setUnfileError(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={unfilePending || !unfileReason.trim()}
                onClick={() => void confirmUnfile()}
              >
                {unfilePending ? "Unfiling…" : "Unfile"}
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
  label,
}: {
  k: IntakeSortKey;
  label?: string;
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
        {label ?? INTAKE_SORTS[k].label}
        <span aria-hidden style={{ opacity: active ? 1 : 0.25 }}>
          {active ? (dir === 1 ? "↑" : "↓") : "↕"}
        </span>
      </button>
    </th>
  );
}
