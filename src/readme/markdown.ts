/**
 * Markdown escaping for values that come from a web page.
 *
 * Problem titles, topic names and language names are all platform-supplied strings
 * being dropped into markdown. Most are harmless; a `_`, `*` or `<` is not, and the
 * result is a heading that renders as italics or swallows the rest of the line.
 *
 * Deliberately conservative: parentheses, commas and periods are left alone, so
 * `Pow(x, n)` and `String to Integer (atoi)` read the way they do on the platform.
 * Over-escaping is its own bug — `Pow\(x, n\)` in a heading is worse than the risk.
 */

/** Characters that change how markdown renders the surrounding text. */
const INLINE = /[\\`*_[\]<>|]/g;

export function escapeInline(text: string): string {
  return text.replace(INLINE, (char) => `\\${char}`);
}

/**
 * A table cell additionally cannot contain a newline — the row would end early and the
 * table would lose its shape. Used by the main README's tables (PRD §26).
 */
export function escapeCell(text: string): string {
  return escapeInline(text.replace(/\s*\r?\n\s*/g, " ")).trim();
}
