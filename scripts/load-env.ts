// A bare side-effecting import, deliberately not a function another module
// calls: ES modules evaluate every import declaration of the importing file
// before any of that file's own top-level statements run, so a `loadEnv()`
// call written after other imports (even textually first) is too late — the
// modules those other imports pull in (db.ts, which reads DATABASE_URL to
// construct its Prisma adapter at import time) have already evaluated with
// whatever `.env`-only state `import "dotenv/config"` left behind. Putting
// the loadEnv() calls in THIS module's own top-level body, and importing
// this module as `import "./load-env"` — the literal first import in the
// importing file — makes their side effects part of ITS evaluation, which
// completes before any later-listed import (db.ts, invoice-intake-extract.ts)
// is evaluated. Same mechanism `dotenv/config` itself already relies on;
// this just also loads `.env.local`, which `dotenv/config` alone does not
// (2026-09-24 — job-worker.ts's `.env.local`-only settings, AWS S3 and
// GEMINI_API_KEY among them, were never loaded, so every
// invoice_intake_sweep read failed with "could not be read back from
// storage" from day one — the S3 GetObjectCommand had no credentials).
import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";

loadEnv({ path: ".env", quiet: true });
if (existsSync(".env.local")) loadEnv({ path: ".env.local", override: true, quiet: true });
