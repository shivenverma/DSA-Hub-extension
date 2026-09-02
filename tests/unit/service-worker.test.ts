/**
 * The service worker, driven through its real listeners.
 *
 * Every test sends an actual `chrome.runtime` message or fires an actual alarm or
 * notification button, and GitHub is faked at the `fetch` boundary rather than by
 * injecting a client — because the worker builds its own client from stored auth, and
 * because "how many requests did that cost" is then a real assertion rather than a
 * comment. This is the only place PRD §57's acceptance tests 8 and 10 can be checked
 * end to end without a browser.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Message, Responses } from "@/messaging";
import { fromBase64, toBase64 } from "@/github/client";
import { DEFAULT_CONFIG, get, patchConfig, set, type SyncRecord } from "@/storage/storage";
import { enqueue, listJobs, parkForChoice } from "@/sync/queue";
import { ASK_UPDATE } from "@/background/notify";
import type { ProblemMetadata, Solution } from "@/platforms/core/types";
import type { Result } from "@/utils/result";
import "@/background/service-worker";

const RETRY_ALARM = "dsahub-retry";
const SOLUTION_PATH = "Arrays/0001-Two-Sum/solution.cpp";
const PROBLEM_README = "Arrays/0001-Two-Sum/README.md";

/**
 * Captured at import time, before any `beforeEach` clears the mocks. These are the four
 * entry points the worker actually has.
 */
const listeners = capture();

function capture() {
  // unbound-method: these are the vitest spies standing in for chrome's registries, read
  // for the listener they recorded. Nothing is called, so `this` never matters.
  /* eslint-disable @typescript-eslint/unbound-method */
  const first = <T>(spy: unknown): T => (spy as { mock: { calls: [T][] } }).mock.calls[0]![0];
  return {
    message: first<
      (m: Message, s: unknown, respond: (r: Result<unknown>) => void) => boolean
    >(chrome.runtime.onMessage.addListener),
    alarm: first<(a: { name: string }) => void>(chrome.alarms.onAlarm.addListener),
    button: first<(id: string, index: number) => void>(
      chrome.notifications.onButtonClicked.addListener,
    ),
    startup: first<() => void>(chrome.runtime.onStartup.addListener),
  };
  /* eslint-enable @typescript-eslint/unbound-method */
}

function send<M extends Message>(message: M): Promise<Result<Responses[M["t"]]>> {
  return new Promise((resolve) => {
    listeners.message(message, {}, resolve as (r: Result<unknown>) => void);
  });
}

/** Fires an alarm and waits for the async work it kicked off to settle. */
async function fireAlarm(name = RETRY_ALARM): Promise<void> {
  listeners.alarm({ name });
  await settle();
}

async function clickNotification(id: string, index: number): Promise<void> {
  listeners.button(id, index);
  await settle();
}

/**
 * Waits for fire-and-forget listener work to finish.
 *
 * The alarm, startup and notification listeners return void, so there is nothing to
 * await. Rather than guessing a tick count, this waits until the fake has been quiet for
 * several turns of the event loop — a real `Response` body read needs macrotasks, not
 * just microtasks, so draining the microtask queue is not enough.
 */
async function settle(): Promise<void> {
  let seen = -1;
  for (let quiet = 0; quiet < 5; ) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (github.calls.length === seen) quiet += 1;
    else {
      seen = github.calls.length;
      quiet = 0;
    }
  }
}

async function armedAlarms(): Promise<string[]> {
  return (await chrome.alarms.getAll()).map((alarm) => alarm.name);
}

const METADATA: ProblemMetadata = {
  platform: "leetcode",
  problemId: "1",
  slug: "two-sum",
  title: "Two Sum",
  url: "https://leetcode.com/problems/two-sum/",
  difficulty: "Easy",
  topics: ["Array", "Hash Table"],
};

const SOLUTION: Solution = {
  language: "C++",
  code: "class Solution {};\n",
  submittedAt: "2026-01-01T12:00:00.000Z",
};

const submission = (solution: Partial<Solution> = {}): Message => ({
  t: "SUBMISSION_ACCEPTED",
  metadata: METADATA,
  solution: { ...SOLUTION, ...solution },
});

/** A second, different solution to the same problem — what a re-solve actually is. */
const FASTER = "class Solution { /* O(n) */ };\n";

