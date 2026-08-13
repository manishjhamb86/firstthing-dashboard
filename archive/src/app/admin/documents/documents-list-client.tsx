"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Files, Filter, X, ChevronUp, ChevronDown, Eye, UploadCloud } from "lucide-react";
import StatusChip, { TONE_VARS } from "@/components/shell/StatusChip";
import EmptyState from "@/components/shell/EmptyState";
import FilterCombobox from "@/components/shell/FilterCombobox";
import { DOC_TYPE_LABEL, DOC_TYPE_ICON, DOC_TYPE_TONE, type DocType } from "./doc-type-meta";

export type DocumentRow = {
  id: string;
  docType: DocType;
  title: string;
  societyId: number;
  societyName: string;
  month: string;
  date: string;
  pdfUrl: string;
  createdAt: string;
};

type Society = { id: number; name: string };

type SortKey = "date" | "societyName" | "docType";

function SortHeader({
  label,
  sortKeyName,
  sortKey,
  sortDir,
  onToggle,
}: {
  label: string;
  sortKeyName: SortKey;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onToggle: (key: SortKey) => void;
}) {
  const active = sortKey === sortKeyName;
  return (
    <button
      className="flex items-center gap-0.5 text-left"
      style={active ? { color: "var(--ac)" } : undefined}
      onClick={() => onToggle(sortKeyName)}
    >
      {label}
      {active ? sortDir === "asc" ? <ChevronUp size={11} /> : <ChevronDown size={11} /> : null}
    </button>
  );
}

export default function DocumentsListClient({
  documents,
  societies,
}: {
  documents: DocumentRow[];
  societies: Society[];
}) {
  const [typeFilter, setTypeFilter] = useState("");
  const [societyFilter, setSocietyFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const typeOptions = Object.values(DOC_TYPE_LABEL);
  const societyOptions = useMemo(() => societies.map((s) => s.name), [societies]);
  const monthOptions = useMemo(
    () => Array.from(new Set(documents.map((d) => d.month).filter(Boolean))),
    [documents]
  );

  const activeFilterCount = [typeFilter, societyFilter, monthFilter].filter(Boolean).length;

  const filtered = useMemo(() => {
    return documents.filter((d) => {
      if (typeFilter && DOC_TYPE_LABEL[d.docType] !== typeFilter) return false;
      if (societyFilter && !d.societyName.toLowerCase().includes(societyFilter.toLowerCase())) return false;
      if (monthFilter && !d.month.toLowerCase().includes(monthFilter.toLowerCase())) return false;
      return true;
    });
  }, [documents, typeFilter, societyFilter, monthFilter]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "date") cmp = (a.date || a.createdAt).localeCompare(b.date || b.createdAt);
      else if (sortKey === "societyName") cmp = a.societyName.localeCompare(b.societyName);
      else cmp = DOC_TYPE_LABEL[a.docType].localeCompare(DOC_TYPE_LABEL[b.docType]);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function clearFilters() {
    setTypeFilter("");
    setSocietyFilter("");
    setMonthFilter("");
  }

  return (
    <div className="w-full max-w-5xl space-y-6">
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between gap-2.5 border-b border-border px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <Files size={16} className="text-m1" />
            <div>
              <div className="text-sm font-bold text-ink">All Documents</div>
              <div className="text-[11px] text-m2">
                {sorted.length} of {documents.length} document{documents.length === 1 ? "" : "s"}
              </div>
            </div>
          </div>
          <Link
            href="/admin/documents/new"
            className="flex items-center gap-1.5 rounded-[9px] bg-ac px-3.5 py-2 text-xs font-bold text-onac"
          >
            <UploadCloud size={13} />
            Upload document
          </Link>
        </div>

        <div className="border-b border-border bg-card-2 p-5">
          <div className="mb-2.5 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-m1">
              <Filter size={12} />
              Filter documents
            </div>
            {activeFilterCount > 0 && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 text-[11px] font-semibold text-ac hover:underline"
              >
                <X size={12} />
                Clear {activeFilterCount} filter{activeFilterCount === 1 ? "" : "s"}
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FilterCombobox label="Document Type" value={typeFilter} onChange={setTypeFilter} options={typeOptions} />
            <FilterCombobox label="Society" value={societyFilter} onChange={setSocietyFilter} options={societyOptions} />
            <FilterCombobox label="Month" value={monthFilter} onChange={setMonthFilter} options={monthOptions} />
          </div>
        </div>

        <div className="hidden grid-cols-[1fr_1.3fr_1.3fr_1fr_1fr_.7fr] gap-2 bg-card-2 px-5 py-2.5 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-m2 sm:grid">
          <SortHeader label="Type" sortKeyName="docType" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
          <SortHeader label="Society" sortKeyName="societyName" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
          <div>Title / Number</div>
          <div>Month</div>
          <SortHeader label="Date" sortKeyName="date" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
          <div />
        </div>

        {sorted.length === 0 && documents.length === 0 && (
          <div className="p-6">
            <EmptyState
              title="No documents uploaded yet"
              description="Upload your first invoice, savings report, or inspection report to see it listed here."
              action={
                <Link
                  href="/admin/documents/new"
                  className="mt-1 inline-flex items-center gap-1.5 rounded-[9px] bg-ac px-3.5 py-2 text-xs font-bold text-onac"
                >
                  <UploadCloud size={13} />
                  Upload a document
                </Link>
              }
            />
          </div>
        )}

        {sorted.length === 0 && documents.length > 0 && (
          <div className="p-6">
            <EmptyState title="No documents found" description="Try adjusting or clearing the filters above." />
          </div>
        )}

        {sorted.map((doc) => {
          const tone = TONE_VARS[DOC_TYPE_TONE[doc.docType]];
          const Icon = DOC_TYPE_ICON[doc.docType];
          return (
            <div
              key={doc.id}
              className="grid grid-cols-2 items-center gap-2 border-t border-border border-l-[3px] px-5 py-3.5 transition-colors hover:bg-card-2 sm:grid-cols-[1fr_1.3fr_1.3fr_1fr_1fr_.7fr]"
              style={{ borderLeftColor: tone.fg }}
            >
              <div className="flex items-center gap-1.5">
                <Icon size={13} style={{ color: tone.fg }} />
                <StatusChip tone={DOC_TYPE_TONE[doc.docType]}>{DOC_TYPE_LABEL[doc.docType].toUpperCase()}</StatusChip>
              </div>
              <div className="text-xs font-semibold text-ink">{doc.societyName || "—"}</div>
              <div className="text-xs text-m1">{doc.title}</div>
              <div className="text-xs text-m1">{doc.month || "—"}</div>
              <div className="text-xs text-m1">
                {doc.date
                  ? new Date(`${doc.date}T00:00:00`).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })
                  : "—"}
              </div>
              <div className="col-span-2 sm:col-span-1 sm:text-right">
                <a
                  href={doc.pdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-[7px] px-2 py-1 text-xs font-semibold text-ac hover:bg-card3"
                  style={{ background: "var(--card3)" }}
                >
                  <Eye size={12} />
                  View
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
