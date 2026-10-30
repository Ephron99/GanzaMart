// Tiny leveled logger.
// Rule (spec §9): never log passwords, tokens or payment data. Log the WHAT/WHO,
// not the sensitive payload. Swap for winston/pino later without touching callers.
const fmt = (level, args) => [`[${new Date().toISOString()}] [${level}]`, ...args];

export const logger = {
  info: (...a) => console.log(...fmt('INFO ', a)),
  warn: (...a) => console.warn(...fmt('WARN ', a)),
  // error objects are printed as code + message only — no stack traces with secrets
  error: (...a) => console.error(
    ...fmt('ERROR', a.map((x) => (x instanceof Error ? `${x.code || x.name}: ${x.message}` : x)))
  ),
};
