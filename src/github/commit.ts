/**
 * Multi-file commits through the Git Data API: blob → tree → commit → ref.
 *
 * The Contents API (`PUT /contents/{path}`) makes one commit per file. A sync writes
 * up to three — the solution, its problem README, and the root README — and if the
 * root README lands while the solution does not, the repository advertises a solution
 * that is not there. PRD Rule 14 forbids reporting partial success as success, so all
 * files move as **one** commit that either exists or does not.
 *
 * Atomic here means "one commit", not "transactional". The final `PATCH .../refs` is
 * the only step that changes what anyone sees; every step before it writes objects
 * that are unreachable until then. A failure partway leaves loose objects GitHub
 * garbage-collects, and nothing observable.
 */
import type { GitHubClient, TreeEntry } from "./client";
import { GitHubError } from "./client";

export interface CommitFile {
  /** Repo-relative, forward slashes, no leading slash. */
  path: string;
  /** Plain UTF-8 text. Base64 encoding happens in the client. */
  content: string;
}

export interface CommitTarget {
  owner: string;
  repo: string;
  branch: string;
}

export interface CommitResult {
  sha: string;
  /** Paths as committed, so a caller can record exactly what landed. */
  paths: string[];
}

export async function commitFiles(
  client: GitHubClient,
  target: CommitTarget,
  message: string,
  files: CommitFile[],
): Promise<CommitResult> {
  if (files.length === 0) {
    // Not an error worth surfacing to a user, but a caller asking for an empty
    // commit has a bug, and silently returning a fake sha would hide it.
    throw new GitHubError("GITHUB_FAILED", "DSAHub tried to commit no files.", false);
  }

  const { owner, repo, branch } = target;

  // A brand-new empty repository has no ref, so the first commit has no parent and
  // creates the branch instead of moving it.
  const headSha = await client.getRef(owner, repo, branch);
  const baseTree = headSha ? await client.getCommitTree(owner, repo, headSha) : undefined;

  // Blobs are independent, so they upload concurrently. `Promise.all` rejecting on
  // the first failure is the behaviour we want: without every blob there is no tree.
  const blobs = await Promise.all(
    files.map((file) => client.createBlob(owner, repo, file.content)),
  );

  const entries: TreeEntry[] = files.map((file, index) => ({
    path: file.path,
    mode: "100644",
    type: "blob",
    // Non-null: `Promise.all` preserves order and length, so index i exists.
    sha: blobs[index]!,
  }));

  const treeSha = await client.createTree(owner, repo, entries, baseTree);
  const commitSha = await client.createCommit(owner, repo, {
    message,
    tree: treeSha,
    parents: headSha ? [headSha] : [],
  });

  await client.setRef(owner, repo, branch, commitSha, headSha === null);

  return { sha: commitSha, paths: files.map((file) => file.path) };
}
