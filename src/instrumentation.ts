/**
 * Observability hooks for the web server (Next's own `instrumentation` file
 * convention — node_modules/next/dist/docs/01-app/03-api-reference/
 * 03-file-conventions/instrumentation.md).
 *
 * `register()` is called once per server instance before it serves requests,
 * and is the only place in an app with no custom server where process-level
 * handlers can be attached.
 *
 * The Node-only work is in `./instrumentation-node`, imported dynamically:
 * `register` is compiled for the edge runtime too, and the build fails
 * statically on `process.on`/`process.exit` there no matter how unreachable
 * a plain `if` guard makes them. See that file's own note.
 */
import type { Instrumentation } from "next";
import { logger } from "@/lib/logger";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}

/**
 * Server-side render and route-handler errors, which otherwise reach the
 * browser as an opaque digest in a production build and are written nowhere
 * at all. The digest is logged beside the real message and stack, so a digest
 * a user reads off their screen can actually be traced to a cause.
 */
export const onRequestError: Instrumentation.onRequestError = (err, request) => {
  const message = err instanceof Error ? err.message : String(err);
  const digest =
    typeof err === "object" && err !== null && "digest" in err ? String(err.digest) : undefined;
  logger.error("web.request_error", {
    path: request.path,
    method: request.method,
    digest: digest ?? null,
    message,
    stack: err instanceof Error ? err.stack : undefined,
  });
};
