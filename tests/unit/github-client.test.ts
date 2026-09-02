import { afterEach, describe, expect, it, vi } from "vitest";
import { GitHubClient, GitHubError, toBase64, toFailure } from "@/github/client";
import { commitFiles } from "@/github/commit";

const TOKEN = "gho_testtokentesttokentesttoken12345678";

/**
 * A scripted `fetch`: each entry matches a request and supplies its response, so a
 * test asserts on the *sequence* of calls the client makes, not just the result.
 */
interface Call {
  method: string;
  url: string;
  body: unknown;
  headers: Record<string, string>;
}

function mockFetch(handler: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const spy = vi.fn(async (input: unknown, init?: RequestInit) => {
    const call: Call = {
      method: init?.method ?? "GET",
      url: String(input),
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      headers: (init?.headers ?? {}) as Record<string, string>,
    };
    calls.push(call);
    return await handler(call);
  });
  vi.stubGlobal("fetch", spy);
  return calls;
}

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });

const REPO = {
  name: "dsa-solutions",
  full_name: "octocat/dsa-solutions",
  private: true,
  default_branch: "main",
  owner: { login: "octocat" },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("authorization", () => {
  it("sends the token as a bearer credential and pins the API version", async () => {
    const calls = mockFetch(() => json({ login: "octocat" }));

    await new GitHubClient(TOKEN).getUser();

    expect(calls[0]?.url).toBe("https://api.github.com/user");
    expect(calls[0]?.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(calls[0]?.headers["X-GitHub-Api-Version"]).toBe("2022-11-28");
  });

  it("never writes the token to the console (PRD §37)", async () => {
    // The credential rule is worth a test rather than a convention: a `log.debug` of a
    // request or a thrown response body would leak it, and nothing else would catch that.
    const sinks = (["log", "info", "warn", "error", "debug"] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => undefined),
    );
    mockFetch(() => json({ message: "Bad credentials" }, { status: 401 }));

    await expect(new GitHubClient(TOKEN).getUser()).rejects.toBeInstanceOf(GitHubError);

    const written = sinks
      .flatMap((sink) => sink.mock.calls.flat() as unknown[])
      .map((arg) => JSON.stringify(arg) ?? "");
    expect(written.join(" ")).not.toContain(TOKEN);
  });

  it("keeps the token out of the failure that reaches the UI", async () => {
    mockFetch(() => json({ message: "Bad credentials" }, { status: 401 }));

    const failure = await new GitHubClient(TOKEN)
      .getUser()
      .then(() => null)
      .catch((cause: unknown) => toFailure(cause));

    expect(failure).toMatchObject({ ok: false, code: "AUTH_FAILED", retryable: false });
    expect(JSON.stringify(failure)).not.toContain(TOKEN);
  });
});

describe("error mapping", () => {
  it("maps 401 to a fatal auth failure", async () => {
    mockFetch(() => json({}, { status: 401 }));
    await expect(new GitHubClient(TOKEN).getUser()).rejects.toMatchObject({
      code: "AUTH_FAILED",
      retryable: false,
    });
  });

  it("maps an exhausted rate limit to a retryable RATE_LIMITED", async () => {
    const reset = Math.floor(Date.now() / 1000) + 300;
    mockFetch(
      () =>
        new Response("{}", {
          status: 403,
          headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(reset) },
        }),
    );

    const error = await new GitHubClient(TOKEN).getUser().catch((cause: unknown) => cause);
    expect(error).toMatchObject({ code: "RATE_LIMITED", retryable: true });
    // The user is told when, not just that it failed (PRD §49).
    expect((error as GitHubError).message).toMatch(/about 5 minutes/);
  });

  it("distinguishes a permission 403 from a rate-limit 403", async () => {
    // Retrying a permission problem forever would burn the queue and never succeed.
    mockFetch(() => new Response("{}", { status: 403, headers: { "x-ratelimit-remaining": "42" } }));
    await expect(new GitHubClient(TOKEN).getUser()).rejects.toMatchObject({
      code: "GITHUB_FAILED",
      retryable: false,
    });
  });

  it("treats 404 as fatal and 409 as retryable", async () => {
    mockFetch(() => json({}, { status: 404 }));
    await expect(new GitHubClient(TOKEN).getRepository("octocat", "nope")).rejects.toMatchObject({
      retryable: false,
      status: 404,
    });

    mockFetch(() => json({}, { status: 409 }));
    await expect(new GitHubClient(TOKEN).getRepository("octocat", "empty")).rejects.toMatchObject({
      retryable: true,
      status: 409,
    });
  });

  it("retries 5xx and surfaces GitHub's 422 detail", async () => {
    mockFetch(() => json({}, { status: 503 }));
    await expect(new GitHubClient(TOKEN).getUser()).rejects.toMatchObject({ retryable: true });

    mockFetch(() => json({ message: "Reference cannot be updated" }, { status: 422 }));
    await expect(new GitHubClient(TOKEN).getUser()).rejects.toMatchObject({
      retryable: true,
      message: expect.stringContaining("Reference cannot be updated") as string,
    });
  });

  it("maps a thrown fetch to a retryable network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))),
    );
    await expect(new GitHubClient(TOKEN).getUser()).rejects.toMatchObject({
      code: "NETWORK_ERROR",
      retryable: true,
    });
  });

  it("flattens an unknown throw without leaking its detail", () => {
    expect(toFailure(new Error("connect ECONNREFUSED 10.0.0.1:443"))).toEqual({
      ok: false,
      code: "UNKNOWN_ERROR",
      message: "DSAHub hit an unexpected error talking to GitHub.",
      retryable: false,
    });
  });
});

