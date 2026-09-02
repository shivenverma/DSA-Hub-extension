import type { Message, RepoSummary, Responses } from "@/messaging";
import { get, getConfig, patchConfig, set, type Config } from "@/storage/storage";
import { log } from "@/utils/logger";
import { err, ok, type Result } from "@/utils/result";
import { AUTH_ALARM, currentProgress, disconnect, pollOnce, startDeviceFlow } from "@/github/auth";
import { GitHubClient, GitHubError, toFailure } from "@/github/client";
import { commitFiles } from "@/github/commit";
import { ensureRepository, listBranches, resolveTarget } from "@/github/repository";
import { problemKey, type Problem } from "@/platforms/core/types";
import { dropJob, enqueue, listJobs, parkForChoice, releaseJob } from "@/sync/queue";
import {
  drainQueue,
  isAlreadySynced,
  markPending,
  syncProblem,
  toProblem,
  type SyncOutcome,
} from "@/sync/sync-manager";
import { solutionPath } from "@/utils/paths";
import {
  ASK_UPDATE,
  askAboutResolve,
  notifyFailed,
  notifyQueued,
  notifySynced,
  parkedJobId,
} from "./notify";

/**
 * Sync orchestration, GitHub calls and storage writes all belong here rather than
 * in the content script (PRD §40, §55). The token is read in this process only.
 */

/** Wakes the queue while — and only while — something is in it. */
const RETRY_ALARM = "dsahub-retry";

/**
 * How long a cached branch list is trusted (PRD §47).
 *
 * The only cache DSAHub keeps. A sync spends no requests on repository metadata at all —
 * onboarding records the branch, so `resolveTarget` answers from config — which leaves
 * the popup's branch list as the one repeated, cacheable call. Rate limits themselves are
 * handled where they are actually hit, in `describeFailure`.
 */
const BRANCH_TTL_MS = 10 * 60_000;

/** Every GitHub-touching handler starts here, so an expired connection fails once, clearly. */
async function client(): Promise<GitHubClient> {
  const auth = await get("auth");
  if (!auth) {
    throw new GitHubError(
      "AUTH_FAILED",
      "Connect your GitHub account in DSAHub before syncing.",
      false,
    );
  }
  return new GitHubClient(auth.accessToken);
}

async function handle(message: Message): Promise<Result<unknown>> {
  switch (message.t) {
    case "PING":
      return ok<Responses["PING"]>({ pong: true, at: new Date().toISOString() });

    case "SUBMISSION_ACCEPTED": {
      const config = await getConfig();
      if (!config.repoOwner || !config.repoName) {
        return err("AUTH_FAILED", "GitHub is not connected. Open DSAHub to finish setup.");
      }

      // Classified before anything can fail, so a queued retry files the problem under the
      // same category the first attempt chose.
      return handleSubmission(toProblem(message.metadata, message.solution), config);
    }

    case "AUTH_START":
      return ok<Responses["AUTH_START"]>(await startDeviceFlow());

    case "AUTH_POLL":
      return ok<Responses["AUTH_POLL"]>(await pollOnce());

    case "AUTH_STATUS":
      return ok<Responses["AUTH_STATUS"]>(await currentProgress());

    case "AUTH_DISCONNECT":
      await disconnect();
      return ok<Responses["AUTH_DISCONNECT"]>(null);

    case "REPO_LIST": {
      const repos = await (await client()).getRepositories();
      return ok<Responses["REPO_LIST"]>(
        repos.map(
          (repo): RepoSummary => ({
            name: repo.name,
            fullName: repo.full_name,
            private: repo.private,
            defaultBranch: repo.default_branch,
          }),
        ),
      );
    }

    case "REPO_SELECT": {
      const [api, config, auth] = await Promise.all([client(), getConfig(), get("auth")]);
      if (!auth) return err("AUTH_FAILED", "Connect your GitHub account first.");

      const { repo, created } = await ensureRepository(
        api,
        auth.login,
        message.name,
        config.newRepoVisibility,
      );
      // The branch is recorded now so config is immediately usable; the user can
      // change it afterwards without ever passing through an unsyncable state.
      await patchConfig({
        repoOwner: repo.owner.login,
        repoName: repo.name,
        branch: repo.default_branch,
      });
      return ok<Responses["REPO_SELECT"]>({
        owner: repo.owner.login,
        repo: repo.name,
        branch: repo.default_branch,
        created,
      });
    }

    case "BRANCH_LIST": {
      const config = await getConfig();
      if (!config.repoOwner || !config.repoName) {
        return err("GITHUB_FAILED", "Choose a repository first.");
      }
      return ok<Responses["BRANCH_LIST"]>(
        await cachedBranches(config.repoOwner, config.repoName),
      );
    }

    case "VERIFY_SETUP":
      return ok<Responses["VERIFY_SETUP"]>(await verifySetup());

    case "SYNC_NOW":
      // Deliberately ignores `autoSync`: the user pressed a button that says sync.
      await drainNow();
      return ok<Responses["SYNC_NOW"]>(null);

    case "RESOLVE_CHOICE":
      await answerResolve(message.jobId, message.update);
      return ok<Responses["RESOLVE_CHOICE"]>(null);
  }
}

