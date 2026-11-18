"use client";

import { useState } from "react";
import { Modal } from "@/components/modal";
import { BaselineForm } from "./baseline-form";

/**
 * The before-FirsThing baseline lives behind a header button beside
 * Reassign, not as a card on the page (2026-11-18, user-asked) — it is
 * recorded once and rarely touched, the same reasoning that moved the
 * assignment form into a modal.
 */
export function BaselineButton(props: Omit<React.ComponentProps<typeof BaselineForm>, "inModal" | "onSaved">) {
  const [open, setOpen] = useState(false);
  const label = props.current ? `Baseline · ${props.current.kwhPerKl.toFixed(2)} kWh/KL` : "Record baseline";
  return (
    <>
      <button type="button" className="btn-secondary" onClick={() => setOpen(true)}>
        {label}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="wide"
        title={props.current ? "Replace the before-FirsThing baseline" : "Record the before-FirsThing baseline"}
        description="The kWh per kilolitre the pump ran at before the automation, from a filed document with its period stated. Every saving the society sees is measured against it."
      >
        <BaselineForm {...props} inModal onSaved={() => setOpen(false)} />
      </Modal>
    </>
  );
}
