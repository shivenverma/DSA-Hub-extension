import { describe, expect, it, vi } from "vitest";
import { GitHubError, toBase64, type GitHubClient, type TreeEntry } from "@/github/client";
import { MARKER_END, MARKER_START } from "@/readme/parser";
import { DEFAULT_CONFIG, get, set, type Config, type SyncRecord } from "@/storage/storage";
import { drainQueue, syncProblem, toProblem } from "@/sync/sync-manager";
import { enqueue, listJobs, MAX_ATTEMPTS } from "@/sync/queue";
import type { Problem, ProblemMetadata, Solution } from "@/platforms/core/types";

const CONFIG: Config = {
  ...DEFAULT_CONFIG,
  repoOwner: "octocat",
  repoName: "dsa",
  branch: "main",
};

function problem(patch: Partial<Problem> = {}): Problem {
  return {
    platform: "leetcode",
    problemId: "1",
    slug: "two-sum",
    title: "Two Sum",
    url: "https://leetcode.com/problems/two-sum/",
    difficulty: "Easy",
    topics: ["Array", "Hash Table"],
    primaryCategory: "Arrays",
    language: "C++",
    code: "class Solution {};\n",
    solvedAt: "2026-01-01T12:00:00.000Z",
    ...patch,
  };
}

const GFG = problem({
  platform: "gfg",
  problemId: undefined,
  slug: "kadanes-algorithm",
  title: "Kadane's Algorithm",
  url: "https://www.geeksforgeeks.org/problems/kadanes-algorithm/1",
  difficulty: "Medium",
  topics: ["Dynamic Programming"],
  primaryCategory: "Dynamic Programming",
  language: "Java",
  code: "class Solution { }\n",
});

interface Fake {
  api: GitHubClient;
  /** Repository contents, as they would be after every commit so far. */
  files: Map<string, string>;
  /** One entry per commit that actually moved the ref. */
  commits: { sha: string; message: string; files: Record<string, string> }[];
  reads: string[];
}

/**
 * An in-memory GitHub. Files only become visible when the ref moves, the way the Git
 * Data API works — which is what makes "one accepted problem, one commit" assertable
 * rather than a comment.
 */
function fakeGitHub(initial: Record<string, string> = {}, failWith?: GitHubError): Fake {
  const files = new Map(Object.entries(initial));
  const commits: Fake["commits"] = [];
  const reads: string[] = [];
  const blobs = new Map<string, string>();
  let staged: TreeEntry[] = [];
  let message = "";
  let blobCount = 0;

  const api = {
    getFile: vi.fn((_owner: string, _repo: string, path: string) => {
      reads.push(path);
      const content = files.get(path);
      if (content === undefined) return Promise.resolve(null);
      return Promise.resolve({ path, sha: `sha-${path}`, content: toBase64(content), encoding: "base64" });
    }),
    getRef: vi.fn(() => Promise.resolve("head-sha")),
    getCommitTree: vi.fn(() => Promise.resolve("tree-base")),
    createBlob: vi.fn((_owner: string, _repo: string, content: string) => {
      if (failWith) return Promise.reject(failWith);
      blobCount += 1;
      const sha = `blob-${String(blobCount)}`;
      blobs.set(sha, content);
      return Promise.resolve(sha);
    }),
    createTree: vi.fn((_owner: string, _repo: string, entries: TreeEntry[]) => {
      staged = entries;
      return Promise.resolve("tree-new");
    }),
    createCommit: vi.fn((_owner: string, _repo: string, args: { message: string }) => {
      message = args.message;
      return Promise.resolve(`commit-${String(commits.length + 1)}`);
    }),
    setRef: vi.fn((_owner: string, _repo: string, _branch: string, sha: string) => {
      const written: Record<string, string> = {};
      for (const entry of staged) {
        const content = blobs.get(entry.sha) ?? "";
        files.set(entry.path, content);
        written[entry.path] = content;
      }
      commits.push({ sha, message, files: written });
      return Promise.resolve();
    }),
  };

  return { api: api as unknown as GitHubClient, files, commits, reads };
}

