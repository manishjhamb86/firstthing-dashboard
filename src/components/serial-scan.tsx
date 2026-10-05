"use client";

import { useState } from "react";
import { useBarcodeScan } from "@/components/barcode-camera";

/**
 * A compact, mount-anywhere camera scanner for reading a device's OWN
 * printed serial or barcode — not one of our own unit/batch codes (that's
 * `ScanClient`'s job on `/admin/inventory/scan`). Used both at receiving,
 * for a serial-tracked item type, and at deploy time to confirm what's
 * physically in hand against what's on record (2026-10-06, user-asked) —
 * reading what the device itself says rather than trusting it was typed
 * correctly either time.
 *
 * `onScan` fires once per distinct read (the shared hook's own 2-second
 * same-code dedup, so holding the camera steady on one label doesn't fire
 * repeatedly) and once per manual Add — the caller decides what "add" means
 * (append to a list, compare against a stored value, etc).
 */
export function SerialScanButton({ onScan, label = "Scan" }: { onScan: (text: string) => void; label?: string }) {
  const [typed, setTyped] = useState("");
  const { videoRef, canvasRef, on, setOn, error, setError } = useBarcodeScan(onScan);

  return (
    <div className="space-y-2">
      <button
        type="button"
        className={on ? "btn-secondary btn-sm" : "btn-ghost btn-sm"}
        onClick={() => {
          setError(null);
          setOn((x) => !x);
        }}
      >
        {on ? "Stop camera" : label}
      </button>
      {on && (
        <div className="relative overflow-hidden rounded-lg" style={{ background: "#000", aspectRatio: "4 / 3", maxWidth: 320 }}>
          <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
          <div className="pointer-events-none absolute inset-[18%] rounded-lg border-2" style={{ borderColor: "rgba(255,255,255,.8)" }} />
        </div>
      )}
      <canvas ref={canvasRef} className="hidden" />
      {error && (
        <p className="text-[12px]" style={{ color: "var(--bad-fg)" }}>
          {error}
        </p>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (typed.trim()) onScan(typed.trim());
          setTyped("");
        }}
      >
        <input
          className="field field-auto"
          placeholder="Or type it"
          aria-label="Serial number"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
        />
        <button type="submit" className="btn-ghost btn-sm">
          Add
        </button>
      </form>
    </div>
  );
}
