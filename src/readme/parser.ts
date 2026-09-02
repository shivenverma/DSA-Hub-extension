/**
 * The managed-section splice (PRD §27).
 *
 * The main README is the user's file. DSAHub owns exactly the bytes between its two
 * markers and must not alter a single character outside them — a repository README
 * usually carries a personal intro, badges, or notes that took real effort, and
 * silently rewriting them is the one failure that would make someone uninstall.
 *
 * Everything here is a string operation on purpose. A markdown parser would let us
 * "understand" the document, and understanding is exactly what risks reformatting it.
 */

export const MARKER_START = "<!-- DSAHUB:START -->";
export const MARKER_END = "<!-- DSAHUB:END -->";

/** What a brand-new README opens with, before the managed section (PRD §26). */
const DEFAULT_HEADER = "# 🚀 DSA Solutions\n\nAutomatically synced using DSAHub.";

interface Bounds {
  /** Index of the first character of MARKER_START. */
  start: number;
  /** Index one past the last character of MARKER_END. */
  end: number;
}

/**
 * Locates the managed section, or `null` if there isn't a usable one.
 *
 * Requires the end marker to appear *after* the start marker: a README where they are
 * reversed or where one is missing is treated as having no managed section, so DSAHub
 * appends a fresh one instead of splicing across the user's text.
 */
function findBounds(markdown: string): Bounds | null {
  const start = markdown.indexOf(MARKER_START);
  if (start === -1) return null;
  const end = markdown.indexOf(MARKER_END, start + MARKER_START.length);
  if (end === -1) return null;
  return { start, end: end + MARKER_END.length };
}

export function hasManagedSection(markdown: string): boolean {
  return findBounds(markdown) !== null;
}

/** The current managed content, for callers that need to know whether it changed. */
export function readManagedSection(markdown: string): string | null {
  const bounds = findBounds(markdown);
  if (!bounds) return null;
  return markdown.slice(bounds.start + MARKER_START.length, bounds.end - MARKER_END.length).trim();
}

/**
 * Replaces the managed section's body, or appends a managed section when there is none.
 *
 * `existing` of `null` means the repository has no README at all, which is the only
 * case where DSAHub writes a heading of its own.
 *
 * The one liberty taken with user content: trailing whitespace at the very end of the
 * file is dropped when appending, so the output is deterministic and re-running does
 * not accumulate blank lines.
 */
export function spliceManagedSection(existing: string | null, body: string): string {
  const block = `${MARKER_START}\n\n${body.trim()}\n\n${MARKER_END}`;

  if (existing === null || existing.trim().length === 0) {
    return `${DEFAULT_HEADER}\n\n${block}\n`;
  }

  const bounds = findBounds(existing);
  if (!bounds) {
    return `${existing.replace(/\s+$/, "")}\n\n${block}\n`;
  }

  return `${existing.slice(0, bounds.start)}${block}${existing.slice(bounds.end)}`;
}