/**
 * An accepted submission, from arrival to a reported outcome.
 *
 * Two of the three things that can stop a sync are decided here rather than inside
 * `syncProblem`, because both of them mean "hold this submission and wait for the user" —
 * that is a queue decision, and the queue belongs to the worker (PRD §44). Only
 * `duplicateHandling: "ignore"` stays inside the sync, because it discards rather than
 * holds and so needs nothing from the queue.
 */
async function handleSubmission(problem: Problem, config: Config): Promise<Result<SyncOutcome>> {
  const held = (reason: string): Result<SyncOutcome> =>
    ok<SyncOutcome>({
      status: "skipped",
      problemKey: problemKey(problem),
      path: solutionPath(problem, config.fileNaming),
      reason,
    });

  // PRD §33: "ask" is the one duplicate setting that cannot be answered on the spot. The
  // submission is parked first, so the question survives the eviction that is about to
  // happen while the notification sits on screen.
  if (config.duplicateHandling === "ask" && (await isAlreadySynced(problem))) {
    await parkForChoice(problem);
    await askAboutResolve(problem);
    return held(
      `${problem.title} is already saved. DSAHub is holding this submission until you choose whether to replace it.`,
    );
  }

  // PRD §31: with automatic syncing off, the submission is still captured — it cannot be
  // recovered later — it just waits for the user to press Sync now. No retry alarm: there
  // is nothing for a timer to do.
  if (!config.autoSync) {
    const reason = `${problem.title} is queued. Open DSAHub and press Sync now to push it.`;
    await enqueue(problem, "Automatic syncing is off.");
    await markPending(problem, config, "Automatic syncing is off.");
    return held(reason);
  }

  try {
    const outcome = await syncProblem(await client(), problem, config);
    // Only a real commit gets announced. "Unchanged" and "skipped" mean nothing happened,
    // and a notification saying so on every resubmission is noise, not information.
    if (outcome.status === "synced") await notifySynced(problem, outcome.path);
    return ok<SyncOutcome>(outcome);
  } catch (cause) {
    // Anything that is not a GitHubError is a bug in DSAHub rather than something the user
    // can act on. It goes to the console through the message handler, untranslated.
    if (!(cause instanceof GitHubError)) throw cause;

    if (!cause.retryable) {
      await notifyFailed(problem, cause.message);
      throw cause;
    }

    // PRD §44: an accepted submission cannot be recovered later — the user has left the
    // page — so anything worth retrying is parked before the failure is reported.
    await enqueue(problem, cause.message);
    await scheduleRetries();
    await notifyQueued(problem, cause.message);
    // Rule 14: queued is not synced, and the message has to say so.
    return err(cause.code, `${cause.message} (${problem.title} is queued.)`, true);
  }
}

/**
 * The user's answer to PRD §33's re-solve question, from either the notification or the
 * popup — one implementation, because the two must not be able to disagree.
 *
 * "Keep existing" drops the job outright. Nothing is recorded as failed: the saved
 * solution is still in the repository and still in the index, so the honest state after
 * this is exactly the state before it.
 */
async function answerResolve(jobId: string, update: boolean): Promise<void> {
  if (!update) {
    await dropJob(jobId);
    return;
  }
  await releaseJob(jobId);
  await drainNow();
}

/** Branch list for a repository, from cache when it is fresh enough (PRD §47). */
async function cachedBranches(owner: string, repo: string): Promise<Responses["BRANCH_LIST"]> {
  const key = `${owner}/${repo}`;
  const cache = await get("cache");
  const hit = cache.branches[key];
  if (hit && Date.now() - hit.ts < BRANCH_TTL_MS) {
    return { branches: hit.names, defaultBranch: hit.defaultBranch };
  }

  const fresh = await listBranches(await client(), owner, repo);
  await set("cache", {
    ...cache,
    branches: {
      ...cache.branches,
      [key]: { names: fresh.branches, defaultBranch: fresh.defaultBranch, ts: Date.now() },
    },
  });
  return fresh;
}

/**
 * Proves the whole write path end to end by making one real commit.
 *
 * A read-only check cannot do this. `permissions.push` on the repo object, a valid
 * token and a resolvable branch can all look right while the actual push fails —
 * SAML SSO not authorised for the org, a protected branch, a scope the user narrowed
 * during authorization. The only way to know a sync will work is to write something,
 * so this writes one small file and says exactly where it landed.
 */
