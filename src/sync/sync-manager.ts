/**
 * One accepted submission → one commit (PRD §45, §46).
 *
 * This is the whole pipeline: classify the problem, decide whether it is a re-solve,
 * render the files, read what is already in the repository, and commit only what
 * differs. Everything it composes was built and tested in earlier milestones; the value
 * here is the order and the decisions between the steps.
 *
 * There is no state machine. PRD §15's states are a straight line with no branch except
 * failure, so the pipeline *is* the sequence of awaits — a transition table would
 * describe the same order twice and let the two drift apart. Progress reporting arrives
 * with the UI that consumes it (PRD §41).
 *
 * PRD §45 contemplates a partial sync ("solution uploaded, main README failed"). That
 * outcome is unreachable here by construction: `commitFiles` moves all three files as a
 * single commit, so there is no state in which the README advertises a solution that is
 * not in the tree. Rule 14 is satisfied by the shape of the write, not by a message
 * apologising afterwards.
 *
 * The sync index is the source of truth for the main README. Nothing here reads the
 * repository to rebuild it: a user who wipes extension storage but keeps the repository
 * would see the dashboard shrink to the problems solved since. Reconstructing an index
 * from a tree is a recovery feature the PRD does not ask for.
 */
import { classify } from "@/categorization";
import type { GitHubClient, GitHubFile } from "@/github/client";
import { GitHubError, fromBase64 } from "@/github/client";
import { commitFiles, type CommitFile, type CommitTarget } from "@/github/commit";
import { resolveTarget } from "@/github/repository";
import type { Problem, ProblemMetadata, Solution } from "@/platforms/core/types";
import { PLATFORM_LABELS, problemKey } from "@/platforms/core/types";
import { generateReadme } from "@/readme/generator";
import { renderProblemReadme } from "@/readme/problem-readme";
import { get, set, type Config, type SyncRecord } from "@/storage/storage";
import { problemReadmePath, solutionFileName, solutionPath } from "@/utils/paths";
import { deferJob, dropJob, dueJobs } from "./queue";

const MAIN_README = "README.md";

export interface SyncOutcome {
  /**
   * `synced` — a commit landed. `unchanged` — the repository already holds exactly this
   * content, so there was nothing to commit. `skipped` — a re-solve the user's settings
   * said to leave alone. Only `synced` means new work reached GitHub (Rule 14).
   */
  status: "synced" | "unchanged" | "skipped";
  problemKey: string;
  /** Where the solution lives in the repository. */
  path: string;
  commitSha?: string;
  /** A sentence for the user, set whenever nothing was committed. */
  reason?: string;
}

/**
 * The classification step: platform metadata plus the extracted code become a problem
 * ready to sync. Pure and deterministic, so it happens before queueing — a retry must
 * never file the same problem under a different category than the first attempt.
 */
export function toProblem(metadata: ProblemMetadata, solution: Solution): Problem {
  return {
    ...metadata,
    primaryCategory: classify(metadata.topics, metadata.title),
    language: solution.language,
    code: solution.code,
    solvedAt: solution.submittedAt,
  };
}

/**
 * Whether the repository already holds a successful sync of this problem.
 *
 * Exported because the re-solve decision has two homes and must not drift: `runSync`
 * handles `"ignore"` inline, and the worker needs the same answer *before* syncing to
 * put up PRD §33's `"ask"` prompt.
 */
export async function isAlreadySynced(problem: Problem): Promise<boolean> {
  return (await get("syncIndex"))[problemKey(problem)]?.status === "success";
}

/**
 * Syncs one problem. Throws `GitHubError` on failure, after recording it — the caller
 * owns the queue, because whether to retry is a decision about the *submission*, not
 * about the commit.
 */
export async function syncProblem(
  api: GitHubClient,
  problem: Problem,
  config: Config,
): Promise<SyncOutcome> {
  try {
    return await runSync(api, problem, config);
  } catch (cause) {
    const retryable = cause instanceof GitHubError && cause.retryable;
    await markUnsynced(problem, config, retryable ? "pending" : "failed", messageOf(cause));
    throw cause;
  }
}

