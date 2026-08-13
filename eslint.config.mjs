import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // archive/ is the pre-blueprint application (read-only reference, not
    // live code — see AGENTS.md and PROJECT_CONTEXT.md). Its known,
    // pre-existing lint debt stays there rather than being fixed or
    // silenced per-rule; the new build starts clean and should stay that way.
    "archive/**",
  ]),
]);

export default eslintConfig;
