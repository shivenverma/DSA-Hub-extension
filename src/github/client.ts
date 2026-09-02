/**
 * The single place raw `api.github.com` calls are made (PRD §34) — adapters, the
 * sync engine and the popup all go through this class, never through `fetch`.
 *
 * Errors are thrown as `GitHubError`, not returned as `Result`. Threading `Result`
 * through eight methods would put an `if (!r.ok) return r` at every call site inside
 * the commit builder, where a mid-sequence failure must abort anyway. The structure a
 * `Result` carries (code, retryable, human message) rides on the error instead, and
 * `toFailure()` flattens it once, at the message boundary.
 *
 * Nothing here logs. The Authorization header and the token it carries never reach the
 * logger, by construction (PRD §37).
 */
import { GITHUB } from "./config";
import { err, type Failure, type FailureCode } from "@/utils/result";

export class GitHubError extends Error {
  readonly code: FailureCode;
  readonly retryable: boolean;
  readonly status?: number;

  constructor(
    code: FailureCode,
    /** Written for a human — shown verbatim in the UI (PRD §49). */
    message: string,
    retryable: boolean,
    status?: number,
  ) {
    super(message);
    this.name = "GitHubError";
    this.code = code;
    this.retryable = retryable;
    this.status = status;
  }
}

/** Flattens any thrown value into the `Result` shape that crosses extension boundaries. */
export function toFailure(cause: unknown): Failure {
  if (cause instanceof GitHubError) return err(cause.code, cause.message, cause.retryable);
  return err("UNKNOWN_ERROR", "DSAHub hit an unexpected error talking to GitHub.");
}

export interface GitHubUser {
  login: string;
  avatar_url?: string;
}

export interface GitHubRepo {
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
  owner: { login: string };
  permissions?: { push?: boolean; admin?: boolean };
}

export interface GitHubFile {
  path: string;
  sha: string;
  /** base64, as GitHub returns it. */
  content?: string;
  encoding?: string;
}

interface GitRef {
  object: { sha: string };
}

interface GitCommit {
  sha: string;
  tree: { sha: string };
}

export interface TreeEntry {
  path: string;
  mode: "100644";
  type: "blob";
  sha: string;
}

export class GitHubClient {
  private readonly token: string;

  constructor(token: string) {
    this.token = token;
  }

  // ── The PRD §34 surface ────────────────────────────────────────────────────

  getUser(): Promise<GitHubUser> {
    return this.request<GitHubUser>("GET", "/user");
  }

  /**
   * Repositories the token can push to, newest first. `affiliation` excludes repos
   * the user merely stars or watches; `push` permission is what actually matters, so
   * it is filtered rather than assumed.
   */
  async getRepositories(): Promise<GitHubRepo[]> {
    const repos = await this.request<GitHubRepo[]>(
      "GET",
      "/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator",
    );
    return repos.filter((repo) => repo.permissions?.push !== false);
  }

  createRepository(name: string, isPrivate: boolean): Promise<GitHubRepo> {
    return this.request<GitHubRepo>("POST", "/user/repos", {
      name,
      private: isPrivate,
      description: "DSA solutions, synced automatically by DSAHub.",
      // Gives the repo a first commit and a branch, so the commit builder never has
      // to special-case an empty repository on the happy path.
      auto_init: true,
    });
  }

  getRepository(owner: string, repo: string): Promise<GitHubRepo> {
    return this.request<GitHubRepo>("GET", `/repos/${enc(owner)}/${enc(repo)}`);
  }

  async getBranches(owner: string, repo: string): Promise<string[]> {
    const branches = await this.request<Array<{ name: string }>>(
      "GET",
      `/repos/${enc(owner)}/${enc(repo)}/branches?per_page=100`,
    );
    return branches.map((branch) => branch.name);
  }