/**
 * Retries every job whose backoff has elapsed (PRD §44).
 *
 * A retryable failure stops the drain rather than working through the rest of the queue.
 * Offline is offline and a spent rate limit is spent for everyone, so the jobs behind
 * this one would fail the same way — and hammering a rate-limited API is what got us
 * here. They stay queued and the next sweep picks them up. A failure that retrying
 * cannot fix drops its own job and the drain moves on.
 */
export async function drainQueue(api: GitHubClient, config: Config): Promise<void> {
  for (const job of await dueJobs()) {
    try {
      await syncProblem(api, job.problem, config);
      await dropJob(job.id);
    } catch (cause) {
      if (!(cause instanceof GitHubError) || !cause.retryable) {
        await dropJob(job.id);
        continue;
      }
      // `syncProblem` recorded this as pending, which is only true while another attempt
      // is still coming. Once the attempts are spent the job is gone, and a record that
      // says "pending" forever is exactly the under-reporting Rule 14 forbids.
      if ((await deferJob(job.id, cause.message)) === "exhausted") {
        await markUnsynced(job.problem, config, "failed", cause.message);
      }
      return;
    }
  }
}

async function runSync(
  api: GitHubClient,
  problem: Problem,
  config: Config,
): Promise<SyncOutcome> {
  const key = problemKey(problem);
  const [target, index] = await Promise.all([resolveTarget(api, config), get("syncIndex")]);
  const previous = index[key];
  const isResolve = previous?.status === "success";

  // PRD §33: the user chooses what a re-solve does. Only "ignore" is decided here, because
  // it discards and so needs nothing but the index. "ask" holds the submission in the queue
  // instead, which makes it the worker's call — see `handleSubmission`.
  if (isResolve && config.duplicateHandling === "ignore") {
    return {
      status: "skipped",
      problemKey: key,
      path: previous.githubPath,
      reason: `${problem.title} is already saved, and DSAHub is set to ignore re-solved problems.`,
    };
  }

  const record = recordFor(problem, config, previous, "success");
  const nextIndex = { ...index, [key]: record };

  // One list, so the settings that decide which files a sync touches are read once. Each
  // entry renders from whatever is in the repository now: only the main README actually
  // uses that, because it is the one file DSAHub shares with the user (PRD §27).
  const planned: { path: string; render: (current: string | null) => string }[] = [
    { path: record.githubPath, render: () => withTrailingNewline(problem.code) },
  ];
  if (config.problemReadmes) {
    planned.push({
      path: problemReadmePath(problem),
      render: () => renderProblemReadme(problem, solutionFileName(problem, config.fileNaming)),
    });
  }
  if (config.updateReadme) {
    planned.push({
      path: MAIN_README,
      render: (existing) => generateReadme(existing, nextIndex),
    });
  }

  const current = await readCurrent(
    api,
    target,
    planned.map((file) => file.path),
  );

  const changed: CommitFile[] = planned
    .map((file) => ({ path: file.path, content: file.render(current.get(file.path) ?? null) }))
    .filter((file) => current.get(file.path) !== file.content);

  if (changed.length === 0) {
    // Recorded anyway: the files are in the repository, so the index should say so even
    // if this run learned nothing new.
    await write(key, record);
    return {
      status: "unchanged",
      problemKey: key,
      path: record.githubPath,
      commitSha: record.commitSha,
      reason: `${problem.title} is already saved with this exact solution.`,
    };
  }

  const commit = await commitFiles(api, target, commitMessage(problem, isResolve), changed);
  await write(key, { ...record, commitSha: commit.sha });

  return { status: "synced", problemKey: key, path: record.githubPath, commitSha: commit.sha };
}

/** PRD §46: one accepted problem, one commit, and a subject line that says which. */
function commitMessage(problem: Problem, isResolve: boolean): string {
  // PRD §46's example abbreviates GeeksforGeeks to "GFG"; the full display name is used
  // instead so the platform reads the same way in the log as it does in the README.
  const platform = PLATFORM_LABELS[problem.platform];
  const title = problem.title.replace(/\s+/g, " ").trim();
  return `feat: ${isResolve ? "update" : "add"} ${platform} ${title} solution`;
}

