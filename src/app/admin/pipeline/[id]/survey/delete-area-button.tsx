"use client";

import { useTransition } from "react";
import { deleteLightingInventoryArea } from "./actions";

export function DeleteAreaButton({ id, siteSurveyId }: { id: string; siteSurveyId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await deleteLightingInventoryArea(id, siteSurveyId);
        })
      }
      className="text-xs text-[var(--text-subtle)] hover:text-[var(--bad-fg)] disabled:opacity-60"
    >
      Remove
    </button>
  );
}