async function verifySetup(): Promise<Responses["VERIFY_SETUP"]> {
  const api = await client();
  const target = await resolveTarget(api, await getConfig());
  const path = ".dsahub/connection-check.md";

  const result = await commitFiles(api, target, "DSAHub: verify connection", [
    {
      path,
      content: [
        "# DSAHub connection check",
        "",
        `Written by DSAHub at ${new Date().toISOString()} to confirm it can commit to`,
        `\`${target.owner}/${target.repo}\` on \`${target.branch}\`.`,
        "",
        "Safe to delete. DSAHub rewrites it whenever you re-run the check.",
        "",
      ].join("\n"),
    },
  ]);

  return { path, commitSha: result.sha, repo: `${target.owner}/${target.repo}`, branch: target.branch };
}

/**
 * The queue's heartbeat. One minute is the shortest period MV3 allows, and the alarm
 * exists only while jobs do — a permanent tick would wake the worker every minute of
 * every browsing session for a queue that is empty almost all of the time.
 */
async function scheduleRetries(): Promise<void> {
  await chrome.alarms.create(RETRY_ALARM, { periodInMinutes: 1, delayInMinutes: 1 });
}

/**
 * Works through the queue and leaves the alarm matching what is left.
 *
 * The alarm bookkeeping lives here rather than at each caller because all three of them —
 * the retry sweep, the popup's Sync now, and answering a re-solve — can leave jobs behind,
 * and any one of them forgetting to re-arm would strand the queue silently.
 */
async function drainNow(): Promise<void> {
  await drainQueue(await client(), await getConfig());

  const left = await listJobs();
  // Jobs waiting on the user are not waiting on a timer, so they must not keep it running.
  if (left.every((job) => job.awaitingChoice)) {
    await chrome.alarms.clear(RETRY_ALARM);
    return;
  }
  await scheduleRetries();
  log.info(`${String(left.length)} sync(s) still queued`);
}

async function runRetries(): Promise<void> {
  const [jobs, config] = await Promise.all([listJobs(), getConfig()]);

  // Nothing to retry, or nothing allowed to happen on its own: either way, stop the
  // heartbeat. With automatic syncing off it is the popup's Sync now button that drains
  // the queue, and there is no point waking the worker every minute until then.
  if (jobs.length === 0 || !config.autoSync) {
    await chrome.alarms.clear(RETRY_ALARM);
    return;
  }

  await drainNow();
}

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  handle(message)
    .then(sendResponse)
    .catch((cause: unknown) => {
      // GitHubError already carries a human-readable message; anything else is a bug
      // and gets the generic line rather than an internal detail.
      if (!(cause instanceof GitHubError)) log.error("message handler failed:", cause);
      sendResponse(toFailure(cause));
    });
  return true; // keep the channel open for the async response
});

/**
 * Both alarms land here. The device-flow poll runs in the worker rather than the popup
 * because authorizing requires the user to leave for github.com, which closes the popup
 * and kills any timer it owns; the retry sweep runs here because the worker is evicted
 * between failures and an alarm is what brings it back.
 */
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === RETRY_ALARM) {
    void runRetries().catch((cause: unknown) => {
      log.error("retry sweep failed:", cause instanceof GitHubError ? cause.message : "unknown");
    });
    return;
  }
  if (alarm.name !== AUTH_ALARM) return;
  void pollOnce()
    .then((progress) => {
      // Status only — never the token, and never the device code (PRD §37).
      if (progress.status === "connected") log.info(`GitHub connected as @${progress.login}`);
      else if (progress.status !== "pending") log.info(`GitHub sign-in ${progress.status}`);
    })
    .catch((cause: unknown) => {
      log.error("auth poll failed:", cause instanceof GitHubError ? cause.message : "unknown");
    });
});

/**
 * Coming back online is the most likely moment for a queued sync to succeed, and MV3
 * does not guarantee an alarm survives a browser restart — so the queue is swept once
 * on startup regardless.
 */
chrome.runtime.onStartup.addListener(() => {
  void runRetries().catch(() => undefined);
});

/**
 * The two buttons on PRD §33's re-solve question.
 *
 * Registered here rather than in `notify.ts` because answering means touching the queue
 * and GitHub, which is this module's job — and because the notification id is the only
 * thing Chrome hands back, the parked job is found from that rather than from anything
 * the worker had to keep alive.
 */
chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  const jobId = parkedJobId(notificationId);
  if (!jobId) return;

  void chrome.notifications.clear(notificationId);
  void answerResolve(jobId, buttonIndex === ASK_UPDATE).catch((cause: unknown) => {
    log.error("re-solve choice failed:", cause instanceof GitHubError ? cause.message : "unknown");
  });
});

chrome.runtime.onInstalled.addListener(() => {
  log.info("installed");
});
