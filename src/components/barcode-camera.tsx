"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Detector = { detect: (src: CanvasImageSource) => Promise<Array<{ rawValue: string }>> };

/**
 * The phone-camera barcode/QR loop, extracted from `ScanClient`
 * (2026-09-25) so the stock-scan flow and the two new uses this shipped
 * alongside (reading a manufacturer's own serial at receiving, and
 * confirming a device's serial at deploy time, 2026-10-06) read raw camera
 * frames through ONE place rather than three copies of the same detector
 * setup that could drift.
 *
 * The browser's own barcode reader is used where there is one (Chrome on
 * Android); otherwise jsQR, loaded only here and only then (iPhone). A code
 * seen again within two seconds is the same sticker still in view, not a
 * second scan — callers never see a duplicate detection from one steady
 * hold.
 */
export function useBarcodeScan(onDetect: (raw: string) => void) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [on, setOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastSeen = useRef<{ code: string; at: number } | null>(null);
  const onDetectRef = useRef(onDetect);
  useEffect(() => {
    onDetectRef.current = onDetect;
  }, [onDetect]);

  const seen = useCallback((raw: string) => {
    const text = raw.trim();
    if (!text) return;
    const now = Date.now();
    if (lastSeen.current && lastSeen.current.code === text && now - lastSeen.current.at < 2000) return;
    lastSeen.current = { code: text, at: now };
    navigator.vibrate?.(60);
    onDetectRef.current(text);
  }, []);

  useEffect(() => {
    if (!on) return;
    let stream: MediaStream | null = null;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      } catch {
        setError("The camera could not be opened. Allow camera access for this site, or type it below.");
        setOn(false);
        return;
      }
      const v = video.current!;
      v.srcObject = stream;
      await v.play().catch(() => {});
      const Native = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
      let detector: Detector | null = null;
      if (Native) {
        try {
          detector = new Native({ formats: ["qr_code", "code_128", "ean_13", "code_39"] });
        } catch {
          detector = null;
        }
      }
      const jsQR = detector ? null : (await import("jsqr")).default;
      const tick = async () => {
        if (stopped) return;
        if (v.readyState >= 2 && v.videoWidth) {
          try {
            if (detector) {
              for (const b of await detector.detect(v)) seen(b.rawValue);
            } else if (jsQR) {
              const c = canvas.current!;
              const w = Math.min(v.videoWidth, 800);
              const h = Math.round((v.videoHeight / v.videoWidth) * w);
              c.width = w;
              c.height = h;
              const g = c.getContext("2d", { willReadFrequently: true })!;
              g.drawImage(v, 0, 0, w, h);
              const found = jsQR(g.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" });
              if (found?.data) seen(found.data);
            }
          } catch {
            /* a frame that fails to decode is just a frame; keep going */
          }
        }
        timer = setTimeout(tick, 200);
      };
      tick();
    })();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [on, seen]);

  return { videoRef: video, canvasRef: canvas, on, setOn, error, setError };
}
