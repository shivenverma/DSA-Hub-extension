/**
 * README statistics (PRD §28).
 *
 * Counts come from the sync index — the same records the dashboard's tables are built
 * from — so the totals can never disagree with the rows beneath them.
 *
 * Only `status: "success"` records are counted. A queued or failed sync has no file in
 * the repository, and counting it would put a number in the user's portfolio for work
 * that is not there (Rule 14).
 */
import type { Difficulty, Platform } from "@/platforms/core/types";
import type { SyncRecord } from "@/storage/storage";

/** Fixed display order; a table whose rows reorder on every sync produces noise diffs. */
const PLATFORM_ORDER: Platform[] = ["leetcode", "gfg"];
const DIFFICULTY_ORDER: Difficulty[] = ["Easy", "Medium", "Hard", "Unknown"];

export interface Count<T> {
  key: T;
  count: number;
}

export interface DifficultyStats {
  easy: number;
  medium: number;
  hard: number;
  unknown: number;
  total: number;
}

export interface Statistics {
  total: number;
  /** Every supported platform, in a fixed order — including those with zero solved. */
  byPlatform: Count<Platform>[];
  /** Easy/Medium/Hard always; Unknown only when something actually landed there. */
  byDifficulty: Count<Difficulty>[];
  /** Primary categories, most-solved first (PRD §21 organizes by primary category). */
  byCategory: Count<string>[];
  byLanguage: Count<string>[];
}

/**
 * Normalizes any raw difficulty input to standard Difficulty type.
 * Unrecognized or missing values safely become "Unknown".
 */
export function normalizeDifficulty(raw: unknown): Difficulty {
  if (typeof raw !== "string") return "Unknown";
  const trimmed = raw.trim().toLowerCase();
  if (trimmed === "easy") return "Easy";
  if (trimmed === "medium") return "Medium";
  if (trimmed === "hard") return "Hard";
  return "Unknown";
}

export function syncedRecords(index: Record<string, SyncRecord>): SyncRecord[] {
  return Object.values(index).filter((record) => record.status === "success");
}

/**
 * Deduplicates an array of records by platform + problemId/slug, keeping only successful syncs.
 */
export function dedupeSuccessfulRecords(records: SyncRecord[]): SyncRecord[] {
  const successful = records.filter((record) => record.status === "success");
  const map = new Map<string, SyncRecord>();
  for (const record of successful) {
    const id = record.problemId ?? record.slug;
    const key = id ? `${record.platform}:${id}` : `${record.platform}:${record.title}`;
    map.set(key, record);
  }
  return Array.from(map.values());
}

/**
 * Calculates easy, medium, hard, unknown, and total counts for successfully synced problems.
 * Handles both Record<string, SyncRecord> indices and SyncRecord[] arrays with deduplication.
 */
export function calculateDifficultyStats(
  input: Record<string, SyncRecord> | SyncRecord[],
): DifficultyStats {
  const records = Array.isArray(input)
    ? dedupeSuccessfulRecords(input)
    : syncedRecords(input);

  let easy = 0;
  let medium = 0;
  let hard = 0;
  let unknown = 0;

  for (const record of records) {
    const diff = normalizeDifficulty(record.difficulty);
    switch (diff) {
      case "Easy":
        easy++;
        break;
      case "Medium":
        medium++;
        break;
      case "Hard":
        hard++;
        break;
      case "Unknown":
        unknown++;
        break;
    }
  }

  return {
    easy,
    medium,
    hard,
    unknown,
    total: records.length,
  };
}

export function computeStatistics(index: Record<string, SyncRecord>): Statistics {
  const records = syncedRecords(index);

  return {
    total: records.length,
    byPlatform: PLATFORM_ORDER.map((platform) => ({
      key: platform,
      count: records.filter((record) => record.platform === platform).length,
    })),
    byDifficulty: DIFFICULTY_ORDER.map((difficulty) => ({
      key: difficulty,
      count: records.filter((record) => normalizeDifficulty(record.difficulty) === difficulty).length,
      // Unknown is a real state (PRD §30), but an all-zero row is just clutter.
    })).filter((row) => row.key !== "Unknown" || row.count > 0),
    byCategory: tally(records, (record) => record.primaryCategory),
    byLanguage: tally(records, (record) => record.language),
  };
}

/**
 * Counts by an extracted key, most frequent first. Ties break alphabetically rather
 * than by insertion order, so the table is stable no matter what order problems were
 * solved in — the same index must always render the same README.
 */
function tally(records: SyncRecord[], keyOf: (record: SyncRecord) => string): Count<string>[] {
  const counts = new Map<string, number>();
  for (const record of records) {
    const key = keyOf(record) || "Unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}
