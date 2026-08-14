import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Vitest over Jest, per docs/engineering/12-test-plan.md line 42's own
// deferred-to-MS-01/02 decision — ESM/TS out of the box, no transform config
// needed alongside this repo's Turbopack-based Next.js setup.
export default defineConfig({
  test: {
    environment: "node",
    exclude: ["node_modules/**", "archive/**", ".next/**"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
