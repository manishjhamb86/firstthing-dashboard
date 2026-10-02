"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ErrorText } from "@/components/ui";
import type { BranchVM, EditVM, RequestVM, RowState, RowVM } from "@/lib/society-timeline-view";
import { requestDateChange, saveTimelineDate, withdrawDateChange } from "./actions";

/**
 * The society timeline's interactive half (2026-09-28): fold and filter the
 * tree, and change a date. Before go-live (demo mode) the row opens an inline
 * editor; after it, the row raises a request and shows it until an admin
 * decides. Every state reads in a symbol and a word as well as a colour.
 */

// Drawn, not typed (2026-09-30, user-caught): a character's shape sits
// differently in the font's box for ✕, !, –, ≈ and ○, so typed glyphs never
// centre in their circle. Each mark is a path on a 10×10 grid, centred.
const MARK: Record<RowState, ReactNode> = {
  ok: <path d="M2.4 5.3 4.3 7.2 7.7 3.2" />,
  record: <path d="M2.4 5.3 4.3 7.2 7.7 3.2" />,
  bad: <path d="M3 3 7 7M7 3 3 7" />,
  warn: (
    <>
      <path d="M5 2.4v3.4" />
      <circle cx="5" cy="7.6" r="0.35" />
    </>
  ),
  none: <path d="M3 5h4" />,
  info: <path d="M2.4 4c.9-.8 1.7-.8 2.6 0s1.7.8 2.6 0M2.4 6.6c.9-.8 1.7-.8 2.6 0s1.7.8 2.6 0" />,
  later: <circle cx="5" cy="5" r="1.6" />,
};

export function Glyph({ state }: { state: RowState }) {
  return (
    <span className="tl-glyph" data-state={state} aria-hidden>
      <svg viewBox="0 0 10 10" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        {MARK[state]}
      </svg>
    </span>
  );
}

const flagged = (r: RowVM) => r.state === "bad" || r.state === "warn" || r.state === "none" || r.state === "info" || r.requests.length > 0;
const branchFlagged = (b: BranchVM): boolean =>
  [...b.steps, ...b.after].some(flagged) || b.children.some(branchFlagged);

export function TimelineTree({ societyId, root, demo }: { societyId: string; root: BranchVM; demo: boolean }) {
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [showBilling, setShowBilling] = useState(true);
  // null = each branch's own default; true/false = expand/collapse all.
  const [allOpen, setAllOpen] = useState<boolean | null>(null);
  const [generation, setGeneration] = useState(0);

  const ctx: Ctx = { societyId, demo, onlyProblems, showBilling, allOpen, generation };
  return (
    <>
      <div className="tl-toolbar">
        <label>
          <input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} /> Show only problems
        </label>
        <label>
          <input type="checkbox" checked={showBilling} onChange={(e) => setShowBilling(e.target.checked)} /> Billing months
        </label>
        <span className="flex-1" />
        <div className="tl-legend" aria-label="Key">
          <span><Glyph state="ok" />In order</span>
          <span><Glyph state="bad" />Out of order</span>
          <span><Glyph state="warn" />Check</span>
          <span><Glyph state="none" />No date recorded</span>
          <span><Glyph state="info" />Borrowed date</span>
          <span><Glyph state="later" />Not reached</span>
        </div>
        <button
          type="button"
          className="btn-ghost btn-sm"
          onClick={() => {
            setAllOpen(allOpen === false ? true : false);
            setGeneration((g) => g + 1);
          }}
        >
          {allOpen === false ? "Expand all" : "Collapse all"}
        </button>
      </div>
      <div className="tl-tree mt-2">
        <ol aria-label="Society timeline">
          <li className="tl-branch">
            <Steps rows={root.steps} ctx={ctx} />
            {root.children.map((c) => (
              <BranchView key={c.id} b={c} ctx={ctx} />
            ))}
          </li>
        </ol>
      </div>
    </>
  );
}

type Ctx = { societyId: string; demo: boolean; onlyProblems: boolean; showBilling: boolean; allOpen: boolean | null; generation: number };