describe("repository reads", () => {
  it("drops repositories the token cannot push to", async () => {
    mockFetch(() =>
      json([
        { ...REPO, name: "mine", permissions: { push: true } },
        { ...REPO, name: "read-only", permissions: { push: false } },
        { ...REPO, name: "unknown-perms" },
      ]),
    );

    const repos = await new GitHubClient(TOKEN).getRepositories();
    expect(repos.map((repo) => repo.name)).toEqual(["mine", "unknown-perms"]);
  });

  it("reads a missing file as null, not as an error", async () => {
    // Every sync asks "does this already exist?" — a 404 is the answer, not a failure.
    mockFetch(() => json({}, { status: 404 }));
    await expect(
      new GitHubClient(TOKEN).getFile("octocat", "dsa", "a/b.py", "main"),
    ).resolves.toBeNull();
  });

  it("still raises a real error when reading a file fails", async () => {
    mockFetch(() => json({}, { status: 401 }));
    await expect(
      new GitHubClient(TOKEN).getFile("octocat", "dsa", "a/b.py", "main"),
    ).rejects.toBeInstanceOf(GitHubError);
  });

  it("keeps slashes in paths but escapes everything else", async () => {
    const calls = mockFetch(() => json({ path: "x", sha: "s" }));

    await new GitHubClient(TOKEN).getFile(
      "octocat",
      "dsa",
      "Arrays/two sum/solution.py",
      "feat/new",
    );

    expect(calls[0]?.url).toBe(
      "https://api.github.com/repos/octocat/dsa/contents/Arrays/two%20sum/solution.py?ref=feat%2Fnew",
    );
  });

  it("creates a repository with a first commit already in place", async () => {
    const calls = mockFetch(() => json(REPO));
    await new GitHubClient(TOKEN).createRepository("dsa-solutions", true);

    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.body).toMatchObject({ name: "dsa-solutions", private: true, auto_init: true });
  });
});

describe("toBase64", () => {
  it("encodes plain ASCII", () => {
    expect(toBase64("hello")).toBe("aGVsbG8=");
  });

  it("encodes non-ASCII source, which btoa alone cannot", () => {
    // A single accented character in a comment would otherwise throw and fail the sync.
    expect(atob(toBase64("// naïve — 日本語"))).not.toBe("");
    expect(new TextDecoder().decode(Uint8Array.from(atob(toBase64("café 日本")), (c) => c.charCodeAt(0)))).toBe(
      "café 日本",
    );
  });

  it("round-trips an emoji outside the BMP", () => {
    const text = "print('🎉')";
    const decoded = new TextDecoder().decode(
      Uint8Array.from(atob(toBase64(text)), (c) => c.charCodeAt(0)),
    );
    expect(decoded).toBe(text);
  });
});

