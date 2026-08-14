"use client";

import { useActionState, useState } from "react";
import { addLightingInventoryArea } from "./actions";

const fieldStyle = { borderColor: "var(--field-border)", background: "var(--surface)", color: "var(--text)" };

async function action(_prev: string | undefined, formData: FormData) {
  const result = await addLightingInventoryArea({
    siteSurveyId: formData.get("siteSurveyId") as string,
    area: formData.get("area") as string,
    lightType: formData.get("lightType") as string,
    count: Number(formData.get("count")),
    method: formData.get("method") as "walked" | "estimated",
    note: formData.get("note") as string,
  });
  return result?.error;
}

// FEAT-006-AC-2: fields default to zero with an explicit prompt, not a
// silently-skippable total. Controlled inputs (React 19 form-reset finding).
export function LightingInventoryForm({ siteSurveyId }: { siteSurveyId: string }) {
  const [error, formAction, pending] = useActionState(action, undefined);
  const [area, setArea] = useState("");
  const [lightType, setLightType] = useState("");
  const [count, setCount] = useState("0");
  const [method, setMethod] = useState<"walked" | "estimated">("walked");
  const [note, setNote] = useState("");

  return (
    <form
      action={formAction}
      className="space-y-3 bg-[var(--surface)] border border-[var(--border-subtle)] rounded-[var(--r-lg)] p-4"
    >
      <input type="hidden" name="siteSurveyId" value={siteSurveyId} />
      <p className="text-sm font-semibold">Add an area</p>
      <div className="grid grid-cols-2 gap-3">
        <input
          name="area"
          placeholder="Area (e.g. Basement parking)"
          required
          value={area}
          onChange={(e) => setArea(e.target.value)}
          className="border rounded-[var(--r-sm)] p-2 text-sm"
          style={fieldStyle}
        />
        <input
          name="lightType"
          placeholder="Light type"
          required
          value={lightType}
          onChange={(e) => setLightType(e.target.value)}
          className="border rounded-[var(--r-sm)] p-2 text-sm"
          style={fieldStyle}
        />
        <input
          name="count"
          type="number"
          min="0"
          required
          value={count}
          onChange={(e) => setCount(e.target.value)}
          className="border rounded-[var(--r-sm)] p-2 text-sm"
          style={fieldStyle}
        />
        <select
          name="method"
          value={method}
          onChange={(e) => setMethod(e.target.value as "walked" | "estimated")}
          className="border rounded-[var(--r-sm)] p-2 text-sm"
          style={fieldStyle}
        >
          <option value="walked">Walked count</option>
          <option value="estimated">Estimated</option>
        </select>
      </div>
      {method === "estimated" && (
        <input
          name="note"
          placeholder="Why estimated, not walked?"
          required
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full border rounded-[var(--r-sm)] p-2 text-sm"
          style={fieldStyle}
        />
      )}
      {error && (
        <p className="text-xs" style={{ color: "var(--bad-fg)" }}>
          {error}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn-primary px-4 py-2 text-sm font-semibold disabled:opacity-60">
        {pending ? "Adding…" : "Add area"}
      </button>
    </form>
  );
}