interface Fake {
  /** `METHOD /path` per request, in order. */
  calls: string[];
  /** Full request URLs, so a test can prove where the token did *not* go. */
  urls: string[];
  /** Requests that carried a bearer credential in the Authorization header. */
  authorized: number;
  /** One entry per commit that moved the ref — the only thing anyone can see. */
  commits: { message: string; files: Record<string, string> }[];
  files: Map<string, string>;
  /** Set true to make every request fail the way being offline does. */
  offline: boolean;
  /** Set to answer every request with this status instead. */
  status: number | null;
}

/**
 * GitHub at the HTTP boundary. Files become visible only when the ref moves, matching
 * the Git Data API, so "one accepted problem, one commit" stays assertable.
 */
function fakeGitHub(initial: Record<string, string> = {}): Fake {
  const fake: Fake = {
    calls: [],
    urls: [],
    authorized: 0,
    commits: [],
    files: new Map(Object.entries(initial)),
    offline: false,
    status: null,
  };
  const blobs = new Map<string, string>();
  let staged: { path: string; sha: string }[] = [];
  let message = "";
  let ids = 0;
  const sha = (prefix: string) => `${prefix}-${String((ids += 1))}`;

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });

  vi.stubGlobal("fetch", (input: unknown, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const { pathname } = new URL(String(input));
    const body =
      typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
    const headers = (init?.headers ?? {}) as Record<string, string>;
    fake.calls.push(`${method} ${pathname}`);
    fake.urls.push(String(input));
    if (headers.Authorization?.startsWith("Bearer ")) fake.authorized += 1;

    if (fake.offline) return Promise.reject(new TypeError("Failed to fetch"));
    if (fake.status !== null) return Promise.resolve(json({ message: "nope" }, fake.status));

    if (pathname.includes("/contents/")) {
      const path = decodeURIComponent(pathname.split("/contents/")[1] ?? "");
      const content = fake.files.get(path);
      if (content === undefined) return Promise.resolve(json({ message: "Not Found" }, 404));
      return Promise.resolve(
        // toBase64, not btoa: the README contains characters above U+00FF, and btoa
        // throwing on them would look to the client exactly like being offline.
        json({ path, sha: `blob-${path}`, content: toBase64(content), encoding: "base64" }),
      );
    }
    if (pathname.includes("/git/ref/heads/")) {
      return Promise.resolve(json({ object: { sha: "head" } }));
    }
    if (method === "GET" && pathname.includes("/git/commits/")) {
      return Promise.resolve(json({ tree: { sha: "base-tree" } }));
    }
    if (pathname.endsWith("/git/blobs")) {
      const id = sha("blob");
      blobs.set(id, fromBase64(String(body.content)));
      return Promise.resolve(json({ sha: id }));
    }
    if (pathname.endsWith("/git/trees")) {
      staged = body.tree as { path: string; sha: string }[];
      return Promise.resolve(json({ sha: sha("tree") }));
    }
    if (pathname.endsWith("/git/commits")) {
      message = String(body.message);
      return Promise.resolve(json({ sha: sha("commit") }));
    }
    if (pathname.includes("/git/refs")) {
      const written: Record<string, string> = {};
      for (const entry of staged) {
        const content = blobs.get(entry.sha) ?? "";
        fake.files.set(entry.path, content);
        written[entry.path] = content;
      }
      fake.commits.push({ message, files: written });
      return Promise.resolve(json({}));
    }
    if (pathname.endsWith("/branches")) {
      return Promise.resolve(json([{ name: "main" }, { name: "dev" }]));
    }
    return Promise.resolve(json({ name: "dsa", default_branch: "main", owner: { login: "octocat" } }));
  });

  return fake;
}

const TOKEN = "gho_testtokentesttokentesttoken12345678";

let github: Fake;

