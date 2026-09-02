import { afterEach, describe, expect, it, vi } from "vitest";
import { GitHubClient, GitHubError } from "@/github/client";
import { ensureRepository, listBranches, resolveTarget } from "@/github/repository";
import { DEFAULT_CONFIG, type Config } from "@/storage/storage";

/**
 * Branch resolution is the quiet failure here: `main` is a convention, not a rule, and
 * assuming it turns every sync to an older repository into an unactionable 404.
 */
const REPO = {
  name: "dsa-solutions",
  full_name: "octocat/dsa-solutions",
  private: true,
  default_branch: "main",
  owner: { login: "octocat" },
};

function mockFetch(handler: (url: string, init: RequestInit) => Response) {
  const urls: string[] = [];
  const bodies: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: unknown, init?: RequestInit) => {
      urls.push(String(input));
      bodies.push(typeof init?.body === "string" ? JSON.parse(init.body) : undefined);
      return Promise.resolve(handler(String(input), init ?? {}));
    }),
  );
  return { urls, bodies };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const client = () => new GitHubClient("gho_token");
const config = (patch: Partial<Config> = {}): Config => ({ ...DEFAULT_CONFIG, ...patch });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveTarget", () => {
  it("uses the configured branch without asking GitHub", async () => {
    const { urls } = mockFetch(() => json(REPO));

    await expect(
      resolveTarget(client(), config({ repoOwner: "octocat", repoName: "dsa", branch: "main" })),
    ).resolves.toEqual({ owner: "octocat", repo: "dsa", branch: "main" });
    expect(urls).toEqual([]); // no request per sync
  });

  it("falls back to the repository's own default branch", async () => {
    // The case that breaks a hardcoded "main": a repo still on master.
    mockFetch(() => json({ ...REPO, default_branch: "master" }));

    await expect(
      resolveTarget(client(), config({ repoOwner: "octocat", repoName: "dsa" })),
    ).resolves.toEqual({ owner: "octocat", repo: "dsa", branch: "master" });
  });

  it("asks the user to finish setup when no repository is chosen", async () => {
    const { urls } = mockFetch(() => json(REPO));

    await expect(resolveTarget(client(), config())).rejects.toMatchObject({
      code: "AUTH_FAILED",
      message: expect.stringContaining("choose where to save") as string,
    });
    expect(urls).toEqual([]);
  });

  it("treats a repo name with no owner as unconfigured", async () => {
    await expect(resolveTarget(client(), config({ repoName: "dsa" }))).rejects.toBeInstanceOf(
      GitHubError,
    );
  });
});

describe("ensureRepository", () => {
  it("reuses an existing repository without touching its visibility", async () => {
    // Flipping someone's public repo to private (or the reverse) is not ours to do.
    const { urls } = mockFetch(() => json({ ...REPO, private: false }));

    const result = await ensureRepository(client(), "octocat", "dsa-solutions", "private");

    expect(result).toEqual({ repo: { ...REPO, private: false }, created: false });
    expect(urls).toEqual(["https://api.github.com/repos/octocat/dsa-solutions"]);
  });

  it("creates the repository when it does not exist", async () => {
    const { urls, bodies } = mockFetch((url) =>
      url.endsWith("/user/repos") ? json(REPO) : json({ message: "Not Found" }, 404),
    );

    const result = await ensureRepository(client(), "octocat", "dsa-solutions", "private");

    expect(result.created).toBe(true);
    expect(urls[1]).toBe("https://api.github.com/user/repos");
    expect(bodies[1]).toMatchObject({ name: "dsa-solutions", private: true });
  });

  it("honours a public choice", async () => {
    const { bodies } = mockFetch((url) =>
      url.endsWith("/user/repos") ? json({ ...REPO, private: false }) : json({}, 404),
    );

    await ensureRepository(client(), "octocat", "dsa-solutions", "public");
    expect(bodies[1]).toMatchObject({ private: false });
  });

  it("does not try to create when the lookup failed for another reason", async () => {
    // A 401 means the token died; creating a repo on the back of it would be wrong.
    const { urls } = mockFetch(() => json({}, 401));

    await expect(
      ensureRepository(client(), "octocat", "dsa-solutions", "private"),
    ).rejects.toMatchObject({ code: "AUTH_FAILED" });
    expect(urls).toHaveLength(1);
  });
});

describe("listBranches", () => {
  it("puts the default branch first and never repeats it", async () => {
    mockFetch((url) =>
      url.includes("/branches")
        ? json([{ name: "feature/x" }, { name: "main" }, { name: "gh-pages" }])
        : json(REPO),
    );

    await expect(listBranches(client(), "octocat", "dsa")).resolves.toEqual({
      branches: ["main", "feature/x", "gh-pages"],
      defaultBranch: "main",
    });
  });

  it("still lists the default branch when the branch list is empty", async () => {
    mockFetch((url) => (url.includes("/branches") ? json([]) : json(REPO)));

    await expect(listBranches(client(), "octocat", "dsa")).resolves.toEqual({
      branches: ["main"],
      defaultBranch: "main",
    });
  });
});
