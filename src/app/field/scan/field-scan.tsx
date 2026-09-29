"use client";

import { useCallback } from "react";
import { ScanClient } from "@/app/admin/inventory/scan/scan-client";
import type { MoveContext, RecordMove } from "@/app/admin/inventory/move-forms";
import { lookupScanned } from "@/app/admin/inventory/actions";
import { MOVE_LABEL } from "@/lib/inventory";
import { enqueue } from "../outbox-db";
import { useOutbox } from "../outbox-provider";

/**
 * The back office's scanner, with the two things the field needs changed
 * (docs/engineering/19-field-app.md §8 step 5):
 *
 *  - looking a code up needs the office; with no signal the code is kept and
 *    marked "checked when sent" instead of the scan failing;
 *  - recording the move goes into the outbox — saved on the phone, sent in
 *    order, applied unit by unit by the same rules as the back office
 *    (src/lib/inventory-move.ts), with any unit it cannot move named under
 *    More → Recently sent.
 */
export function FieldScan({ ctx }: { ctx: MoveContext }) {
  const outbox = useOutbox();

  const lookup = useCallback(async (codes: string[]) => {
    if (!navigator.onLine) return null;
    try {
      return await lookupScanned(codes);
    } catch {
      return null;
    }
  }, []);

  const recordMove: RecordMove = useCallback(
    async (input) => {
      const where =
        input.kind === "deploy"
          ? ctx.societies.find((s) => s.id === input.societyId)?.name
          : input.kind === "transfer" || input.kind === "return_to_office"
            ? ctx.offices.find((o) => o.id === input.toOfficeId)?.name
            : null;
      const n = input.codes.length;
      await enqueue([
        {
          id: crypto.randomUUID(),
          kind: "stock.move",
          payload: input,
          label: `${MOVE_LABEL[input.kind]} · ${n} unit${n === 1 ? "" : "s"}${where ? ` · ${where}` : ""}`,
          createdAt: Date.now(),
          refusals: 0,
          failures: 0,
          lastError: null,
          state: "pending",
        },
      ]);
      void outbox.refresh().then(() => outbox.sendNow());
      return { done: n, failed: [], queued: true };
    },
    [ctx, outbox],
  );

  return <ScanClient ctx={ctx} lookup={lookup} recordMove={recordMove} />;
}