beforeEach(async () => {
  github = fakeGitHub();
  await set("auth", {
    accessToken: TOKEN,
    scope: "repo",
    login: "octocat",
    connectedAt: "2026-01-01T00:00:00.000Z",
  });
  await patchConfig({ ...DEFAULT_CONFIG, repoOwner: "octocat", repoName: "dsa", branch: "main" });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function record(): Promise<SyncRecord | undefined> {
  return (await get("syncIndex"))["leetcode:1"];
}

describe("an accepted submission", () => {
  it("commits it and says so", async () => {
    const result = await send(submission());

    expect(result).toMatchObject({ ok: true, value: { status: "synced", path: SOLUTION_PATH } });
    expect(github.commits).toHaveLength(1);
    expect(Object.keys(github.commits[0]!.files).sort()).toEqual([
      PROBLEM_README,
      SOLUTION_PATH,
      "README.md",
    ]);
    expect(await record()).toMatchObject({ status: "success" });
  });

  it("tells the user where the solution landed", async () => {
    await send(submission());

    expect(chrome.notifications.create).toHaveBeenCalledWith(
      "dsahub:sync:leetcode:1",
      expect.objectContaining({ title: "Synced Two Sum" }),
    );
  });

  it("refuses before onboarding is finished, without calling GitHub", async () => {
    await patchConfig({ repoOwner: undefined, repoName: undefined });

    const result = await send(submission());

    expect(result).toMatchObject({ ok: false, code: "AUTH_FAILED" });
    expect(github.calls).toEqual([]);
  });
});

describe("a submission that cannot be synced right now", () => {
  it("queues it, records it as pending, and never calls it synced (Rule 14)", async () => {
    github.offline = true;

    const result = await send(submission());

    expect(result).toMatchObject({ ok: false, retryable: true });
    expect(await listJobs()).toHaveLength(1);
    expect(await record()).toMatchObject({ status: "pending" });
    // Both halves of Rule 14: it is reported, and it is not reported as done.
    expect(JSON.stringify(result)).toMatch(/is queued/);
  });

  it("starts the retry heartbeat, because nothing else will", async () => {
    github.offline = true;

    await send(submission());

    expect(await armedAlarms()).toContain(RETRY_ALARM);
  });

  it("says queued rather than synced in the notification", async () => {
    github.offline = true;

    await send(submission());

    expect(chrome.notifications.create).toHaveBeenCalledWith(
      "dsahub:sync:leetcode:1",
      expect.objectContaining({ title: "Two Sum is queued, not synced yet" }),
    );
  });

  it("does not queue a failure retrying cannot fix", async () => {
    github.status = 401;

    const result = await send(submission());

    expect(result).toMatchObject({ ok: false, code: "AUTH_FAILED", retryable: false });
    expect(await listJobs()).toEqual([]);
    expect(await armedAlarms()).not.toContain(RETRY_ALARM);
    expect(chrome.notifications.create).toHaveBeenCalledWith(
      "dsahub:sync:leetcode:1",
      expect.objectContaining({ title: "Could not sync Two Sum" }),
    );
  });
});

describe("automatic syncing switched off (PRD §31)", () => {
  it("holds the submission instead of losing it, and touches no network", async () => {
    await patchConfig({ autoSync: false });

    const result = await send(submission());

    expect(result).toMatchObject({ ok: true, value: { status: "skipped" } });
    expect(github.calls).toEqual([]);
    expect(await listJobs()).toHaveLength(1);
    // Visible on the dashboard as pending, so the counts agree with the queue.
    expect(await record()).toMatchObject({ status: "pending" });
  });

  it("arms no alarm, because a timer cannot press Sync now", async () => {
    await patchConfig({ autoSync: false });

    await send(submission());

    expect(await armedAlarms()).not.toContain(RETRY_ALARM);
  });

  it("still syncs when the user presses Sync now", async () => {
    await patchConfig({ autoSync: false });
    await send(submission());

    const result = await send({ t: "SYNC_NOW" });

    expect(result).toMatchObject({ ok: true });
    expect(github.commits).toHaveLength(1);
    expect(await listJobs()).toEqual([]);
    expect(await record()).toMatchObject({ status: "success" });
  });
});

describe("re-solving a problem with duplicateHandling: ask (PRD §33)", () => {
  beforeEach(async () => {
    await patchConfig({ duplicateHandling: "ask" });
    await send(submission()); // the first solve, which just syncs
    github.commits.length = 0;
    vi.mocked(chrome.notifications.create).mockClear();
  });

  it("holds the resubmission and asks, without writing anything", async () => {
    const result = await send(submission({ code: FASTER }));

    expect(result).toMatchObject({ ok: true, value: { status: "skipped" } });
    expect(github.commits).toEqual([]);
    expect(await listJobs()).toMatchObject([{ id: "leetcode:1", awaitingChoice: true }]);
    expect(chrome.notifications.create).toHaveBeenCalledWith(
      "dsahub:ask:leetcode:1",
      expect.objectContaining({ requireInteraction: true }),
    );
  });

  it("leaves the record saying success — the saved solution really is in the repository", async () => {
    await send(submission({ code: FASTER }));

    expect(await record()).toMatchObject({ status: "success" });
  });

  it("keeps the question waiting rather than letting a retry answer it", async () => {
    await send(submission({ code: FASTER }));

    await fireAlarm();

    expect(github.commits).toEqual([]);
    expect(await listJobs()).toHaveLength(1);
    // A parked job is not waiting on a timer, so the heartbeat stops.
    expect(await armedAlarms()).not.toContain(RETRY_ALARM);
  });

  it("does not ask about a problem that was never synced", async () => {
    await send({
      t: "SUBMISSION_ACCEPTED",
      metadata: { ...METADATA, problemId: "15", slug: "3sum", title: "3Sum" },
      solution: SOLUTION,
    });

    expect(github.commits).toHaveLength(1);
    expect(await listJobs()).toEqual([]);
  });

  it("replaces the solution when the user picks Update it", async () => {
    await send(submission({ code: FASTER }));

    await clickNotification("dsahub:ask:leetcode:1", ASK_UPDATE);

    expect(github.commits).toHaveLength(1);
    expect(github.commits[0]?.message).toBe("feat: update LeetCode Two Sum solution");
    expect(github.commits[0]?.files[SOLUTION_PATH]).toBe(FASTER);
    expect(await listJobs()).toEqual([]);
  });

  it("drops the submission when the user picks Keep existing", async () => {
    await send(submission({ code: FASTER }));

    await clickNotification("dsahub:ask:leetcode:1", 1);

    expect(github.commits).toEqual([]);
    expect(github.files.get(SOLUTION_PATH)).toBe(SOLUTION.code);
    expect(await listJobs()).toEqual([]);
    // Nothing failed: the state after answering is exactly the state before asking.
    expect(await record()).toMatchObject({ status: "success" });
  });

  it("ignores a button on some other extension's notification", async () => {
    await send(submission({ code: FASTER }));

    await clickNotification("someone-else:1", ASK_UPDATE);

    expect(await listJobs()).toHaveLength(1);
  });

  it("gives the popup's buttons the same meaning as the notification's", async () => {
    await send(submission({ code: FASTER }));

    await send({ t: "RESOLVE_CHOICE", jobId: "leetcode:1", update: false });

    expect(github.commits).toEqual([]);
    expect(await listJobs()).toEqual([]);
  });
});

describe("acceptance test 8 — offline, then back online", () => {
  it("queues the submission and syncs it on the next sweep", async () => {
    github.offline = true;
    const held = await send(submission());

    expect(held).toMatchObject({ ok: false, retryable: true });
    expect(await record()).toMatchObject({ status: "pending" });

    github.offline = false;
    await fireAlarm();

    expect(github.commits).toHaveLength(1);
    expect(github.commits[0]?.files[SOLUTION_PATH]).toBe(SOLUTION.code);
    expect(await listJobs()).toEqual([]);
    expect(await record()).toMatchObject({ status: "success" });
  });

  it("sweeps the queue on startup, because MV3 does not promise the alarm survived", async () => {
    github.offline = true;
    await send(submission());

    github.offline = false;
    listeners.startup();
    await settle();

    expect(github.commits[0]?.files[SOLUTION_PATH]).toBe(SOLUTION.code);
  });

  it("stops the heartbeat once the queue is empty", async () => {
    github.offline = true;
    await send(submission());
    github.offline = false;

    await fireAlarm();

    expect(await armedAlarms()).not.toContain(RETRY_ALARM);
  });

  it("leaves the job queued when it is still offline", async () => {
    github.offline = true;
    await send(submission());

    await fireAlarm();

    expect(await listJobs()).toHaveLength(1);
    expect(await armedAlarms()).toContain(RETRY_ALARM);
  });
});

describe("acceptance test 10 — the repository changes", () => {
  it("commits the next solution to the new repository", async () => {
    await send(submission());
    await patchConfig({ repoName: "algorithms", branch: "trunk" });
    github.calls.length = 0;

    await send({
      t: "SUBMISSION_ACCEPTED",
      metadata: { ...METADATA, problemId: "15", slug: "3sum", title: "3Sum" },
      solution: SOLUTION,
    });

    expect(github.calls.every((call) => call.includes("/octocat/algorithms/"))).toBe(true);
    expect(github.calls.some((call) => call.includes("/git/refs/heads/trunk"))).toBe(true);
  });

  it("still counts the solutions synced to the old repository", async () => {
    // The index is the source of truth for the dashboard and the README; changing where
    // future solutions go does not unsolve the past ones (Rule 14).
    await send(submission());

    await patchConfig({ repoName: "algorithms" });

    expect(await record()).toMatchObject({ status: "success" });
  });
});

describe("the retry sweep", () => {
  it("does nothing and stops itself when automatic syncing is off", async () => {
    await patchConfig({ autoSync: false });
    await enqueue({ ...METADATA, primaryCategory: "Arrays", ...SOLUTION, solvedAt: SOLUTION.submittedAt });

    await fireAlarm();

    expect(github.calls).toEqual([]);
    expect(await armedAlarms()).not.toContain(RETRY_ALARM);
  });

  it("stops itself when the queue is empty", async () => {
    await fireAlarm();

    expect(github.calls).toEqual([]);
    expect(await armedAlarms()).not.toContain(RETRY_ALARM);
  });

  it("ignores alarms that are not its own", async () => {
    github.offline = true;
    await send(submission());
    github.offline = false;
    github.calls.length = 0;

    await fireAlarm("some-other-alarm");

    expect(github.calls).toEqual([]);
  });
});

describe("branch list caching (PRD §47)", () => {
  it("asks GitHub once and answers the rest from cache", async () => {
    const first = await send({ t: "BRANCH_LIST" });
    const cost = github.calls.length;
    github.calls.length = 0;

    const second = await send({ t: "BRANCH_LIST" });

    expect(first).toEqual(second);
    expect(cost).toBeGreaterThan(0);
    expect(github.calls).toEqual([]);
  });

  it("returns the branches the repository actually has", async () => {
    const result = await send({ t: "BRANCH_LIST" });

    expect(result).toMatchObject({ ok: true, value: { branches: ["main", "dev"] } });
  });

  it("does not answer for one repository out of another's cache", async () => {
    await send({ t: "BRANCH_LIST" });
    await patchConfig({ repoName: "algorithms" });
    github.calls.length = 0;

    await send({ t: "BRANCH_LIST" });

    expect(github.calls.length).toBeGreaterThan(0);
  });

  it("keeps a sync off the branch endpoint entirely", async () => {
    // The cache exists for the popup. A sync resolves its target from config, so it must
    // spend no requests on repository metadata at all.
    await send(submission());

    expect(github.calls.some((call) => call.endsWith("/branches"))).toBe(false);
    expect(github.calls).not.toContain("GET /repos/octocat/dsa");
  });
});

describe("Rule 13 — the worker never leaks a credential", () => {
  it("keeps the token out of every failure it reports and logs", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    github.offline = true;

    const result = await send(submission());
    await fireAlarm();

    const said = [JSON.stringify(result), ...errors.mock.calls.map((call) => JSON.stringify(call))];
    for (const line of said) {
      expect(line).not.toContain(TOKEN);
      expect(line).not.toMatch(/gh[pousr]_|github_pat_/);
    }
    errors.mockRestore();
  });

  it("sends the token to GitHub's API only, and only as a header", async () => {
    await send(submission());

    expect(github.urls.length).toBeGreaterThan(0);
    expect(github.authorized).toBe(github.urls.length);
    for (const url of github.urls) {
      expect(url.startsWith("https://api.github.com/")).toBe(true);
      // A token in a URL ends up in logs and proxies; it belongs in the header only.
      expect(url).not.toContain(TOKEN);
    }
  });
});

describe("parked jobs left over from a previous session", () => {
  it("are not synced by a sweep that happens to find them", async () => {
    await parkForChoice({ ...METADATA, primaryCategory: "Arrays", ...SOLUTION, solvedAt: SOLUTION.submittedAt });

    await fireAlarm();

    expect(github.commits).toEqual([]);
    expect(await listJobs()).toHaveLength(1);
  });
});