const SOLUTION_PATH = "Arrays/0001-Two-Sum/solution.cpp";
const PROBLEM_README = "Arrays/0001-Two-Sum/README.md";

async function indexRecord(key: string): Promise<SyncRecord | undefined> {
  return (await get("syncIndex"))[key];
}

describe("toProblem", () => {
  it("classifies the problem and carries the submitted code (PRD §20)", () => {
    const metadata: ProblemMetadata = {
      platform: "leetcode",
      problemId: "104",
      slug: "maximum-depth-of-binary-tree",
      title: "Maximum Depth of Binary Tree",
      url: "https://leetcode.com/problems/maximum-depth-of-binary-tree/",
      difficulty: "Easy",
      topics: ["Tree", "Depth-First Search"],
    };
    const solution: Solution = {
      language: "Python3",
      code: "class Solution: pass",
      submittedAt: "2026-01-02T00:00:00.000Z",
    };

    expect(toProblem(metadata, solution)).toMatchObject({
      primaryCategory: "Trees",
      language: "Python3",
      code: "class Solution: pass",
      solvedAt: "2026-01-02T00:00:00.000Z",
    });
  });
});

describe("syncProblem — a first accepted submission (Acceptance Test 1)", () => {
  it("commits the solution, its README and the dashboard as one commit", async () => {
    const github = fakeGitHub({ "README.md": "# dsa\n" });

    const outcome = await syncProblem(github.api, problem(), CONFIG);

    expect(outcome).toMatchObject({
      status: "synced",
      problemKey: "leetcode:1",
      path: SOLUTION_PATH,
      commitSha: "commit-1",
    });

    // PRD §45: one commit, or a README can advertise a solution that is not there.
    expect(github.commits).toHaveLength(1);
    expect(Object.keys(github.commits[0]?.files ?? {})).toEqual([
      SOLUTION_PATH,
      PROBLEM_README,
      "README.md",
    ]);
  });

  it("names the commit after the problem (PRD §46)", async () => {
    const github = fakeGitHub({ "README.md": "# dsa\n" });
    await syncProblem(github.api, problem(), CONFIG);

    expect(github.commits[0]?.message).toBe("feat: add LeetCode Two Sum solution");
  });

  it("writes the code with a trailing newline", async () => {
    const github = fakeGitHub({ "README.md": "# dsa\n" });
    await syncProblem(github.api, problem({ code: "int main() {}" }), CONFIG);

    expect(github.files.get(SOLUTION_PATH)).toBe("int main() {}\n");
  });

  it("records the sync so the dashboard and dedupe can see it", async () => {
    const github = fakeGitHub({ "README.md": "# dsa\n" });
    await syncProblem(github.api, problem(), CONFIG);

    expect(await indexRecord("leetcode:1")).toMatchObject({
      platform: "leetcode",
      problemId: "1",
      title: "Two Sum",
      githubPath: SOLUTION_PATH,
      primaryCategory: "Arrays",
      difficulty: "Easy",
      language: "C++",
      commitSha: "commit-1",
      status: "success",
    });
  });

  it("puts the problem's own README beside the solution and points it at the file", async () => {
    const github = fakeGitHub({ "README.md": "# dsa\n" });
    await syncProblem(github.api, problem(), CONFIG);

    const readme = github.files.get(PROBLEM_README) ?? "";
    expect(readme).toContain("# Two Sum");
    expect(readme).toContain("See `solution.cpp`.");
  });

  it("adds the problem to the main README, under its category (Acceptance Test 5)", async () => {
    const github = fakeGitHub({ "README.md": "# dsa\n" });
    await syncProblem(github.api, problem(), CONFIG);

    const readme = github.files.get("README.md") ?? "";
    expect(readme).toContain("| **Total** | **1** |");
    expect(readme).toContain(`[Two Sum](${SOLUTION_PATH})`);
  });

  it("leaves the user's own README text untouched (Acceptance Test 7)", async () => {
    const github = fakeGitHub({
      "README.md": `# My Prep\n\nNotes I care about.\n\n${MARKER_START}\n\nstale\n\n${MARKER_END}\n\n## Licence\n\nMIT.\n`,
    });

    await syncProblem(github.api, problem(), CONFIG);

    const readme = github.files.get("README.md") ?? "";
    expect(readme.startsWith("# My Prep\n\nNotes I care about.")).toBe(true);
    expect(readme.endsWith("## Licence\n\nMIT.\n")).toBe(true);
    expect(readme).not.toContain("stale");
  });

  it("creates a README when the repository has none", async () => {
    const github = fakeGitHub();
    await syncProblem(github.api, problem(), CONFIG);

    expect(github.files.get("README.md")).toContain("# 🚀 DSA Solutions");
  });
});

