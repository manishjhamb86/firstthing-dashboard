"use client";

import { useState } from "react";
import { Card, CardTitle, StatusChip } from "@/components/ui";
import { SerialScanButton } from "@/components/serial-scan";

/** A manufacturer serial read off two different labels rarely matches byte for byte — trimmed and case-insensitive is the honest comparison. */
function serialsMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Confirms, by camera, that the physical device in hand is the one on
 * record before it goes in (2026-10-06, user-asked: "when any device is
 * getting installed also use the scanner to verify which item getting
 * installed — not for light inventory, but for things like smart meter or
 * wifi"). Deliberately an aid alongside the existing deploy form, not a
 * gate on it: the recorded serial can itself be wrong (mistyped at
 * receiving), and this screen has no way to tell which of the two is at
 * fault — it states the mismatch plainly and lets the installer, who is
 * standing in front of the actual device, decide.
 */
export function DeploySerialCheck({ expectedSerial, itemName }: { expectedSerial: string | null; itemName: string }) {
  const [scanned, setScanned] = useState<string | null>(null);

  const match = scanned !== null && expectedSerial !== null ? serialsMatch(scanned, expectedSerial) : null;

  return (
    <Card className="p-5">
      <CardTitle>Confirm the device before installing</CardTitle>
      <p className="mb-3 text-[13px] text-[var(--text-muted)]">
        Scan the {itemName.toLowerCase()}&rsquo;s own printed serial to confirm this is the right unit before it goes in.
      </p>
      {expectedSerial === null && (
        <p className="mb-3 text-[13px]" style={{ color: "var(--warn-fg)" }}>
          No serial was recorded for this unit at receiving — a scan can show what the device itself says, but there is nothing on record to confirm it against.
        </p>
      )}
      <SerialScanButton
        label="Scan to confirm"
        onScan={(code) => setScanned(code)}
      />
      {scanned !== null && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px]">
          <span className="num font-mono">{scanned}</span>
          {expectedSerial === null ? (
            <StatusChip tone="neu">Nothing on record to compare</StatusChip>
          ) : match ? (
            <StatusChip tone="ok">Matches the recorded serial</StatusChip>
          ) : (
            <StatusChip tone="bad">Does not match — recorded as {expectedSerial}</StatusChip>
          )}
        </div>
      )}
    </Card>
  );
}