function BranchView({ b, ctx }: { b: BranchVM; ctx: Ctx }) {
  if (b.kind === "billing" && !ctx.showBilling) return null;
  if (ctx.onlyProblems && !branchFlagged(b)) return null;
  // A branch with something to look at opens; a clean one folds to one line,
  // billing folds by default (it is long and rarely the question).
  const defaultOpen = b.kind !== "billing" && (b.counts.bad + b.counts.warn + b.counts.missing > 0 || b.kind !== "demo");
  const open = ctx.onlyProblems ? true : ctx.allOpen ?? defaultOpen;
  return (
    <details key={`${b.id}:${ctx.generation}:${ctx.onlyProblems}`} open={open} className={`tl-branch ${b.struck ? "tl-struck" : ""}`}>
      <summary className="tl-bhead">
        <span className="tl-chev" aria-hidden>›</span>
        <span className="tl-kind">{b.title}</span>
        <span className="tl-bname">{b.name}</span>
        {b.meta && <span className="tl-bmeta">{b.meta}</span>}
        {b.struck && <span className="tl-bmeta">{b.struck}</span>}
        <span className="tl-bend">
          {b.counts.bad > 0 && <span className="chip chip-bad">✕ {b.counts.bad} out of order</span>}
          {b.counts.warn > 0 && <span className="chip chip-warn">! {b.counts.warn} to check</span>}
          {b.counts.missing > 0 && <span className="chip chip-warn">– {b.counts.missing} not recorded</span>}
        </span>
      </summary>
      <div className="tl-nest">
        <Steps rows={b.steps} ctx={ctx} />
        {b.children.map((c) => (
          <BranchView key={c.id} b={c} ctx={ctx} />
        ))}
        <Steps rows={b.after} ctx={ctx} />
      </div>
    </details>
  );
}

function Steps({ rows, ctx }: { rows: RowVM[]; ctx: Ctx }) {
  const shown = ctx.onlyProblems ? rows.filter(flagged) : rows;
  if (shown.length === 0) return null;
  return (
    <ol className="mt-1.5">
      {shown.map((r) => (
        <Row key={r.id} r={r} ctx={ctx} />
      ))}
    </ol>
  );
}

function Row({ r, ctx }: { r: RowVM; ctx: Ctx }) {
  const [editing, setEditing] = useState<EditVM | null>(null);
  const openRequest = r.requests[0] ?? null;
  const editable = (e: EditVM | null) => !!e && (ctx.demo || (e.live && !openRequest));
  const verb = ctx.demo ? (r.edit?.range ? "Edit period" : "Edit date") : "Request a change";

  return (
    <li className="tl-step" id={r.id} data-state={r.state}>
      <div className="tl-date" data-none={r.dateText ? undefined : ""}>
        {r.dateText ? <time>{r.dateText}</time> : "No date"}
        {r.endText && <small>→ {r.endText}</small>}
      </div>
      <div className="tl-node">
        <Glyph state={r.state} />
      </div>
      <div className="tl-body">
        <div className="tl-line1">
          <span className="tl-what">{r.label}</span>
          {r.chip && <span className={`chip chip-${r.chip.tone}`}>{r.chip.text}</span>}
          {r.state === "later" && !r.chip && <span className="tl-gap">Not reached</span>}
          {r.gap && <span className="tl-gap">{r.gap}</span>}
        </div>
        {r.chain.length > 0 && (
          <div className="tl-chain">
            {r.chain.map((c) =>
              editable(c.edit) ? (
                <button key={c.label} type="button" onClick={() => setEditing(c.edit)} title={ctx.demo ? `Edit: ${c.edit!.label}` : `Request a change: ${c.edit!.label}`}>
                  {c.label} {c.dateText ?? "—"}
                </button>
              ) : (
                <span key={c.label}>
                  {c.label} {c.dateText ?? "—"}
                </span>
              ),
            )}
          </div>
        )}
        {r.messages.map((m, i) => (
          <div key={i} className="tl-msg" data-tone={m.tone}>
            {m.text}
          </div>
        ))}
        {r.note && <div className="tl-prov">{r.note}</div>}
        {openRequest && <PendingRequest req={openRequest} />}
        {editing && <Editor edit={editing} societyId={ctx.societyId} demo={ctx.demo} onClose={() => setEditing(null)} />}
      </div>
      <div className="tl-act">
        {!editing && editable(r.edit) && (
          <button type="button" className="btn-ghost btn-sm" onClick={() => setEditing(r.edit)}>
            {verb}
          </button>
        )}
        {!editing && !ctx.demo && r.edit && !r.edit.live && (
          <span className="tl-gap" title="This date is corrected only before go-live.">Fixed after go-live</span>
        )}
      </div>
    </li>
  );
}

