import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
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
};

export default nextConfig;
