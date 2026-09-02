import { describe, expect, it } from "vitest";
import { summarize, waitingReason } from "@/popup/summary";
import type { SyncJob, SyncRecord } from "@/storage/storage";
import type { Problem } from "@/platforms/core/types";

function record(patch: Partial<SyncRecord> = {}): SyncRecord {
  return {
    platform: "leetcode",
    problemId: "1",
    title: "Two Sum",
    url: "https://leetcode.com/problems/two-sum/",
    githubPath: "Arrays/0001-Two-Sum/solution.cpp",
    difficulty: "Easy",
    primaryCategory: "Arrays",
    topics: ["Array"],
    language: "C++",
    solvedAt: "2026-01-01T12:00:00.000Z",
    status: "success",
    ...patch,
  };
}

function index(...records: SyncRecord[]): Record<string, SyncRecord> {
  return Object.fromEntries(records.map((entry, i) => [`key:${String(i)}`, entry]));
}

function job(patch: Partial<SyncJob> = {}): SyncJob {
  return {
    id: "leetcode:1",
    problem: { title: "Two Sum" } as Problem,
    attempts: 0,
    nextAttemptAt: 0,
    createdAt: "2026-01-01T12:00:00.000Z",
    ...patch,
  };
}

describe("summarize", () => {
  it("counts only successes as synced (Rule 14)", () => {
    const summary = summarize(
      index(
        record(),
        record({ status: "failed" }),
        record({ status: "pending" }),
        record({ platform: "gfg" }),
      ),
      [],
    );

    expect(summary).toMatchObject({ total: 2, failed: 1, pending: 1 });
  });

  it("breaks the total down by platform, in the README's fixed order", () => {
    const summary = summarize(
      index(record(), record({ platform: "gfg" }), record({ platform: "gfg" })),
      [],
    );

    // Same rows as the committed README, zeros and all, so the two cannot disagree.
    expect(summary.byPlatform).toEqual([
      { key: "leetcode", count: 1 },
      { key: "gfg", count: 2 },
    ]);
  });

  it("lists recent syncs newest first", () => {
    const summary = summarize(
      index(
        record({ title: "Older", solvedAt: "2026-01-01T00:00:00.000Z" }),
        record({ title: "Newest", solvedAt: "2026-03-01T00:00:00.000Z" }),
        record({ title: "Middle", solvedAt: "2026-02-01T00:00:00.000Z" }),
      ),
      [],
    );

    expect(summary.recent.map((entry) => entry.title)).toEqual(["Newest", "Middle", "Older"]);
  });

  it("keeps the recent list short", () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      record({ solvedAt: `2026-01-${String(i + 10)}T00:00:00.000Z` }),
    );

    expect(summarize(index(...many), []).recent).toHaveLength(5);
  });

  it("leaves failures out of the recent list — they did not happen", () => {
    const summary = summarize(index(record({ status: "failed", title: "Nope" })), []);

    expect(summary.recent).toEqual([]);
    expect(summary.failed).toBe(1);
  });

  it("puts jobs waiting on the user above jobs waiting on a retry", () => {
    // A retry gets to the rest by itself; nothing but the user moves a parked job, so it
    // must not be pushed below the fold.
    const summary = summarize({}, [
      job({ id: "retrying" }),
      job({ id: "parked", awaitingChoice: true }),
    ]);

    expect(summary.waiting.map((entry) => entry.id)).toEqual(["parked", "retrying"]);
  });

  it("does not mutate the queue it was handed", () => {
    const queue = [job({ id: "a" }), job({ id: "b", awaitingChoice: true })];

    summarize({}, queue);

    expect(queue.map((entry) => entry.id)).toEqual(["a", "b"]);
  });

  it("reports zeros for a fresh install rather than nothing", () => {
    expect(summarize({}, [])).toEqual({
      total: 0,
      byPlatform: [
        { key: "leetcode", count: 0 },
        { key: "gfg", count: 0 },
      ],
      failed: 0,
      pending: 0,
      recent: [],
      waiting: [],
    });
  });

  it("shows a queued problem even when the index has no record of it", () => {
    // The submission arrived, was held, and must be visible somewhere (Rule 14).
    expect(summarize({}, [job()]).waiting).toHaveLength(1);
  });
});

describe("waitingReason", () => {
  it("asks the question for a parked re-solve", () => {
    expect(waitingReason(job({ awaitingChoice: true }))).toMatch(/choose whether to replace/);
  });

  it("names the failure and the next attempt for a retrying job", () => {
    const reason = waitingReason(job({ attempts: 1, lastError: "GitHub is unreachable." }));

    expect(reason).toBe("GitHub is unreachable. Retrying — attempt 2.");
  });

  it("says a job with no failure yet is queued", () => {
    expect(waitingReason(job())).toBe("Queued.");
  });

  it("never reads as synced, whatever the job is waiting for", () => {
    const all = [job(), job({ awaitingChoice: true }), job({ lastError: "offline" })];

    for (const entry of all) expect(waitingReason(entry)).not.toMatch(/\bsynced\b|\bcommitted\b/i);
  });
});