function PendingRequest({ req }: { req: RequestVM }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="tl-req">
      <div className="flex flex-wrap items-center gap-2">
        <span className="chip chip-warn">Change requested</span>
        <b>
          {req.from} → {req.to}
        </b>
      </div>
      <span>
        Raised by {req.by} on {req.at} · waiting for an admin. Reason: “{req.reason}”
      </span>
      {req.mine && (
        <div>
          <button
            type="button"
            className="btn-outline btn-sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await withdrawDateChange(req.id);
                if (r.error) setError(r.error);
                else router.refresh();
              })
            }
          >
            Withdraw my request
          </button>
        </div>
      )}
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}

function Editor({ edit, societyId, demo, onClose }: { edit: EditVM; societyId: string; demo: boolean; onClose: () => void }) {
  const router = useRouter();
  const [from, to] = (edit.value ?? "/").split("/");
  const [a, setA] = useState(from ?? "");
  const [b, setB] = useState(to ?? "");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [pending, start] = useTransition();

  function submit() {
    setError(null);
    const value = edit.range ? `${a}/${b}` : a;
    start(async () => {
      try {
        const input = { societyId, field: edit.field, entityId: edit.entityId, value, reason };
        const r = demo ? await saveTimelineDate(input) : await requestDateChange(input);
        if (r.error) {
          setError(r.error);
          return;
        }
        setWarnings(r.warnings ?? []);
        if (!r.warnings?.length) onClose();
        router.refresh();
      } catch {
        setError("The request did not complete — refresh to see whether it was recorded before trying again.");
      }
    });
  }

  const fields: ReactNode = edit.range ? (
    <>
      <label>
        From
        <input className="field field-auto" type="date" value={a} onChange={(e) => setA(e.target.value)} />
      </label>
      <label>
        To
        <input className="field field-auto" type="date" value={b} onChange={(e) => setB(e.target.value)} />
      </label>
    </>
  ) : (
    <label>
      {edit.label}
      <input className="field field-auto" type="date" value={a} onChange={(e) => setA(e.target.value)} />
    </label>
  );

  return (
    <div className="tl-editor" aria-label={demo ? `Edit ${edit.label}` : `Request a change to ${edit.label}`}>
      {!demo && <p className="text-[12.5px] text-[var(--text-muted)]">After go-live a date changes by request. The recorded date stays until another admin accepts it.</p>}
      <div className="row">
        {fields}
        <button type="button" className="btn-secondary btn-sm" disabled={pending || !a || (edit.range && !b)} onClick={submit}>
          {demo ? "Save date" : "Send request"}
        </button>
        <button type="button" className="btn-outline btn-sm" disabled={pending} onClick={onClose}>
          {warnings.length ? "Done" : "Cancel"}
        </button>
      </div>
      <label>
        {demo ? "Why (optional before go-live)" : "Why (the approver reads this)"}
        <textarea className="field" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      {error && <ErrorText>{error}</ErrorText>}
      {warnings.map((w, i) => (
        <div key={i} className="tl-msg" data-tone="warn">
          {demo ? "Saved. " : "Sent. "}
          {w}
        </div>
      ))}
    </div>
  );
}