describe("syncProblem — GeeksforGeeks (Acceptance Test 2)", () => {
  it("files a slug-identified problem under its own path and key", async () => {
    const github = fakeGitHub({ "README.md": "# dsa\n" });

    const outcome = await syncProblem(github.api, GFG, CONFIG);

    expect(outcome).toMatchObject({
      status: "synced",
      problemKey: "gfg:kadanes-algorithm",
      path: "Dynamic-Programming/kadanes-algorithm/solution.java",
    });
    expect(github.commits[0]?.message).toBe(
      "feat: add GeeksforGeeks Kadane's Algorithm solution",
    );
  });

  it("never collides with a LeetCode problem of the same slug (PRD §32)", async () => {
    const github = fakeGitHub({ "README.md": "# dsa\n" });

    await syncProblem(github.api, problem(), CONFIG);
    await syncProblem(github.api, GFG, CONFIG);

    expect(Object.keys(await get("syncIndex"))).toEqual(["leetcode:1", "gfg:kadanes-algorithm"]);
    expect(github.commits).toHaveLength(2);
  });
});

describe("syncProblem — re-solving (PRD §33, Acceptance Test 4)", () => {
  async function alreadySynced(): Promise<Fake> {
    const github = fakeGitHub({ "README.md": "# dsa\n" });
    await syncProblem(github.api, problem(), CONFIG);
    return github;
  }

  it("commits nothing when the solution is byte-identical", async () => {
    // People resubmit an accepted solution to compare runtimes. An empty commit each
    // time would litter the repository this extension exists to keep presentable.
    const github = await alreadySynced();

    const outcome = await syncProblem(github.api, problem(), CONFIG);

    expect(outcome.status).toBe("unchanged");
    expect(outcome.reason).toContain("already saved");
    expect(github.commits).toHaveLength(1);
  });

  it("keeps the original commit sha on an unchanged re-solve", async () => {
    const github = await alreadySynced();
    await syncProblem(github.api, problem(), CONFIG);

    expect(await indexRecord("leetcode:1")).toMatchObject({
      commitSha: "commit-1",
      status: "success",
    });
  });

  it("commits an improved solution, and only the file that changed", async () => {
    const github = await alreadySynced();

    const outcome = await syncProblem(
      github.api,
      problem({ code: "class Solution { /* O(n) */ };\n" }),
      CONFIG,
    );

    expect(outcome.status).toBe("synced");
    expect(github.commits).toHaveLength(2);
    // The dashboard row and the problem README did not change, so they are not rewritten.
    expect(Object.keys(github.commits[1]?.files ?? {})).toEqual([SOLUTION_PATH]);
    expect(github.commits[1]?.message).toBe("feat: update LeetCode Two Sum solution");
  });

  it("leaves the solution alone when the user chose to ignore re-solves", async () => {
    const github = await alreadySynced();

    const outcome = await syncProblem(github.api, problem({ code: "different\n" }), {
      ...CONFIG,
      duplicateHandling: "ignore",
    });

    expect(outcome.status).toBe("skipped");
    expect(github.commits).toHaveLength(1);
    expect(github.files.get(SOLUTION_PATH)).toBe("class Solution {};\n");
  });

  it("updates on 'ask' until there is a dialog to ask through", async () => {
    // Discarding the user's new solution would be the worse of the two guesses, and
    // "update existing solution" is the documented default (PRD §33).
    const github = await alreadySynced();

    const outcome = await syncProblem(github.api, problem({ code: "better\n" }), {
      ...CONFIG,
      duplicateHandling: "ask",
    });

    expect(outcome.status).toBe("synced");
    expect(github.files.get(SOLUTION_PATH)).toBe("better\n");
  });

  it("refreshes the dashboard when a re-solve changes what it says", async () => {
    const github = await alreadySynced();

    await syncProblem(github.api, problem({ language: "Python3", code: "pass\n" }), CONFIG);

    // A new language means a new row and a new count — and a new file, since the
    // extension does not delete the old one.
    expect(github.files.get("README.md")).toContain("Python3");
  });
});

