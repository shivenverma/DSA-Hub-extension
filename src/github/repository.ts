/**
 * Turns stored config into a concrete commit target, and owns repository selection
 * during onboarding.
 *
 * The branch is resolved rather than assumed: `main` is only a convention, and a repo
 * created before 2020 — or one following a company template — will be on `master` or
 * `trunk`. Guessing wrong produces a 404 the user cannot act on, so the repository's
 * own `default_branch` is the fallback (PRD §22).
 */
import type { GitHubClient, GitHubRepo } from "./client";
import { GitHubError } from "./client";
import type { CommitTarget } from "./commit";
import type { Config } from "@/storage/storage";

/**
 * Resolves the configured repository into a target that can be committed to.
 *
 * Onboarding always records a branch, so the `getRepository` call is the fallback for
 * config written before a branch was chosen — not a per-sync cost. Nothing is cached
 * here, and PRD §47's cache did not end up needing anything here: a sync spends zero
 * requests on repository metadata, which leaves the popup's branch list as the only
 * repeated call worth caching.
 */
export async function resolveTarget(client: GitHubClient, config: Config): Promise<CommitTarget> {
  const { repoOwner, repoName } = config;
  if (!repoOwner || !repoName) {
    throw new GitHubError(
      "AUTH_FAILED",
      "No repository is selected yet. Open DSAHub and choose where to save your solutions.",
      false,
    );
  }
  if (config.branch) return { owner: repoOwner, repo: repoName, branch: config.branch };

  const repo = await client.getRepository(repoOwner, repoName);
  return { owner: repoOwner, repo: repoName, branch: repo.default_branch };
}

/**
 * Finds the repository by name or creates it. Used by onboarding, where the user
 * either picks an existing repo or types a new name.
 *
 * "Create" is not attempted blindly: a name that already exists returns 422 from
 * GitHub, and telling the user "that name is taken" when the repo is *theirs* and
 * perfectly usable would be a dead end. So an existing repo wins, and its visibility
 * is left alone — silently flipping someone's public repo to private, or the reverse,
 * is not ours to do.
 */
export async function ensureRepository(
  client: GitHubClient,
  owner: string,
  name: string,
  visibility: Config["newRepoVisibility"],
): Promise<{ repo: GitHubRepo; created: boolean }> {
  try {
    return { repo: await client.getRepository(owner, name), created: false };
  } catch (cause) {
    if (!(cause instanceof GitHubError && cause.status === 404)) throw cause;
  }
  return { repo: await client.createRepository(name, visibility === "private"), created: true };
}

/** Branch names for the selection UI, default first so the common choice is the top one. */
export async function listBranches(
  client: GitHubClient,
  owner: string,
  name: string,
): Promise<{ branches: string[]; defaultBranch: string }> {
  const [repo, branches] = await Promise.all([
    client.getRepository(owner, name),
    client.getBranches(owner, name),
  ]);
  return {
    branches: [repo.default_branch, ...branches.filter((b) => b !== repo.default_branch)],
    defaultBranch: repo.default_branch,
  };
}
