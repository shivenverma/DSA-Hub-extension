/**
 * Repository paths (PRD §22–§24).
 *
 * Everything a solution's location depends on lives here, so the sync engine never
 * builds a path by string concatenation. Every function is pure and deterministic:
 * the same problem must always resolve to the same path, or re-solving it would create
 * a second copy instead of updating the first (PRD §33).
 *
 * `sanitizeSegment` is exported rather than kept private because its edge cases — the
 * characters PRD §23 forbids, the length cap, a title that sanitizes to nothing — are
 * the part worth testing directly.
 */
import type { Problem } from "@/platforms/core/types";
import { resolveLanguage } from "@/languages";
import type { Config } from "@/storage/storage";

/**
 * Longest a single path segment may be. Well under git's 255-byte component limit, and
 * chosen so the longest real problem titles survive intact rather than being cut.
 */
const MAX_SEGMENT = 80;

/**
 * PRD §23 lists `/ \ : ? * < > | "` as forbidden. Rather than removing exactly those
 * and leaving whatever else a title contains, every run of non-alphanumerics becomes a
 * single hyphen — the shape people's DSA repositories already use, and safe on every
 * filesystem a clone might land on.
 *
 * Apostrophes go first so "Kadane's Algorithm" reads `Kadanes-Algorithm` rather than
 * `Kadane-s-Algorithm`.
 */
export function sanitizeSegment(raw: string, maxLength = MAX_SEGMENT): string {
  const collapsed = raw
    .trim()
    .replace(/['‘’]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (collapsed.length <= maxLength) return collapsed || "untitled";

  // Cut at a hyphen when one is close to the limit, so the name ends on a whole word.
  const clipped = collapsed.slice(0, maxLength);
  const lastHyphen = clipped.lastIndexOf("-");
  const cut = lastHyphen > maxLength / 2 ? clipped.slice(0, lastHyphen) : clipped;
  return cut.replace(/-+$/, "") || "untitled";
}

/** `Dynamic Programming` → `Dynamic-Programming` (PRD §22). */
export function categoryFolder(category: string): string {
  return sanitizeSegment(category);
}

/**
 * `0001-Two-Sum` for a platform with stable numeric ids, `two-sum` for one without
 * (PRD §23). The id is zero-padded to four digits so a directory listing sorts the way
 * the problem numbers do; ids that are not four-digit numbers are used verbatim rather
 * than mangled.
 */
export function problemFolder(problem: Problem): string {
  const title = sanitizeSegment(problem.title);
  if (problem.problemId) return `${padId(problem.problemId)}-${title}`;
  if (problem.slug) return sanitizeSegment(problem.slug);
  return title;
}

function padId(id: string): string {
  return /^\d{1,4}$/.test(id) ? id.padStart(4, "0") : sanitizeSegment(id, 16);
}

/** `solution.py` / `two-sum.py` / `main.py`, per the user's choice (PRD §24). */
export function solutionFileName(problem: Problem, naming: Config["fileNaming"]): string {
  const { ext } = resolveLanguage(problem.language);
  const stem =
    naming === "problem-name" ? sanitizeSegment(problem.title) : naming === "main" ? "main" : "solution";
  return `${stem}.${ext}`;
}

/** The directory every file for one problem lives in. */
export function problemDir(problem: Problem): string {
  return `${categoryFolder(problem.primaryCategory)}/${problemFolder(problem)}`;
}

export function solutionPath(problem: Problem, naming: Config["fileNaming"]): string {
  return `${problemDir(problem)}/${solutionFileName(problem, naming)}`;
}

export function problemReadmePath(problem: Problem): string {
  return `${problemDir(problem)}/README.md`;
}
