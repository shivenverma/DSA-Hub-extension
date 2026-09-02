import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { ProblemMetadata, SubmissionStatus, Solution } from "@/platforms/core/types";
import type { Result } from "@/utils/result";
import type { SyncOutcome } from "@/sync/sync-manager";

/**
 * The content script's two guards (PRD §14, §40).
 *
 * Acceptance Test 3 — "a failed submission never syncs" — is enforced here and nowhere
 * else: once a message reaches the service worker, the sync engine has no way to know
 * the verdict was a Wrong Answer. The adapters' own tests prove they report
 * `accepted: false`; this proves the content script acts on it.
 */
const fake = vi.hoisted(() => {
  const hooks: { onAccepted?: (submissionId?: string) => void } = {};
  return {
    hooks,
    adapter: {
      platform: "leetcode" as const,
      canHandle: () => true,
      isProblemPage: vi.fn(() => true),
      getProblemMetadata: vi.fn(),
      getSubmissionStatus: vi.fn(),
      getSubmittedSolution: vi.fn(),
      watchSubmissions: (onAccepted: (submissionId?: string) => void) => {
        hooks.onAccepted = onAccepted;
        return () => undefined;
      },
    },
  };
});

vi.mock("@/platforms/core/registry", () => ({ resolveAdapter: () => fake.adapter }));

const METADATA: ProblemMetadata = {
  platform: "leetcode",
  problemId: "1",
  slug: "two-sum",
  title: "Two Sum",
  url: "https://leetcode.com/problems/two-sum/",
  difficulty: "Easy",
  topics: ["Array"],
};

const SOLUTION: Solution = {
  language: "C++",
  code: "class Solution {};",
  submittedAt: "2026-01-01T12:00:00.000Z",
};

const OUTCOME: Result<SyncOutcome> = {
  ok: true,
  value: {
    status: "synced",
    problemKey: "leetcode:1",
    path: "Arrays/0001-Two-Sum/solution.cpp",
    commitSha: "abc123",
  },
};

const sendMessage = () => chrome.runtime.sendMessage as unknown as Mock;

/** Lets `void report(...)` run to completion; the content script deliberately fires it. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function submit(status: SubmissionStatus): Promise<void> {
  fake.adapter.getSubmissionStatus.mockResolvedValue(status);
  fake.hooks.onAccepted?.("42");
  await flush();
}

beforeEach(async () => {
  Object.defineProperty(globalThis, "location", {
    value: { href: "https://leetcode.com/problems/two-sum/" },
    configurable: true,
  });
  fake.adapter.isProblemPage.mockReturnValue(true);
  fake.adapter.getProblemMetadata.mockResolvedValue(METADATA);
  fake.adapter.getSubmittedSolution.mockResolvedValue(SOLUTION);
  sendMessage().mockResolvedValue(OUTCOME);

  // Re-imported per test so the script re-registers its watcher on a clean adapter.
  vi.resetModules();
  await import("@/content/content");
});

describe("content script", () => {
  it("never reports a submission that was not accepted (Acceptance Test 3)", async () => {
    await submit({ accepted: false, raw: "Wrong Answer" });

    expect(sendMessage()).not.toHaveBeenCalled();
  });

  it("does not even extract the code for a rejected submission", async () => {
    // Reading the editor costs a DOM walk, and a wrong answer's code is not wanted.
    await submit({ accepted: false, raw: "Time Limit Exceeded" });

    expect(fake.adapter.getSubmittedSolution).not.toHaveBeenCalled();
    expect(fake.adapter.getProblemMetadata).not.toHaveBeenCalled();
  });

  it("reports an accepted submission with the metadata and the code", async () => {
    await submit({ accepted: true, raw: "Accepted" });

    expect(sendMessage()).toHaveBeenCalledWith({
      t: "SUBMISSION_ACCEPTED",
      metadata: METADATA,
      solution: SOLUTION,
    });
  });

  it("drops an accepted verdict that arrives away from a problem page", async () => {
    // The URL is read at report time, so a verdict landing after the user navigated
    // would otherwise be filed under whatever page they are on now.
    fake.adapter.isProblemPage.mockReturnValue(false);

    await submit({ accepted: true, raw: "Accepted" });

    expect(sendMessage()).not.toHaveBeenCalled();
  });

  it("stays silent to the page when the worker rejects the sync", async () => {
    // A detection failure must never break someone's submission.
    sendMessage().mockResolvedValue({
      ok: false,
      code: "GITHUB_FAILED",
      message: "GitHub refused the request.",
      retryable: false,
    });

    await expect(submit({ accepted: true, raw: "Accepted" })).resolves.toBeUndefined();
  });
});