/**
 * Current repository content for the paths this sync is about to write, `null` where
 * there is no file yet.
 *
 * Reading before writing is what lets DSAHub commit only what changed. People
 * re-submit an accepted solution to compare runtimes, and re-committing identical bytes
 * would add an empty commit each time to the repository this extension exists to keep
 * presentable. It also means the main README's dashboard is spliced into whatever the
 * user has written since the last sync, rather than into a stale copy.
 */
async function readCurrent(
  api: GitHubClient,
  target: CommitTarget,
  paths: string[],
): Promise<Map<string, string | null>> {
  const entries = await Promise.all(
    paths.map(async (path) => {
      const file = await api.getFile(target.owner, target.repo, path, target.branch);
      return [path, decode(file)] as const;
    }),
  );
  return new Map(entries);
}

/**
 * `null` for a file that does not exist — and for one the contents API declines to
 * inline, which it does above 1 MB. Treating that as absent means DSAHub overwrites it,
 * which is the right call for a file it owns and would be wrong for one it does not.
 */
function decode(file: GitHubFile | null): string | null {
  if (!file || file.encoding !== "base64" || file.content === undefined) return null;
  return fromBase64(file.content);
}

/** A file without a final newline shows up in every diff as "\ No newline at end of file". */
function withTrailingNewline(code: string): string {
  return code.endsWith("\n") ? code : `${code}\n`;
}

function recordFor(
  problem: Problem,
  config: Config,
  previous: SyncRecord | undefined,
  status: SyncRecord["status"],
): SyncRecord {
  return {
    platform: problem.platform,
    problemId: problem.problemId,
    slug: problem.slug,
    title: problem.title,
    url: problem.url,
    githubPath: solutionPath(problem, config.fileNaming),
    // Carried over so a re-solve that commits nothing still points at the commit that
    // put the file there.
    commitSha: previous?.commitSha,
    difficulty: problem.difficulty,
    primaryCategory: problem.primaryCategory,
    topics: problem.topics,
    language: problem.language,
    solvedAt: problem.solvedAt,
    status,
  };
}

/**
 * Records a submission DSAHub is holding without having attempted it — automatic syncing
 * is switched off, so it waits for the user to press Sync now.
 *
 * Rule 14 cuts both ways here. A held submission has not reached GitHub, so it must not be
 * counted as synced; it must also not be invisible, or the dashboard would report nothing
 * pending while the queue holds three problems.
 */
export function markPending(problem: Problem, config: Config, reason: string): Promise<void> {
  return markUnsynced(problem, config, "pending", reason);
}

/**
 * Records a sync that did not land, so the popup can show it as pending or failed.
 *
 * A record that is already `success` is left alone: the file is in the repository, and
 * downgrading the record would drop the row from the README on the next sync — silent
 * under-reporting is as dishonest as over-reporting.
 */
async function markUnsynced(
  problem: Problem,
  config: Config,
  status: "pending" | "failed",
  reason: string,
): Promise<void> {
  const key = problemKey(problem);
  const index = await get("syncIndex");
  if (index[key]?.status === "success") return;

  await write(key, { ...recordFor(problem, config, index[key], status), reason });
}

/**
 * The sentence to show the user for a failed attempt (PRD §49).
 *
 * Only `GitHubError` messages are surfaced, because those were written to be read by a
 * person. Anything else reaching here is a bug in DSAHub rather than something the user
 * can act on, and its message was never written for them — nor vetted for what it might
 * carry (Rule 13).
 */
function messageOf(cause: unknown): string {
  return cause instanceof GitHubError ? cause.message : "DSAHub hit an unexpected error.";
}

async function write(key: string, record: SyncRecord): Promise<void> {
  // Re-read rather than reusing the index loaded at the start of the sync: several
  // network round trips have passed since then.
  //
  // Two syncs genuinely overlapping is not defended against beyond that, and does not
  // need to be. Both would build a commit on the same parent, and `setRef` is never
  // forced — so GitHub rejects the second with a 422, which is retryable, and the queued
  // retry re-reads everything and renders a README containing both problems.
  const index = await get("syncIndex");
  await set("syncIndex", { ...index, [key]: record });
}