  /** `null` when the file does not exist — a 404 here is an answer, not a failure. */
  async getFile(
    owner: string,
    repo: string,
    path: string,
    branch: string,
  ): Promise<GitHubFile | null> {
    try {
      return await this.request<GitHubFile>(
        "GET",
        `/repos/${enc(owner)}/${enc(repo)}/contents/${encPath(path)}?ref=${enc(branch)}`,
      );
    } catch (cause) {
      if (cause instanceof GitHubError && cause.status === 404) return null;
      throw cause;
    }
  }

  createFile(args: ContentsWrite): Promise<{ commit: { sha: string } }> {
    return this.putContents(args);
  }

  /** Same endpoint as `createFile`; the `sha` of the blob being replaced is what differs. */
  updateFile(args: ContentsWrite & { sha: string }): Promise<{ commit: { sha: string } }> {
    return this.putContents(args);
  }

  // ── Git Data API, for multi-file atomic commits (see commit.ts) ────────────

  /** `null` when the branch has no commits yet — a brand-new empty repository. */
  async getRef(owner: string, repo: string, branch: string): Promise<string | null> {
    try {
      const ref = await this.request<GitRef>(
        "GET",
        `/repos/${enc(owner)}/${enc(repo)}/git/ref/heads/${encPath(branch)}`,
      );
      return ref.object.sha;
    } catch (cause) {
      if (cause instanceof GitHubError && cause.status === 404) return null;
      throw cause;
    }
  }

  async getCommitTree(owner: string, repo: string, commitSha: string): Promise<string> {
    const commit = await this.request<GitCommit>(
      "GET",
      `/repos/${enc(owner)}/${enc(repo)}/git/commits/${enc(commitSha)}`,
    );
    return commit.tree.sha;
  }

  async createBlob(owner: string, repo: string, utf8Content: string): Promise<string> {
    const blob = await this.request<{ sha: string }>(
      "POST",
      `/repos/${enc(owner)}/${enc(repo)}/git/blobs`,
      { content: toBase64(utf8Content), encoding: "base64" },
    );
    return blob.sha;
  }

  async createTree(
    owner: string,
    repo: string,
    entries: TreeEntry[],
    baseTree?: string,
  ): Promise<string> {
    const tree = await this.request<{ sha: string }>(
      "POST",
      `/repos/${enc(owner)}/${enc(repo)}/git/trees`,
      { tree: entries, ...(baseTree ? { base_tree: baseTree } : {}) },
    );
    return tree.sha;
  }

  async createCommit(
    owner: string,
    repo: string,
    args: { message: string; tree: string; parents: string[] },
  ): Promise<string> {
    const commit = await this.request<{ sha: string }>(
      "POST",
      `/repos/${enc(owner)}/${enc(repo)}/git/commits`,
      args,
    );
    return commit.sha;
  }

  /** Creates the ref if the branch is new, otherwise moves it. Never forced. */
  async setRef(
    owner: string,
    repo: string,
    branch: string,
    commitSha: string,
    create: boolean,
  ): Promise<void> {
    const base = `/repos/${enc(owner)}/${enc(repo)}/git`;
    if (create) {
      await this.request("POST", `${base}/refs`, { ref: `refs/heads/${branch}`, sha: commitSha });
      return;
    }
    // force:false makes GitHub reject a non-fast-forward with 422, which is the
    // correct outcome: someone else moved the branch and our tree is stale.
    await this.request("PATCH", `${base}/refs/heads/${encPath(branch)}`, {
      sha: commitSha,
      force: false,
    });
  }

  // ── Transport ──────────────────────────────────────────────────────────────

  private putContents(args: ContentsWrite & { sha?: string }): Promise<{ commit: { sha: string } }> {
    const { owner, repo, path, branch, message, content, sha } = args;
    return this.request("PUT", `/repos/${enc(owner)}/${enc(repo)}/contents/${encPath(path)}`, {
      message,
      content: toBase64(content),
      branch,
      ...(sha ? { sha } : {}),
    });
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${GITHUB.api}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": GITHUB.apiVersion,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      // A thrown fetch is offline or DNS — always worth retrying, and the cause is
      // dropped deliberately: it can echo the request, headers included.
      throw new GitHubError(
        "NETWORK_ERROR",
        "Could not reach GitHub. DSAHub will retry when you are back online.",
        true,
      );
    }

