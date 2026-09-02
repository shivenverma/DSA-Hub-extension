import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_ATTEMPTS,
  deferJob,
  dropJob,
  dueJobs,
  enqueue,
  listJobs,
  parkForChoice,
  releaseJob,
} from "@/sync/queue";
import type { Problem } from "@/platforms/core/types";

const T0 = new Date("2026-01-01T12:00:00.000Z");
const MINUTE = 60_000;

function problem(patch: Partial<Problem> = {}): Problem {
  return {
    platform: "leetcode",
    problemId: "1",
    slug: "two-sum",
    title: "Two Sum",
    url: "https://leetcode.com/problems/two-sum/",
    difficulty: "Easy",
    topics: ["Array"],
    primaryCategory: "Arrays",
    language: "C++",
    code: "int main() {}",
    solvedAt: T0.toISOString(),
    ...patch,
  };
}

beforeEach(() => {
  // Nothing in queue.ts uses a timer; only Date.now() is faked, so backoff is assertable.
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("enqueue", () => {
  it("stores the whole normalized problem, not a reference to the page", async () => {
    // The user has already navigated away by the time a retry runs, so the code has to
    // be in storage — it cannot be re-extracted.
    await enqueue(problem(), "GitHub is unreachable.");

    expect(await listJobs()).toEqual([
      {
        id: "leetcode:1",
        problem: problem(),
        attempts: 0,
        nextAttemptAt: T0.getTime(),
        lastError: "GitHub is unreachable.",
        createdAt: T0.toISOString(),
      },
    ]);
  });

  it("keeps one job per problem, however many times it is submitted", async () => {
    await enqueue(problem());
    await enqueue(problem({ code: "int main() { /* faster */ }" }));

    const jobs = await listJobs();
    expect(jobs).toHaveLength(1);
    // The newest submission is the one worth syncing.
    expect(jobs[0]?.problem.code).toBe("int main() { /* faster */ }");
  });

  it("keeps different problems apart, including across platforms", async () => {
    await enqueue(problem());
    await enqueue(problem({ problemId: undefined, platform: "gfg", slug: "two-sum" }));

    expect((await listJobs()).map((job) => job.id)).toEqual(["leetcode:1", "gfg:two-sum"]);
  });

  it("carries the attempt count over a resubmission but makes the job due now", async () => {
    // Otherwise a user resubmitting on a flapping connection resets the backoff every
    // time and the job never exhausts.
    await enqueue(problem());
    await deferJob("leetcode:1", "offline");
    vi.setSystemTime(new Date(T0.getTime() + 10 * MINUTE));

    await enqueue(problem());

    expect(await listJobs()).toMatchObject([
      { attempts: 1, nextAttemptAt: T0.getTime() + 10 * MINUTE, createdAt: T0.toISOString() },
    ]);
  });

  it("survives a service-worker restart, because it lives in storage", async () => {
    await enqueue(problem());

    // A restart is exactly this: the module's own state is gone, storage is not.
    vi.resetModules();
    const { listJobs: freshListJobs } = await import("@/sync/queue");

    expect(await freshListJobs()).toHaveLength(1);
  });

  it("does not lose a job when two submissions land at the same moment", async () => {
    // Both would otherwise read the same empty array and the second set() would win.
    await Promise.all([
      enqueue(problem()),
      enqueue(problem({ problemId: "15", slug: "3sum", title: "3Sum" })),
    ]);

    expect((await listJobs()).map((job) => job.id)).toEqual(["leetcode:1", "leetcode:15"]);
  });
});

describe("dueJobs", () => {
  it("hides a job until its backoff has elapsed", async () => {
    await enqueue(problem());
    await deferJob("leetcode:1", "offline");

    expect(await dueJobs()).toEqual([]);

    vi.setSystemTime(new Date(T0.getTime() + MINUTE));
    expect(await dueJobs()).toHaveLength(1);
  });

  it("returns a freshly queued job immediately", async () => {
    await enqueue(problem());
    expect(await dueJobs()).toHaveLength(1);
  });
});

describe("deferJob", () => {
  it("backs off exponentially — 1, then 2 minutes", async () => {
    await enqueue(problem());

    expect(await deferJob("leetcode:1", "offline")).toBe("retrying");
    expect((await listJobs())[0]).toMatchObject({
      attempts: 1,
      nextAttemptAt: T0.getTime() + MINUTE,
      lastError: "offline",
    });

    expect(await deferJob("leetcode:1", "still offline")).toBe("retrying");
    expect((await listJobs())[0]).toMatchObject({
      attempts: 2,
      nextAttemptAt: T0.getTime() + 2 * MINUTE,
    });
  });

  it(`gives up after ${String(MAX_ATTEMPTS)} attempts and removes the job (PRD §44)`, async () => {
    await enqueue(problem());
    for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt += 1) {
      expect(await deferJob("leetcode:1", "offline")).toBe("retrying");
    }

    // Retrying forever would leave a solution "pending" for the rest of the install.
    expect(await deferJob("leetcode:1", "offline")).toBe("exhausted");
    expect(await listJobs()).toEqual([]);
  });

  it("reports exhausted for a job that is not queued, rather than promising a retry", async () => {
    expect(await deferJob("leetcode:999", "offline")).toBe("exhausted");
  });

  it("leaves the other queued jobs alone", async () => {
    await enqueue(problem());
    await enqueue(problem({ problemId: "15", slug: "3sum", title: "3Sum" }));

    await deferJob("leetcode:1", "offline");

    expect((await listJobs()).find((job) => job.id === "leetcode:15")).toMatchObject({
      attempts: 0,
      nextAttemptAt: T0.getTime(),
    });
  });
});

describe("dropJob", () => {
  it("removes just that job", async () => {
    await enqueue(problem());
    await enqueue(problem({ problemId: "15", slug: "3sum", title: "3Sum" }));

    await dropJob("leetcode:1");

    expect((await listJobs()).map((job) => job.id)).toEqual(["leetcode:15"]);
  });

  it("is silent about a job that has already gone", async () => {
    await expect(dropJob("leetcode:1")).resolves.toBeUndefined();
  });
});

describe("parkForChoice", () => {
  it("holds the submission until the user answers, without a retry answering for them", async () => {
    await parkForChoice(problem());

    expect(await listJobs()).toMatchObject([{ id: "leetcode:1", awaitingChoice: true }]);
    // The whole point: a sweep must not overwrite the saved solution while the question
    // is still on screen.
    expect(await dueJobs()).toEqual([]);
  });

  it("stays parked however long the popup is closed", async () => {
    await parkForChoice(problem());
    vi.setSystemTime(new Date(T0.getTime() + 30 * 24 * 60 * MINUTE));

    expect(await dueJobs()).toEqual([]);
  });

  it("keeps the whole problem, so answering later still has the code to push", async () => {
    await parkForChoice(problem());

    expect((await listJobs())[0]?.problem).toEqual(problem());
  });
});

describe("releaseJob", () => {
  it("makes a parked job due immediately — the user just said yes", async () => {
    await parkForChoice(problem());

    await releaseJob("leetcode:1");

    expect(await dueJobs()).toHaveLength(1);
    expect((await listJobs())[0]?.awaitingChoice).toBeUndefined();
  });

  it("leaves other parked jobs parked", async () => {
    await parkForChoice(problem());
    await parkForChoice(problem({ problemId: "15", slug: "3sum", title: "3Sum" }));

    await releaseJob("leetcode:1");

    expect((await dueJobs()).map((job) => job.id)).toEqual(["leetcode:1"]);
  });

  it("is silent about a job that has already gone", async () => {
    await expect(releaseJob("leetcode:1")).resolves.toBeUndefined();
  });
});
