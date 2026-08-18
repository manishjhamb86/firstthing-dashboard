"use client";

import { useState } from "react";
import { Modal } from "@/components/modal";
import { PortalAccountForm } from "./portal-account-form";

/** The create form lives behind a button now, not permanently open under the list. */
export function AddPortalAccountButton({
  societyId,
  variant = "primary",
}: {
  societyId: string;
  variant?: "primary" | "secondary";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={variant === "primary" ? "btn-primary" : "btn-secondary btn-sm"}
        onClick={() => setOpen(true)}
      >
        Add portal account
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New portal account"
        description="Someone at the society who can sign in, see its data, and — as office-bearer — accept binding acts."
      >
        <PortalAccountForm societyId={societyId} onSaved={() => setOpen(false)} />
      </Modal>
    </>
  );
}