    if (!response.ok) throw await describeFailure(response);
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }
}

interface ContentsWrite {
  owner: string;
  repo: string;
  path: string;
  branch: string;
  message: string;
  /** Plain UTF-8; base64 encoding happens here so callers never think about it. */
  content: string;
}

/**
 * Maps a failed response onto a code, a retry decision and a sentence the user can
 * act on. GitHub's own `message` is deliberately not surfaced: it is written for API
 * consumers ("Bad credentials", "Reference update failed") and would leave a user
 * with no idea what to do.
 */
async function describeFailure(response: Response): Promise<GitHubError> {
  const status = response.status;
  const detail = await readMessage(response);

  if (status === 401) {
    return new GitHubError(
      "AUTH_FAILED",
      "GitHub rejected DSAHub's authorization. Reconnect your account in DSAHub to continue.",
      false,
      status,
    );
  }

  if (status === 403 || status === 429) {
    const remaining = response.headers.get("x-ratelimit-remaining");
    if (remaining === "0" || status === 429) {
      return new GitHubError(
        "RATE_LIMITED",
        `GitHub's API rate limit is used up. DSAHub will retry ${resetPhrase(response)}.`,
        true,
        status,
      );
    }
    return new GitHubError(
      "GITHUB_FAILED",
      "GitHub refused the request. The repository may be read-only for your account, or " +
        "your organization may require approval for DSAHub's access.",
      false,
      status,
    );
  }

  if (status === 404) {
    return new GitHubError(
      "GITHUB_FAILED",
      "GitHub could not find that repository or branch. It may have been renamed, " +
        "deleted, or made private to another account.",
      false,
      status,
    );
  }

  if (status === 409) {
    return new GitHubError(
      "GITHUB_FAILED",
      "The repository is empty or the branch moved while DSAHub was writing. Retrying " +
        "usually resolves it.",
      true,
      status,
    );
  }

  if (status === 422) {
    return new GitHubError(
      "GITHUB_FAILED",
      `GitHub rejected the change as invalid${detail ? `: ${detail}` : ""}.`,
      // A stale-parent 422 clears once the commit is rebuilt on the current head.
      true,
      status,
    );
  }

  if (status >= 500) {
    return new GitHubError(
      "GITHUB_FAILED",
      "GitHub is having trouble right now. DSAHub will retry shortly.",
      true,
      status,
    );
  }

  return new GitHubError(
    "GITHUB_FAILED",
    `GitHub returned an unexpected error (HTTP ${String(status)}).`,
    false,
    status,
  );
}

/** GitHub's `message`, when it is safe and short enough to be worth showing. */
async function readMessage(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null) return null;
    const message = (body as { message?: unknown }).message;
    return typeof message === "string" && message.length <= 200 ? message : null;
  } catch {
    return null;
  }
}

function resetPhrase(response: Response): string {
  const reset = Number(response.headers.get("x-ratelimit-reset"));
  if (!Number.isFinite(reset) || reset <= 0) return "later";
  const minutes = Math.max(1, Math.ceil((reset * 1000 - Date.now()) / 60_000));
  return `in about ${String(minutes)} minute${minutes === 1 ? "" : "s"}`;
}

/** Path segments can contain anything a filename can; `/` must survive. */
function encPath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function enc(segment: string): string {
  return encodeURIComponent(segment);
}

/**
 * UTF-8 → base64. `btoa` alone throws on any character above U+00FF, which means
 * every solution containing a non-ASCII comment would fail to commit.
 */
export function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * The exact inverse, for reading a file back before overwriting it. GitHub wraps its
 * base64 at 60 characters; `atob` ignores the newlines, so the payload needs no
 * pre-cleaning.
 */
export function fromBase64(base64: string): string {
  const binary = atob(base64);
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}
