"use client";

import { useActionState, useState } from "react";
import { addLightingInventoryArea } from "./actions";
import { Card, CardTitle, ErrorText, Field } from "@/components/ui";

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
    <Card className="p-5">
      <CardTitle>Add an area</CardTitle>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="siteSurveyId" value={siteSurveyId} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Area" htmlFor="inv-area">
            <input
              id="inv-area"
              name="area"
              placeholder="e.g. Basement parking"
              required
              value={area}
              onChange={(e) => setArea(e.target.value)}
              className="field"
            />
          </Field>
          <Field label="Light type" htmlFor="inv-lightType">
            <input
              id="inv-lightType"
              name="lightType"
              placeholder="e.g. Tube light"
              required
              value={lightType}
              onChange={(e) => setLightType(e.target.value)}
              className="field"
            />
          </Field>
          <Field label="Light count" htmlFor="inv-count">
            <input
              id="inv-count"
              name="count"
              type="number"
              min="0"
              required
              value={count}
              onChange={(e) => setCount(e.target.value)}
              className="field"
            />
          </Field>
          <Field label="Count method" htmlFor="inv-method">
            <select
              id="inv-method"
              name="method"
              value={method}
              onChange={(e) => setMethod(e.target.value as "walked" | "estimated")}
              className="field"
            >
              <option value="walked">Walked count</option>
              <option value="estimated">Estimated</option>
            </select>
          </Field>
        </div>
        {method === "estimated" && (
          <Field label="Why estimated, not walked?" htmlFor="inv-note">
            <input
              id="inv-note"
              name="note"
              required
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="field"
            />
          </Field>
        )}
        {error && <ErrorText>{error}</ErrorText>}
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? "Adding…" : "Add area"}
        </button>
      </form>
    </Card>
  );
}
