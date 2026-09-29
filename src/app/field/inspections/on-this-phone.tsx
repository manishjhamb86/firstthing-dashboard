"use client";

import { useOutbox } from "../outbox-provider";
import { WaitingItem } from "../waiting-item";

/** Inspections saved on this phone and not yet at the office. */
export function OnThisPhone() {
  const { items, loaded } = useOutbox();
  const mine = items.filter((i) => i.kind === "inspection.file" || i.kind === "inspection.photo");
  if (!loaded || mine.length === 0) return null;
  return (
    <section className="mb-6">
      <h2 className="lbl mb-2">On this phone · not sent yet</h2>
      <ul className="space-y-2">
        {mine.map((i) => (
          <WaitingItem key={i.seq} item={i} />
        ))}
      </ul>
    </section>
  );
}