describe("syncProblem — what the settings switch off", () => {
  it("does not touch the main README when updateReadme is off", async () => {
    const github = fakeGitHub({ "README.md": "# dsa\n" });

    await syncProblem(github.api, problem(), { ...CONFIG, updateReadme: false });

    expect(github.files.get("README.md")).toBe("# dsa\n");
    // And does not spend a request reading a file it will not write.
    expect(github.reads).not.toContain("README.md");
  });

  it("does not write a per-problem README when problemReadmes is off", async () => {
    const github = fakeGitHub({ "README.md": "# dsa\n" });

    await syncProblem(github.api, problem(), { ...CONFIG, problemReadmes: false });

    expect(github.files.has(PROBLEM_README)).toBe(false);
    expect(Object.keys(github.commits[0]?.files ?? {})).toEqual([SOLUTION_PATH, "README.md"]);
  });

  it("honours the file naming choice (PRD §24)", async () => {
    const github = fakeGitHub({ "README.md": "# dsa\n" });

    await syncProblem(github.api, problem(), { ...CONFIG, fileNaming: "main" });

    expect(github.files.has("Arrays/0001-Two-Sum/main.cpp")).toBe(true);
  });
});

describe("syncProblem — failure (Rule 14)", () => {
  const offline = new GitHubError("NETWORK_ERROR", "Could not reach GitHub.", true);
  const forbidden = new GitHubError("GITHUB_FAILED", "GitHub refused the request.", false);

  it("rethrows and records the sync as pending when a retry could still work", async () => {
    const github = fakeGitHub({ "README.md": "# dsa\n" }, offline);

    await expect(syncProblem(github.api, problem(), CONFIG)).rejects.toThrow(offline);

    expect(await indexRecord("leetcode:1")).toMatchObject({ status: "pending" });
    expect(github.commits).toHaveLength(0);
  });

  it("records a failure that retrying cannot fix as failed", async () => {
    const github = fakeGitHub({ "README.md": "# dsa\n" }, forbidden);

    await expect(syncProblem(github.api, problem(), CONFIG)).rejects.toThrow(forbidden);

    expect(await indexRecord("leetcode:1")).toMatchObject({ status: "failed" });
  });

  it("does not downgrade a problem already in the repository", async () => {
    // The file is still there. Dropping it from the index would quietly delete a row
    // from the user's README on the next sync — under-reporting, which Rule 14 also
    // forbids.
    const first = fakeGitHub({ "README.md": "# dsa\n" });
    await syncProblem(first.api, problem(), CONFIG);

    const second = fakeGitHub({ "README.md": "# dsa\n" }, offline);
    await expect(
      syncProblem(second.api, problem({ code: "new\n" }), CONFIG),
    ).rejects.toThrow(offline);

    expect(await indexRecord("leetcode:1")).toMatchObject({
      status: "success",
      commitSha: "commit-1",
    });
  });

  it("keeps a failed sync out of the dashboard", async () => {
    const github = fakeGitHub({ "README.md": "# dsa\n" }, forbidden);
    await expect(syncProblem(github.api, problem(), CONFIG)).rejects.toThrow(forbidden);

    const next = fakeGitHub({ "README.md": "# dsa\n" });
    await syncProblem(next.api, GFG, CONFIG);

    const readme = next.files.get("README.md") ?? "";
    expect(readme).toContain("| **Total** | **1** |");
    expect(readme).not.toContain("Two Sum");
  });
});

