/**
 * Token symbols/names and labels are UNTRUSTED. They may contain control
 * characters, bidi overrides, or markup intended to spoof messages. Sanitize
 * before storing for display; escape again for the specific sink (e.g. HTML).
 */

/* eslint-disable no-control-regex -- this expression intentionally removes control characters from untrusted labels. */
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const BIDI_OVERRIDES = /[\u202A-\u202E\u2066-\u2069]/g;

/** Remove control/bidi characters, collapse whitespace, and bound the length. */
export function sanitizeUntrustedText(input: string, maxLength = 64): string {
  const cleaned = input
    .replace(CONTROL_CHARS, '')
    .replace(BIDI_OVERRIDES, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length <= maxLength) {
    return cleaned;
  }
  return `${cleaned.slice(0, Math.max(0, maxLength - 1))}…`;
}

/** Escape text for Telegram HTML parse mode. */
export function escapeTelegramHtml(input: string): string {
  return input.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Render a value as an inline code span for Telegram, escaping backticks and
 * newlines so untrusted content cannot break out of the code span.
 */
export function asCodeSpan(input: string): string {
  const escaped = escapeTelegramHtml(input)
    .replace(/`/g, "'")
    .replace(/[\r\n]+/g, ' ');
  return `<code>${escaped}</code>`;
}
