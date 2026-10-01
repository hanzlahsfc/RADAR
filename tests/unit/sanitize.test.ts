import { describe, expect, it } from 'vitest';
import {
  asCodeSpan,
  escapeTelegramHtml,
  sanitizeUntrustedText,
} from '../../src/shared/sanitize.js';

describe('untrusted text sanitization', () => {
  it('strips control and bidi-override characters', () => {
    const hostile = 'USDC\u202E\u0007\u0000Token';
    const clean = sanitizeUntrustedText(hostile);
    expect(clean).toBe('USDCToken');
  });

  it('collapses whitespace and trims', () => {
    expect(sanitizeUntrustedText('   Hello \n\n World  ')).toBe('Hello World');
  });

  it('bounds the length of untrusted values', () => {
    const result = sanitizeUntrustedText('a'.repeat(100), 10);
    expect(result.length).toBeLessThanOrEqual(10);
    expect(result.endsWith('…')).toBe(true);
  });

  it('escapes HTML metacharacters for Telegram HTML parse mode', () => {
    expect(escapeTelegramHtml('<b>bold</b> & "quotes"')).toBe(
      '&lt;b&gt;bold&lt;/b&gt; &amp; "quotes"',
    );
  });

  it('prevents breaking out of an inline code span', () => {
    const rendered = asCodeSpan('a`b\nc<script>');
    expect(rendered).toBe("<code>a'b c&lt;script&gt;</code>");
    expect(rendered.includes('\n')).toBe(false);
  });

  it('neutralizes a malicious token symbol like a real one', () => {
    const symbol = '<a href="http://evil">CLICK</a>\u202E';
    const label = escapeTelegramHtml(sanitizeUntrustedText(symbol, 32));
    expect(label).not.toContain('<a');
    expect(label).toContain('&lt;a');
  });
});
