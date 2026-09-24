/**
 * What to tell the operator when a read request itself fails (as opposed to
 * the reader refusing, which comes back as a typed `{ error }`). The usual
 * cause is the connection giving up while the server is still waiting on the
 * reader's rate limit — the server then finishes and saves the read anyway
 * (stage, 2026-09-25: nginx 504 at 19:12:32, `intake.extracted` at 19:13:26).
 * So say that, rather than the browser's "An unexpected response was
 * received from the server", which reads as a failure that lost the work.
 */
export const READ_CUT_OFF_MESSAGE =
  "The read took longer than the connection allows. It may still finish on the server — refresh in a minute before retrying.";
