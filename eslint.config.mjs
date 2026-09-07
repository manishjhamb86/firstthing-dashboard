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
  {
    // ONE module decides how a date looks (the user's own rule, 2026-09-08:
    // "there should be a global function to format date. pass every date to
    // that function before serving it to frontend"). A screen that reaches
    // for toLocaleDateString invents a second format, which is how
    // "23-07-2026" and "2026-08-01" ended up on one page — so the build
    // refuses it outside src/lib/format-date.ts, and an exception has to be
    // written down as a disable comment rather than happening by accident.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/format-date.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression > MemberExpression[property.name=/^(toLocaleDateString|toLocaleTimeString)$/]",
          message:
            "Dates are formatted in one place: import formatDate / formatInstant / longDate / monthLabel / dayShort from @/lib/format-date. Add a rule there rather than a second format here.",
        },
      ],
    },
  },
]);

export default eslintConfig;
