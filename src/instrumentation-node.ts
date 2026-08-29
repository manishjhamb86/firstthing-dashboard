/**
 * Process-level lifecycle logging for the web server. Node runtime ONLY.
 *
 * This lives in its own module and is dynamically imported from
 * `instrumentation.ts` behind a `NEXT_RUNTIME === "nodejs"` check, which is
 * Next's own documented pattern for runtime-specific code
 * (node_modules/next/dist/docs/01-app/02-guides/instrumentation.md §
 * "Importing runtime-specific code"). A plain `if` guard inside
 * instrumentation.ts is NOT enough: `register` is compiled for the edge
 * runtime too, where `process.on` and `process.exit` do not exist, and the
 * build fails statically on them however unreachable they are at runtime.
 *
 * Why any of it exists: pm2 reported 1472 restarts on this process with no
 * attributable cause (user-asked 2026-08-29). A deploy and a crash looked
 * identical from the outside. Now every exit writes one line first, so the
 * PAIR is the answer — a `web.server_started` with no `web.server_stopping`
 * before it was not a deploy, whatever anybody remembers.
 */
import { logger } from "@/lib/logger";

logger.info("web.server_started", {
  pid: process.pid,
  node: process.version,
  // Set this in the deploy so a restart storm is attributable to a release
  // rather than guessed at.
  commit: process.env.GIT_COMMIT ?? null,
});

let stopping = false;

function exit(event: "web.server_stopping" | "web.server_crashed", fields: Record<string, unknown>, code: number) {
  // One reason per exit: a fault during shutdown must not overwrite the
  // reason already recorded for it.
  if (stopping) return;
  stopping = true;
  const write = event === "web.server_stopping" ? logger.info : logger.error;
  write(event, { pid: process.pid, uptimeSec: Math.round(process.uptime()), ...fields });
  process.exit(code);
}

for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"] as const) {
  process.on(signal, () => {
    // pm2 restart/stop lands here — the DEPLOY case, an orderly stop somebody
    // asked for rather than a failure.
    exit("web.server_stopping", { signal, reason: "signal" }, 0);
  });
}

process.on("uncaughtException", (err) => {
  exit(
    "web.server_crashed",
    { reason: "uncaughtException", name: err.name, message: err.message, stack: err.stack },
    1,
  );
});

process.on("unhandledRejection", (reason) => {
  // Recorded, not fatal: one rejected promise must not take down a server
  // that is still answering every other request.
  logger.error("web.unhandled_rejection", {
    pid: process.pid,
    error: reason instanceof Error ? (reason.stack ?? reason.message) : String(reason),
  });
});
