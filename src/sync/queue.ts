/**
 * The durable retry queue (PRD §44).
 *
 * An accepted submission is a one-shot event: the user has already left the page by the
 * time GitHub is reachable again, and the code cannot be re-extracted. So a sync that
 * fails for a reason worth retrying parks the whole normalized problem in
 * `chrome.storage.local`, where it survives the service worker being evicted and the
 * browser being closed.
 *
 * Backoff lives here rather than in a retry manager of its own: "when should this run
 * again" is a property of the queued job, and a separate module for one arithmetic
 * expression would only add an import.
 */
import type { Problem } from "@/platforms/core/types";
import { problemKey } from "@/platforms/core/types";
import { get, set, type SyncJob } from "@/storage/storage";

/** PRD §44's recommendation. The fourth failure is reported to the user, not retried. */
export const MAX_ATTEMPTS = 3;

/** 1 min → 2 min → 4 min: long enough for a dropped connection, short enough to notice. */
const BASE_DELAY_MS = 60_000;

/**
 * Every mutation is chained onto this promise.
 *
 * `chrome.storage.local` get and set are separate async calls, so two submissions
 * accepted milliseconds apart can both read the same array and the second write
 * silently discards the first job. Serializing makes that impossible, and only one
 * service worker runs at a time so a lock across processes is not needed.
 */
let tail: Promise<unknown> = Promise.resolve();

async function update<T>(mutate: (jobs: SyncJob[]) => [SyncJob[], T]): Promise<T> {
  const run = tail.then(async () => {
    const [next, result] = mutate(await get("queue"));
    await set("queue", next);
    return result;
  });
  // A rejected mutation must not poison every mutation queued behind it.
  tail = run.catch(() => undefined);
  return run;
}

export function listJobs(): Promise<SyncJob[]> {
  return get("queue");
}

/** Jobs whose backoff has elapsed, oldest first. */
export async function dueJobs(): Promise<SyncJob[]> {
  const now = Date.now();
  return (await listJobs()).filter((job) => !job.awaitingChoice && job.nextAttemptAt <= now);
}

/**
 * Queues a problem for retry, replacing any job already queued for it.
 *
 * Keyed by `problemKey`, so submitting the same problem twice while it is queued
 * updates the pending job instead of queueing a second sync of the same solution.
 * The attempt count carries over — a resubmission is not a fresh start, or a flapping
 * connection would retry forever — but the job becomes due immediately, because a new
 * submission is fresh evidence the user is at their machine.
 */
export function enqueue(problem: Problem, lastError?: string): Promise<void> {
  return put(problem, { lastError });
}

/**
 * Parks a re-solve until the user answers the duplicate prompt (PRD §33's `"ask"`).
 *
 * It goes in the same queue as a network failure rather than a store of its own: both
 * are "an accepted submission DSAHub is holding on to", both must survive the worker
 * being evicted, and one of them already existed. `awaitingChoice` is what keeps the
 * retry sweep from answering the question by syncing.
 */
export function parkForChoice(problem: Problem): Promise<void> {
  return put(problem, { awaitingChoice: true });
}

async function put(problem: Problem, extra: Partial<SyncJob>): Promise<void> {
  const id = problemKey(problem);
  const now = Date.now();

  await update((jobs) => {
    const existing = jobs.find((job) => job.id === id);
    const job: SyncJob = {
      id,
      problem,
      attempts: existing?.attempts ?? 0,
      nextAttemptAt: now,
      createdAt: existing?.createdAt ?? new Date(now).toISOString(),
      ...extra,
    };
    return [[...jobs.filter((entry) => entry.id !== id), job], undefined];
  });
}

/** Releases a parked job so the next sweep syncs it — the user chose to update. */
export async function releaseJob(id: string): Promise<void> {
  const now = Date.now();
  await update((jobs) => [
    jobs.map((job) =>
      job.id === id ? { ...job, awaitingChoice: undefined, nextAttemptAt: now } : job,
    ),
    undefined,
  ]);
}

/** Removes a job — synced, or given up on for a reason retrying cannot fix. */
export async function dropJob(id: string): Promise<void> {
  await update((jobs) => [jobs.filter((job) => job.id !== id), undefined]);
}

/**
 * Records a failed attempt. `"retrying"` means the job is still queued behind a longer
 * backoff; `"exhausted"` means it used its attempts and has been removed, so the caller
 * owns telling the user (Rule 14 — a dropped job must not look like a success).
 */
export async function deferJob(id: string, error: string): Promise<"retrying" | "exhausted"> {
  const now = Date.now();

  return update((jobs) => {
    const job = jobs.find((entry) => entry.id === id);
    // Nothing queued under that id: treat it as exhausted so the caller reports the
    // failure rather than promising a retry that will never happen.
    if (!job) return [jobs, "exhausted"];

    const attempts = job.attempts + 1;
    if (attempts >= MAX_ATTEMPTS) return [jobs.filter((entry) => entry.id !== id), "exhausted"];

    const next: SyncJob = {
      ...job,
      attempts,
      lastError: error,
      nextAttemptAt: now + BASE_DELAY_MS * 2 ** (attempts - 1),
    };
    return [jobs.map((entry) => (entry.id === id ? next : entry)), "retrying"];
  });
}
