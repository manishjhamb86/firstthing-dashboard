import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  // The stage box has 1.9GB RAM; `next build`'s own type-check pass has
  // twice now been SIGKILLed (OOM) on it (2026-09-30), even at a 1600MB
  // heap that fit until the codebase outgrew it. `tsc --noEmit` is already
  // a required, separate gate in this repo's own validation set before any
  // push — this build's internal type-check is redundant work checking the
  // same thing a second time, and skipping it is what actually frees the
  // memory the build worker was dying for.
  typescript: { ignoreBuildErrors: true },
  experimental: {
    // MS-07 / CON-30. A Server Action request is capped at 1MB by default
    // (node_modules/next/dist/docs/01-app/02-guides/server-actions.md), and a
    // vendor meter export is up to 20MB per SCR-080's own dropzone spec.
    //
    // The alternative — parsing in the browser and sending the 31 daily
    // totals — was rejected deliberately: INV-02 requires every figure to
    // trace to the file that produced it by a reproducible process, and a
    // client that does the arithmetic is a client that can be made to send
    // any number it likes. The parse stays server-side, so the payload has
    // to be able to carry the file.
    serverActions: { bodySizeLimit: "25mb" },
  },
  // The field app's service worker (docs/engineering/19-field-app.md). Never
  // cached by the browser's HTTP cache, so a new version reaches phones on
  // their next visit — Next's own PWA guide's headers for sw.js.
  async headers() {
    return [
      {
        source: "/field-sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          // A CSP delivered with a worker script governs the worker's OWN
          // fetches. The worker uploads photos straight to S3 by presigned
          // PUT, so connect-src must reach the bucket — the guide's bare
          // default-src 'self' silently blocked every photo (found by the e2e).
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self'; connect-src 'self' https://*.amazonaws.com",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
