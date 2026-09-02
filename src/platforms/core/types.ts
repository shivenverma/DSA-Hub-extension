/**
 * The normalized domain model. Everything downstream of a platform adapter —
 * categorization, GitHub sync, README generation — operates on these types only
 * and must never import platform-specific code (PRD §9, Rule 2).
 */

export type Platform = "leetcode" | "gfg";

export type Difficulty = "Easy" | "Medium" | "Hard" | "Unknown";

/** Display names. Internal values stay lowercase (`leetcode` / `gfg`) per PRD §31. */
export const PLATFORM_LABELS: Record<Platform, string> = {
  leetcode: "LeetCode",
  gfg: "GeeksforGeeks",
};

export interface Solution {
  /** Canonical language name, e.g. "C++" — see resolveLanguage(). */
  language: string;
  code: string;
  /** ISO 8601. */
  submittedAt: string;
}

export interface ProblemMetadata {
  platform: Platform;
  /** Stable numeric id where the platform has one (LeetCode). */
  problemId?: string;
  /** URL slug — the identity fallback for platforms without numeric ids (GFG). */
  slug?: string;
  title: string;
  url: string;
  difficulty: Difficulty;
  /** Raw platform tags, before categorization. */
  topics: string[];
}

export interface SubmissionStatus {
  accepted: boolean;
  /** Verbatim platform verdict ("Accepted", "Wrong Answer", ...) for diagnostics. */
  raw?: string;
  submissionId?: string;
}

/** A fully resolved problem, ready to sync. */
export interface Problem extends ProblemMetadata {
  /** Canonical DSA category chosen by the classifier; drives the folder name. */
  primaryCategory: string;
  language: string;
  code: string;
  solvedAt: string;
}

/**
 * The single seam every coding platform implements (PRD §8). Adding a platform
 * means adding one of these — the GitHub and README layers do not change.
 */
export interface CodingPlatformAdapter {
  readonly platform: Platform;
  canHandle(url: string): boolean;
  isProblemPage(url: string): boolean;
  getProblemMetadata(): Promise<ProblemMetadata>;
  getSubmissionStatus(): Promise<SubmissionStatus>;
  getSubmittedSolution(): Promise<Solution>;
  /** Calls back on an accepted submission. Returns an unsubscribe function. */
  watchSubmissions(onAccepted: (submissionId?: string) => void): () => void;
}

/**
 * Duplicate identity is platform-aware: `leetcode:1` and `gfg:two-sum` are
 * different problems that must never collide (PRD §32, Rule 10).
 */
export function problemKey(p: Pick<ProblemMetadata, "platform" | "problemId" | "slug">): string {
  const id = p.problemId ?? p.slug;
  if (!id) throw new Error("Cannot build a problem key without a problemId or slug");
  return `${p.platform}:${id}`;
}
