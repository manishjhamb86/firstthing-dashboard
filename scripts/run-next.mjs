#!/usr/bin/env node
// Next's own PORT env support can't read .env — the CLI binds the port before any
// env-file loading happens (node_modules/next/dist/docs/01-app/03-api-reference/06-cli/next.md:
// "PORT cannot be set in .env as booting up the HTTP server happens before any other code
// is initialized"). This loads .env/.env.local ourselves first, so PORT reaches `next`
// as a real environment variable before its CLI parses args — same as `PORT=4000 next dev`.
import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";

loadEnv({ path: ".env" });
if (existsSync(".env.local")) loadEnv({ path: ".env.local", override: true });

const child = spawn("next", process.argv.slice(2), { stdio: "inherit", env: process.env });

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
