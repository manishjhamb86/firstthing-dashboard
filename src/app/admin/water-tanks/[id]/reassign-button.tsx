"use client";

import { useState } from "react";
import { Modal } from "@/components/modal";
import { AssignControl } from "./assign-control";

/**
 * Once a tank is assigned the form leaves the page (user's call, 2026-09-15)
 * and lives behind this header button instead — the app's own Modal, not a
 * hand-rolled dialog (the lesson recorded 2026-08-28).
 */
export function ReassignButton(props: React.ComponentProps<typeof AssignControl> & { tankName: string }) {
  const [open, setOpen] = useState(false);
  const { tankName, ...control } = props;
  return (
    <>
      <button type="button" className="btn-secondary" onClick={() => setOpen(true)}>
        Reassign
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Reassign this tank" description={tankName}>
        <AssignControl {...control} onSaved={() => setOpen(false)} />
      </Modal>
    </>
  );
}
