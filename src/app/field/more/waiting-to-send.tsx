"use client";

import { Card } from "@/components/ui";
import { useOutbox } from "../outbox-provider";
import { WaitingItem } from "../waiting-item";
import { useOnline } from "../field-shell";

/** Everything saved on this phone that the office does not have yet. */
export function WaitingToSend() {
  const outbox = useOutbox();
  const online = useOnline();
  if (!outbox.loaded) return null;
  return (
    <Card className="p-4 mb-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="font-semibold">Waiting to send</p>
        {outbox.items.length > 0 && online && (
          <button type="button" className="btn-secondary min-h-[44px] px-4" onClick={() => void outbox.sendNow()}>
            Send now
          </button>
        )}
      </div>
      {outbox.items.length === 0 ? (
        <p className="text-[var(--text-muted)]">Nothing. Everything saved on this phone has reached the office.</p>
      ) : (
        <>
          <p className="text-[var(--text-muted)] mb-3">
            {online
              ? "Sent in the order saved. Keep the app open for a moment, or it finishes the next time you open it."
              : "No signal. These are kept on this phone and sent when the signal returns."}
          </p>
          <ul className="space-y-2">
            {outbox.items.map((i) => (
              <WaitingItem key={i.seq} item={i} />
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
