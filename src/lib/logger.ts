// Structured JSON logs to stdout, captured by pm2 — the approach
// docs/engineering/09-architecture.md §7 ("Observability & operations")
// commits to, sized for a solo operator reading `pm2 logs` rather than an
// enterprise log-aggregation stack. One line per event, always valid JSON,
// so it stays greppable/parseable even as volume grows.
type LogFields = Record<string, unknown>;

function write(level: "info" | "warn" | "error", event: string, fields?: LogFields) {
  const line = {
    ts: new Date().toISOString(),
    level,
    event,
    ...fields,
  };
  console.log(JSON.stringify(line));
}

export const logger = {
  info: (event: string, fields?: LogFields) => write("info", event, fields),
  warn: (event: string, fields?: LogFields) => write("warn", event, fields),
  error: (event: string, fields?: LogFields) => write("error", event, fields),
};
