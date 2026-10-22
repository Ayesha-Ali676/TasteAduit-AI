/**
 * Safe Logger Utility for TasteAudit
 * Ensures secrets, keys, and authorization headers are never logged.
 */

function scrubMessage(message: string): string {
  // Scrub API key patterns and token strings
  return message
    .replace(/(qloo_live|live_)[a-zA-Z0-9_\-]+/gi, '[REDACTED_API_KEY]')
    .replace(/(bearer\s+)[a-zA-Z0-9_\-\.]+/gi, '$1[REDACTED_TOKEN]')
    .replace(/("?(api[-_]?key|secret|token)"?\s*[:=]\s*"?[^"\s,]+"?)/gi, '[REDACTED_SECRET]');
}

export const logger = {
  info: (msg: string, ...args: unknown[]) => {
    console.log(`[INFO] ${scrubMessage(msg)}`, ...args);
  },
  warn: (msg: string, ...args: unknown[]) => {
    console.warn(`[WARN] ${scrubMessage(msg)}`, ...args);
  },
  error: (msg: string, ...args: unknown[]) => {
    console.error(`[ERROR] ${scrubMessage(msg)}`, ...args);
  },
  debug: (msg: string, ...args: unknown[]) => {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(`[DEBUG] ${scrubMessage(msg)}`, ...args);
    }
  }
};
