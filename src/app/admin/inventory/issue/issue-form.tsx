"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, ErrorText, Field } from "@/components/ui";
import { SearchSelect, type SearchSelectOption } from "@/components/search-select";
import { PURPOSE_LABEL, type Purpose } from "@/lib/stock-workflow-labels";
import { issueStock } from "../workflow-actions";

type Item = { id: string; name: string; unit: string; tracking: string };
type Line = { key: string; itemTypeId: string; quantity: string; codes: string };

// Keys for lines added after the page has loaded; the first line has a fixed
// key so the server and the browser render the same markup.
const newKey = () => `l${Math.random().toString(36).slice(2, 9)}`;
const blank = (itemTypeId = "", quantity = "", key = newKey()): Line => ({ key, itemTypeId, quantity, codes: "" });
const codesOf = (s: string) => [...new Set(s.split(/[\s,]+/).map((c) => c.trim().toUpperCase()).filter(Boolean))];
const fmt = (n: number, unit: string) => `${n.toLocaleString("en-IN")}${unit === "m" ? " m" : unit === "pcs" ? "" : ` ${unit}`}`;

export function IssueForm({
  employees,
  offices,
  societies,
  items,
  free,
  needs,
  today,
  initialSocietyId,
  initialEmployeeId,
}: {
  employees: SearchSelectOption[];
  offices: { id: string; name: string }[];
  societies: { id: string; name: string }[];
  items: Item[];
  free: Record<string, number>;
  needs: Record<string, { itemTypeId: string; quantity: number }[]>;
  today: string;
  initialSocietyId: string;
  initialEmployeeId: string;
}) {
  const router = useRouter();
  const [employeeId, setEmployeeId] = useState(initialEmployeeId);
  const [officeId, setOfficeId] = useState(offices[0]?.id ?? "");
  const [societyId, setSocietyId] = useState(initialSocietyId);
  const [purpose, setPurpose] = useState<Purpose>("full_installation");
  const [issuedOn, setIssuedOn] = useState(today);
  const [dueOn, setDueOn] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([blank("", "", "first")]);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<{ code: string; slipId: string; summary: string } | null>(null);
  const [pending, start] = useTransition();

  const item = (id: string) => items.find((i) => i.id === id);
  const freeHere = (id: string) => free[`${officeId}|${id}`] ?? 0;
  const amount = (l: Line) => {
    const t = item(l.itemTypeId);
    if (t?.tracking === "serial" && codesOf(l.codes).length > 0) return codesOf(l.codes).length;
    return Number(l.quantity) || 0;
  };
  const problems = useMemo(
    () =>
      lines.map((l) => {
        const t = item(l.itemTypeId);
        if (!t) return l.quantity || l.codes ? "Choose the item." : null;
        const n = amount(l);
        if (n <= 0) return null;
        if (t.tracking !== "length" && !Number.isInteger(n)) return `${t.name} is counted in whole pieces.`;
        if (n > freeHere(t.id) + 1e-9) return `Only ${fmt(freeHere(t.id), t.unit)} free at ${offices.find((o) => o.id === officeId)?.name ?? "this office"}.`;
        return null;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lines, officeId, free],
  );
  const filled = lines.filter((l) => l.itemTypeId && amount(l) > 0);
  const total = filled.reduce((s, l) => s + amount(l), 0);
  const blocked = problems.some(Boolean) || filled.length === 0 || !employeeId || !societyId || !dueOn;
  const societyNeeds = needs[societyId] ?? [];

  function addShortfall() {
    const have = new Set(lines.map((l) => l.itemTypeId));
    const add = societyNeeds.filter((n) => !have.has(n.itemTypeId)).map((n) => blank(n.itemTypeId, String(Math.min(n.quantity, freeHere(n.itemTypeId)) || n.quantity)));
    setLines((ls) => [...ls.filter((l) => l.itemTypeId || l.quantity || l.codes), ...add]);
  }

  function submit() {
    start(async () => {
      setError(undefined);
      const r = await issueStock({
        employeeId,
        fromOfficeId: officeId,
        societyId,
        purpose,
        issuedOn,
        dueOn,
        note,
        lines: filled.map((l) => ({ itemTypeId: l.itemTypeId, quantity: Number(l.quantity) || 0, codes: item(l.itemTypeId)?.tracking === "serial" ? codesOf(l.codes) : [] })),
      });
      if ("error" in r && r.error) return setError(r.error);
      if ("code" in r) {
        const who = employees.find((e) => e.id === employeeId)?.label ?? "the employee";
        const where = societies.find((s) => s.id === societyId)?.name ?? "";
        setDone({
          code: r.code,
          slipId: r.slipId,
          summary: `${filled.map((l) => `${fmt(amount(l), item(l.itemTypeId)!.unit)} ${item(l.itemTypeId)!.name}`).join(", ")} ${filled.length === 1 && amount(filled[0]!) === 1 ? "is" : "are"} now with ${who} for ${where}.`,
        });
        setLines([blank()]);
        setNote("");
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {done && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--r-md)] border px-4 py-3" style={{ background: "var(--ok-bg)", borderColor: "var(--ok-line, var(--border))", color: "var(--ok-fg)" }}>
          <span className="text-[14px]">
            <strong>
              Issued — slip <span className="num">{done.code}</span>.
            </strong>{" "}
            {done.summary}
          </span>
          <Link href={`/admin/inventory/custody?slip=${done.slipId}`} className="text-[13px] font-semibold underline" style={{ color: "var(--ok-fg)" }}>
            See who holds what →
          </Link>
        </div>
      )}
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <Card className="flex min-w-0 flex-1 flex-col gap-5 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Issue to" htmlFor="is-emp">
              <SearchSelect id="is-emp" options={employees} value={employeeId || null} onCommit={(id) => setEmployeeId(id ?? "")} placeholder="Type a name" />
            </Field>
            <Field label="From" htmlFor="is-from">
              <select id="is-from" className="field" value={officeId} onChange={(e) => setOfficeId(e.target.value)}>
                {offices.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="For society" htmlFor="is-soc">
              <SearchSelect id="is-soc" options={societies.map((s) => ({ id: s.id, label: s.name }))} value={societyId || null} onCommit={(id) => setSocietyId(id ?? "")} placeholder="Type a society" />
            </Field>
            <Field label="Purpose" htmlFor="is-purpose">
              <select id="is-purpose" className="field" value={purpose} onChange={(e) => setPurpose(e.target.value as Purpose)}>
                {(Object.keys(PURPOSE_LABEL) as Purpose[]).map((p) => (
                  <option key={p} value={p}>
                    {PURPOSE_LABEL[p]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Issued on" htmlFor="is-on">
              <input id="is-on" type="date" className="field" value={issuedOn} max={today} onChange={(e) => setIssuedOn(e.target.value)} />
            </Field>
            <Field label="Expected installation date" htmlFor="is-due" hint="Shown to the employee; past it, what they still hold reads as overdue.">
              <input id="is-due" type="date" className="field" value={dueOn} min={issuedOn} onChange={(e) => setDueOn(e.target.value)} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Note (optional)" htmlFor="is-note">
                <input id="is-note" className="field" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Tower C basement first" />
              </Field>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <p className="lbl">Items</p>
            <div className="flex flex-col divide-y divide-[var(--border-subtle)] rounded-[var(--r-md)] border border-[var(--border-subtle)]">
              {lines.map((l, i) => {
                const t = item(l.itemTypeId);
                const bad = problems[i];
                return (
                  <div key={l.key} className="flex flex-col gap-2 p-3" style={{ background: bad ? "var(--bad-bg)" : undefined }}>
                    <div className="grid gap-2 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
                      <Field label="Item" htmlFor={`is-item-${l.key}`}>
                        <select id={`is-item-${l.key}`} className="field" value={l.itemTypeId} onChange={(e) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, itemTypeId: e.target.value } : x)))}>
                          <option value="">Choose an item</option>
                          {items.map((it) => (
                            <option key={it.id} value={it.id}>
                              {it.name} — {fmt(freeHere(it.id), it.unit)} free
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label={t?.unit === "m" ? "Metres" : "How many"} htmlFor={`is-qty-${l.key}`}>
                        <input
                          id={`is-qty-${l.key}`}
                          className="field num"
                          inputMode="decimal"
                          value={t?.tracking === "serial" && codesOf(l.codes).length ? String(codesOf(l.codes).length) : l.quantity}
                          disabled={t?.tracking === "serial" && codesOf(l.codes).length > 0}
                          onChange={(e) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, quantity: e.target.value } : x)))}
                        />
                      </Field>
                      <button type="button" className="btn-secondary btn-sm" aria-label={`Remove line ${i + 1}`} onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [blank()]))}>
                        Remove
                      </button>
                    </div>
                    {t?.tracking === "serial" && (
                      <details>
                        <summary className="cursor-pointer text-[12.5px] text-[var(--text-muted)]">
                          {codesOf(l.codes).length ? `${codesOf(l.codes).length} unit codes entered` : "Enter or scan the unit codes (otherwise the oldest free units are picked)"}
                        </summary>
                        <textarea
                          aria-label={`Unit codes for ${t.name}`}
                          className="field num mt-2 min-h-[80px]"
                          value={l.codes}
                          onChange={(e) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, codes: e.target.value } : x)))}
                          placeholder="One code per line, or separated by spaces"
                        />
                      </details>
                    )}
                    {bad && <p className="text-[13px] text-[var(--bad-fg)]">{bad}</p>}
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-2">
              {societyNeeds.length > 0 && (
                <button type="button" className="btn-secondary btn-sm" onClick={addShortfall}>
                  + Add what this society still needs
                </button>
              )}
              <button type="button" className="btn-secondary btn-sm" onClick={() => setLines((ls) => [...ls, blank()])}>
                + Add an item
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-4">
            <span className="text-[13px] text-[var(--text-muted)]">
              {!employeeId ? "Choose who it is issued to." : !societyId ? "Choose the society." : !dueOn ? "Enter the expected installation date." : problems.some(Boolean) ? "Fix the lines marked in red." : ""}
            </span>
            <button type="button" className="btn-primary" disabled={blocked || pending} onClick={submit}>
              {pending ? "Issuing…" : `Issue ${total.toLocaleString("en-IN")} item${total === 1 ? "" : "s"}`}
            </button>
          </div>
          {error && <ErrorText>{error}</ErrorText>}
        </Card>

        <Card className="p-5 lg:w-[340px] lg:shrink-0">
          <p className="mb-2 text-[15px] font-semibold">The rules</p>
          <ul className="list-disc space-y-2 pl-4 text-[13.5px] text-[var(--text-muted)]">
            <li>Only stock free at the chosen office can be issued; a faulty unit never can.</li>
            <li>Coded items are issued by unit, so you always know which light went where. Leave the codes blank and the oldest free units are picked.</li>
            <li>Wire and loose items are issued by quantity.</li>
            <li>Issuing writes one slip; the employee sees it under Stock in their field app.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
