"use client";

import { useState } from "react";
import { Modal } from "@/components/modal";
import { AssignControl } from "./assign-control";

/**
 * Once a pump room is assigned the form leaves the page and lives behind
 * this header button instead (2026-11-10, user-caught: the full form sat
 * inline taking half the page for something already done) — the exact
 * same pattern water tanks already use for the same reason, the app's own
 * Modal rather than a hand-rolled dialog.
 */
export function ReassignButton(props: React.ComponentProps<typeof AssignControl> & { roomLabel: string }) {
  const [open, setOpen] = useState(false);
  const { roomLabel, ...control } = props;
  return (
    <>
      <button type="button" className="btn-secondary" onClick={() => setOpen(true)}>
        Reassign
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Reassign this pump room" description={roomLabel}>
        <AssignControl {...control} onSaved={() => setOpen(false)} />
      </Modal>
    </>
  );
}
