import type { ProblemMetadata, Solution } from "@/platforms/core/types";
import type { Result } from "@/utils/result";
import type { AuthProgress, DeviceChallenge } from "@/github/auth";
import type { SyncOutcome } from "@/sync/sync-manager";

/**
 * The content script never touches GitHub or authentication (PRD §40): it reports
 * an accepted submission and the service worker owns everything after that.
 * Message kinds are added as milestones need them, not up front.
 *
 * The popup goes through the worker for anything involving the GitHub API, so the
 * access token is read in exactly one process and raw API calls stay out of UI
 * components (PRD §34). Plain config writes are *not* messages — the popup owns
 * `chrome.storage` directly, and routing `{ branch }` through the worker would add a
 * hop that touches nothing the worker knows about.
 */

export interface RepoSummary {
  name: string;
  fullName: string;
  private: boolean;
  defaultBranch: string;
}

export type Message =
  | { t: "PING" }
  | { t: "SUBMISSION_ACCEPTED"; metadata: ProblemMetadata; solution: Solution }
  | { t: "AUTH_START" }
  | { t: "AUTH_POLL" }
  | { t: "AUTH_STATUS" }
  | { t: "AUTH_DISCONNECT" }
  | { t: "REPO_LIST" }
  | { t: "REPO_SELECT"; name: string }
  | { t: "BRANCH_LIST" }
  | { t: "VERIFY_SETUP" }
  | { t: "SYNC_NOW" }
  | { t: "RESOLVE_CHOICE"; jobId: string; update: boolean };

/** Maps each request to what a successful response carries. */
export interface Responses {
  PING: { pong: boolean; at: string };
  SUBMISSION_ACCEPTED: SyncOutcome;
  AUTH_START: DeviceChallenge;
  AUTH_POLL: AuthProgress;
  AUTH_STATUS: AuthProgress;
  AUTH_DISCONNECT: null;
  REPO_LIST: RepoSummary[];
  REPO_SELECT: { owner: string; repo: string; branch: string; created: boolean };
  BRANCH_LIST: { branches: string[]; defaultBranch: string };
  VERIFY_SETUP: { path: string; commitSha: string; repo: string; branch: string };
  /**
   * Nothing. The popup renders the queue and the sync index straight from storage, so
   * after a sweep it refreshes and shows what actually happened — a count returned from
   * here could only ever disagree with that (Rule 14).
   */
  SYNC_NOW: null;
  RESOLVE_CHOICE: null;
}

export function sendToBackground<M extends Message>(
  message: M,
): Promise<Result<Responses[M["t"]]>> {
  return chrome.runtime.sendMessage<M, Result<Responses[M["t"]]>>(message);
}
