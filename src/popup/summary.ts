/**
 * The numbers and lists the popup renders (PRD §41, §43).
 *
 * Pure, and separate from the components, so the arithmetic behind "229 synced, 2 failed"
 * can be tested without mounting React. The project has no DOM testing library, and adding
 * one to assert three counts would cost more than it proves.
 *
 * The platform totals come from `computeStatistics` — the same function that builds the
 * committed README — so the popup and the repository cannot disagree about how much is
 * solved (Rule 14).
 */
import type { Difficulty, Platform } from "@/platforms/core/types";
import { calculateDifficultyStats, computeStatistics, type Count, type DifficultyStats } from "@/readme/statistics";
import type { SyncJob, SyncRecord } from "@/storage/storage";

/** How many recent syncs the popup lists. PRD §41's mock shows three; five fits. */
const RECENT = 5;

export interface Summary {
  /** PRD §41's Progress total, and §43's "synced" count. One number, computed once. */
  total: number;
  byPlatform: Count<Platform>[];
  byDifficulty: Count<Difficulty>[];
  difficultyStats: DifficultyStats;
  failed: number;
  pending: number;
  /** Most recently solved first. Only successes — the others are in `waiting`. */
  recent: SyncRecord[];
  /** Everything DSAHub is holding, whatever it is waiting for. */
  waiting: SyncJob[];
}

export function summarize(index: Record<string, SyncRecord>, queue: SyncJob[]): Summary {
  const records = Object.values(index);
  const withStatus = (status: SyncRecord["status"]): SyncRecord[] =>
    records.filter((record) => record.status === status);

  const { total, byPlatform, byDifficulty } = computeStatistics(index);
  const difficultyStats = calculateDifficultyStats(index);

  return {
    total,
    byPlatform,
    byDifficulty,
    difficultyStats,
    failed: withStatus("failed").length,
    pending: withStatus("pending").length,
    recent: withStatus("success")
      .sort((a, b) => b.solvedAt.localeCompare(a.solvedAt))
      .slice(0, RECENT),
    // Jobs waiting on an answer come first: nothing moves them but the user, whereas a
    // retry will get to the rest on its own.
    waiting: [...queue].sort((a, b) => Number(b.awaitingChoice ?? false) - Number(a.awaitingChoice ?? false)),
  };
}

/**
 * What a held job is waiting for, as a sentence.
 *
 * Rule 14 in one function: a job with attempts left promises a retry, a parked one asks a
 * question, and neither is allowed to read like it synced.
 */
export function waitingReason(job: SyncJob): string {
  if (job.awaitingChoice) return "Waiting for you to choose whether to replace the saved solution.";
  if (job.lastError) return `${job.lastError} Retrying — attempt ${String(job.attempts + 1)}.`;
  return "Queued.";
}
