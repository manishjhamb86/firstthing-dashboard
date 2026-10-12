"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, ErrorText, Field } from "@/components/ui";
import { receiveHistoricalStock } from "../actions";

type Item = { id: string; name: string; tracking: string; unit: string };
type Office = { id: string; name: string };
type Society = { id: string; name: string };

export function ExistingStockForm({
  items,
  offices,
  societies,
  today,
}: {
  items: Item[];
  offices: Office[];
  societies: Society[];
  today: string;
}) {
  const router = useRouter();
  const [itemTypeId, setItemTypeId] = useState(items[0]?.id ?? "");
  const [count, setCount] = useState("");
  const [since, setSince] = useState(today);
  const [locationKind, setLocationKind] = useState<"society" | "office">("society");
  const [officeId, setOfficeId] = useState(offices[0]?.id ?? "");
  const [societyId, setSocietyId] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [done, setDone] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  const item = items.find((i) => i.id === itemTypeId);

  function submit() {
    setError(undefined);
    setDone(undefined);
    startTransition(async () => {
      const r = await receiveHistoricalStock({
        itemTypeId,
        count: Number(count),
        since,
        locationKind,
        officeId,
        societyId,
        notes,
      });
      if ("error" in r) setError(r.error);
      else {
        setDone(`Recorded — ${count} ${item?.unit === "m" ? "metres" : item?.unit === "pcs" ? "pieces" : item?.unit} of ${item?.name}.`);
        setCount("");
        setNotes("");
        router.refresh();
      }
    });
  }

  return (
    <Card className="max-w-2xl p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Item" htmlFor="ex-item">
          <select id="ex-item" className="field" value={itemTypeId} onChange={(e) => setItemTypeId(e.target.value)}>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={`How many${item ? ` (${item.unit === "m" ? "metres" : item.unit})` : ""}`} htmlFor="ex-count">
          <input
            id="ex-count"
            className="field"
            type="number"
            min="0"
            step={item?.tracking === "length" ? "0.1" : "1"}
            value={count}
            onChange={(e) => setCount(e.target.value)}
          />
        </Field>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Already at" htmlFor="ex-kind">
          <select
            id="ex-kind"
            className="field"
            value={locationKind}
            onChange={(e) => setLocationKind(e.target.value as "society" | "office")}
          >
            <option value="society">A society — it is deployed there</option>
            <option value="office">An office — it is still in stock</option>
          </select>
        </Field>
        {locationKind === "society" ? (
          <Field label="Society" htmlFor="ex-society">
            <select id="ex-society" className="field" value={societyId} onChange={(e) => setSocietyId(e.target.value)}>
              <option value="">Choose…</option>
              {societies.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <Field label="Office" htmlFor="ex-office">
            <select id="ex-office" className="field" value={officeId} onChange={(e) => setOfficeId(e.target.value)}>
              {offices.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Already there since" htmlFor="ex-since" hint="A rough date is fine — it is only used to file the batch.">
          <input id="ex-since" className="field" type="date" value={since} max={today} onChange={(e) => setSince(e.target.value)} />
        </Field>
        <Field label="Note (optional)" htmlFor="ex-notes">
          <input id="ex-notes" className="field" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. counted during the September survey" />
        </Field>
      </div>

      <p className="mt-3 text-xs text-[var(--text-muted)]">
        {item?.tracking === "serial"
          ? "A batch and a printed code per unit are generated automatically, same as a real delivery — just with no supplier invoice. It is tagged “Pre-existing” everywhere it is shown."
          : "Recorded as one batch with no supplier invoice, tagged “Pre-existing” everywhere it is shown."}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn-primary"
          disabled={pending || !itemTypeId || !count || (locationKind === "society" ? !societyId : !officeId)}
          onClick={submit}
        >
          {pending ? "Recording…" : "Record this stock"}
        </button>
        {error && <ErrorText>{error}</ErrorText>}
        {done && <p className="text-[13px]" style={{ color: "var(--ok-fg)" }}>{done}</p>}
      </div>
    </Card>
  );
}