describe("drainQueue (PRD §44)", () => {
  it("syncs a queued problem and removes the job", async () => {
    const github = fakeGitHub({ "README.md": "# dsa\n" });
    await enqueue(problem(), "was offline");

    await drainQueue(github.api, CONFIG);

    expect(github.commits).toHaveLength(1);
    expect(await listJobs()).toEqual([]);
  });

  it("stops at the first retryable failure and leaves the rest queued", async () => {
    // Offline is offline for every job behind this one, and a spent rate limit is spent
    // for all of them too.
    const github = fakeGitHub(
      { "README.md": "# dsa\n" },
      new GitHubError("RATE_LIMITED", "Rate limit used up.", true),
    );
    await enqueue(problem());
    await enqueue(GFG);

    await drainQueue(github.api, CONFIG);

    const jobs = await listJobs();
    expect(jobs).toHaveLength(2);
    expect(jobs.find((job) => job.id === "leetcode:1")).toMatchObject({
      attempts: 1,
      lastError: "Rate limit used up.",
    });
    // The second job was never attempted, so its backoff is untouched.
    expect(jobs.find((job) => job.id === "gfg:kadanes-algorithm")).toMatchObject({ attempts: 0 });
  });

  it("drops a job that retrying cannot fix and carries on", async () => {
    const github = fakeGitHub(
      { "README.md": "# dsa\n" },
      new GitHubError("GITHUB_FAILED", "Repository is read-only.", false),
    );
    await enqueue(problem());
    await enqueue(GFG);

    await drainQueue(github.api, CONFIG);

    expect(await listJobs()).toEqual([]);
    expect(await indexRecord("leetcode:1")).toMatchObject({ status: "failed" });
    expect(await indexRecord("gfg:kadanes-algorithm")).toMatchObject({ status: "failed" });
  });

  it("stops claiming a retry is coming once the attempts are spent (Rule 14)", async () => {
    // The last failure removes the job. A record left saying "pending" would promise the
    // user a retry that nothing is going to run.
    const github = fakeGitHub(
      { "README.md": "# dsa\n" },
      new GitHubError("NETWORK_ERROR", "Could not reach GitHub.", true),
    );
    await enqueue(problem());

    // Only the clock is faked, so each sweep reaches the job past its backoff instead of
    // the test waiting out four real minutes.
    vi.useFakeTimers();
    try {
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        await drainQueue(github.api, CONFIG);
        vi.advanceTimersByTime(10 * 60_000);
      }
    } finally {
      vi.useRealTimers();
    }

    expect(await listJobs()).toEqual([]);
    expect(await indexRecord("leetcode:1")).toMatchObject({ status: "failed" });
  });

  it("does nothing when the queue is empty", async () => {
    const github = fakeGitHub({ "README.md": "# dsa\n" });
    await drainQueue(github.api, CONFIG);

    expect(github.commits).toHaveLength(0);
  });

  it("recovers the dashboard row for a problem that only synced on retry", async () => {
    await set("syncIndex", {});
    const github = fakeGitHub({ "README.md": "# dsa\n" });
    await enqueue(problem());

    await drainQueue(github.api, CONFIG);

    expect(github.files.get("README.md")).toContain(`[Two Sum](${SOLUTION_PATH})`);
    expect(await indexRecord("leetcode:1")).toMatchObject({ status: "success" });
  });
});