describe("commitFiles", () => {
  const target = { owner: "octocat", repo: "dsa", branch: "main" };
  const files = [
    { path: "Arrays/two-sum/solution.py", content: "print(1)" },
    { path: "Arrays/two-sum/README.md", content: "# Two Sum" },
  ];

  /** Serves the blob→tree→commit→ref sequence for a repo that already has commits. */
  function serveHappyPath() {
    let blob = 0;
    return mockFetch((call) => {
      if (call.url.endsWith("/git/ref/heads/main")) return json({ object: { sha: "head-sha" } });
      if (call.url.includes("/git/commits/head-sha")) return json({ sha: "head-sha", tree: { sha: "base-tree" } });
      if (call.url.endsWith("/git/blobs")) return json({ sha: `blob-${String(++blob)}` });
      if (call.url.endsWith("/git/trees")) return json({ sha: "new-tree" });
      if (call.url.endsWith("/git/commits")) return json({ sha: "new-commit" });
      if (call.url.endsWith("/git/refs/heads/main")) return json({ object: { sha: "new-commit" } });
      throw new Error(`unexpected call ${call.method} ${call.url}`);
    });
  }

  it("writes every file in one commit, in blob→tree→commit→ref order", async () => {
    // One commit is the whole point: a README that lands without its solution would
    // advertise work that is not there (Rule 14).
    const calls = serveHappyPath();

    const result = await commitFiles(new GitHubClient(TOKEN), target, "sync", files);

    expect(result).toEqual({ sha: "new-commit", paths: files.map((f) => f.path) });
    expect(calls.map((call) => `${call.method} ${new URL(call.url).pathname.split("/git/")[1] ?? "meta"}`)).toEqual([
      "GET ref/heads/main",
      "GET commits/head-sha",
      "POST blobs",
      "POST blobs",
      "POST trees",
      "POST commits",
      "PATCH refs/heads/main",
    ]);
  });

  it("builds on the existing tree so unrelated files survive", async () => {
    const calls = serveHappyPath();
    await commitFiles(new GitHubClient(TOKEN), target, "sync", files);

    const tree = calls.find((call) => call.url.endsWith("/git/trees"));
    expect(tree?.body).toMatchObject({ base_tree: "base-tree" });
    expect((tree?.body as { tree: unknown[] }).tree).toEqual([
      { path: files[0]?.path, mode: "100644", type: "blob", sha: "blob-1" },
      { path: files[1]?.path, mode: "100644", type: "blob", sha: "blob-2" },
    ]);
  });

  it("parents the commit on the current head and moves the ref without forcing", async () => {
    const calls = serveHappyPath();
    await commitFiles(new GitHubClient(TOKEN), target, "sync solution", files);

    expect(calls.find((call) => call.url.endsWith("/git/commits"))?.body).toEqual({
      message: "sync solution",
      tree: "new-tree",
      parents: ["head-sha"],
    });
    // force:true would silently discard a commit someone else pushed.
    expect(calls.find((call) => call.method === "PATCH")?.body).toEqual({
      sha: "new-commit",
      force: false,
    });
  });

  it("creates the branch instead when the repository is empty", async () => {
    // A repo selected during onboarding may have no commits at all; a parent list
    // referencing nothing would 422 on every sync.
    let blob = 0;
    const calls = mockFetch((call) => {
      if (call.url.endsWith("/git/ref/heads/main")) return json({}, { status: 404 });
      if (call.url.endsWith("/git/blobs")) return json({ sha: `blob-${String(++blob)}` });
      if (call.url.endsWith("/git/trees")) return json({ sha: "new-tree" });
      if (call.url.endsWith("/git/commits")) return json({ sha: "first-commit" });
      if (call.url.endsWith("/git/refs")) return json({ object: { sha: "first-commit" } });
      throw new Error(`unexpected call ${call.method} ${call.url}`);
    });

    const result = await commitFiles(new GitHubClient(TOKEN), target, "first", [files[0]!]);

    expect(result.sha).toBe("first-commit");
    expect(calls.find((call) => call.url.endsWith("/git/commits"))?.body).toMatchObject({
      parents: [],
    });
    expect(calls.find((call) => call.url.endsWith("/git/refs"))?.body).toEqual({
      ref: "refs/heads/main",
      sha: "first-commit",
    });
    // No base_tree: there is no tree to build on.
    expect(calls.find((call) => call.url.endsWith("/git/trees"))?.body).not.toHaveProperty(
      "base_tree",
    );
  });

  it("never moves the ref when a blob fails", async () => {
    // The invariant that makes this "atomic": nothing is observable until the ref moves.
    const calls = mockFetch((call) => {
      if (call.url.endsWith("/git/ref/heads/main")) return json({ object: { sha: "head-sha" } });
      if (call.url.includes("/git/commits/head-sha")) return json({ sha: "head-sha", tree: { sha: "base-tree" } });
      if (call.url.endsWith("/git/blobs")) return json({}, { status: 503 });
      throw new Error(`unexpected call ${call.method} ${call.url}`);
    });

    await expect(commitFiles(new GitHubClient(TOKEN), target, "sync", files)).rejects.toMatchObject({
      retryable: true,
    });
    expect(calls.some((call) => call.method === "PATCH" || call.method === "POST" && call.url.endsWith("/git/refs"))).toBe(
      false,
    );
  });

  it("refuses to commit nothing rather than reporting a fake success", async () => {
    const calls = mockFetch(() => json({}));
    await expect(commitFiles(new GitHubClient(TOKEN), target, "sync", [])).rejects.toBeInstanceOf(
      GitHubError,
    );
    expect(calls).toHaveLength(0);
  });
});
