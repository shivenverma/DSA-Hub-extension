import type { Difficulty, Platform, Problem } from "@/platforms/core/types";

/**
 * Everything DSAHub persists lives in chrome.storage.local (PRD §38, §51 —
 * local-first, no backend). Schema and accessors are one module because the
 * schema has exactly one consumer: these accessors.
 */

export interface AuthState {
  accessToken: string;
  scope: string;
  login: string;
  avatarUrl?: string;
  connectedAt: string;
}

export interface Config {
  repoOwner?: string;
  repoName?: string;
  branch?: string;
  newRepoVisibility: "private" | "public";
  autoSync: boolean;
  fileNaming: "solution" | "problem-name" | "main";
  updateReadme: boolean;
  problemReadmes: boolean;
  duplicateHandling: "update" | "ignore" | "ask";
  notifications: boolean;
}

/** One synced problem. Also the unit the README and statistics are derived from. */
export interface SyncRecord {
  platform: Platform;
  problemId?: string;
  slug?: string;
  title: string;
  url: string;
  githubPath: string;
  commitSha?: string;
  difficulty: Difficulty;
  primaryCategory: string;
  topics: string[];
  language: string;
  solvedAt: string;
  status: "success" | "failed" | "pending";
  /**
   * Why this record is not `success` — a sentence for the popup to show (PRD §49: every
   * failure needs a human-readable message, and the page console is not a UI). Not called
   * `lastError`, because "automatic syncing is off" is a reason and not an error.
   */
  reason?: string;
}

/** A queued sync, durable across service-worker restarts (PRD §44). */
export interface SyncJob {
  id: string;
  problem: Problem;
  attempts: number;
  /** Epoch ms; the retry sweep ignores jobs until this passes. */
  nextAttemptAt: number;
  lastError?: string;
  createdAt: string;
  /**
   * Set when the job is waiting on the user rather than on the network — a re-solve
   * under `duplicateHandling: "ask"` (PRD §33). The retry sweep skips these: no amount
   * of waiting answers a question.
   */
  awaitingChoice?: boolean;
}

/**
 * Cached GitHub metadata (PRD §47).
 *
 * Only branch lists are here. The sync path spends no requests on repository metadata
 * at all — onboarding records the branch, so `resolveTarget` resolves from config — so
 * there is nothing on that path left to cache. The popup is the one caller that would
 * otherwise re-list branches every time it opens.
 */
export interface CacheState {
  /** Keyed by `owner/repo`. */
  branches: Record<string, { names: string[]; defaultBranch: string; ts: number }>;
}

export interface StorageShape {
  auth?: AuthState;
  config: Config;
  /** Keyed by problemKey() — the source of truth for dedupe, stats and the README. */
  syncIndex: Record<string, SyncRecord>;
  queue: SyncJob[];
  cache: CacheState;
  selectedAvatar?: string;
}

export const DEFAULT_AVATAR = "😊";

export const AVATAR_OPTIONS = [
  { id: "smile", emoji: "😊", label: "Smiling Face" },
  { id: "cool", emoji: "😎", label: "Cool with Sunglasses" },
  { id: "nerd", emoji: "🤓", label: "Nerd Face" },
  { id: "coder", emoji: "🧑‍💻", label: "Technologist / Developer" },
  { id: "party", emoji: "🥳", label: "Partying Face" },
  { id: "star", emoji: "🤩", label: "Star-Struck" },
  { id: "happy", emoji: "😄", label: "Grinning Face with Smiling Eyes" },
  { id: "calm", emoji: "🙂", label: "Slightly Smiling Face" },
  { id: "grin", emoji: "😁", label: "Beaming Face" },
  { id: "zen", emoji: "🧘", label: "Person in Lotus Position" },
  { id: "fox", emoji: "🦊", label: "Fox" },
  { id: "penguin", emoji: "🐧", label: "Penguin" },
];

export const DEFAULT_CONFIG: Config = {
  newRepoVisibility: "private", // safe onboarding default (PRD §11)
  autoSync: true,
  fileNaming: "solution", // PRD §24
  updateReadme: true,
  problemReadmes: true,
  duplicateHandling: "update", // PRD §33
  notifications: true,
};

const FALLBACKS: { [K in keyof StorageShape]: StorageShape[K] } = {
  auth: undefined,
  config: DEFAULT_CONFIG,
  syncIndex: {},
  queue: [],
  cache: { branches: {} },
  selectedAvatar: DEFAULT_AVATAR,
};

export async function get<K extends keyof StorageShape>(key: K): Promise<StorageShape[K]> {
  const stored = await chrome.storage.local.get<Partial<StorageShape>>(key);
  return stored[key] ?? FALLBACKS[key];
}

export async function set<K extends keyof StorageShape>(
  key: K,
  value: StorageShape[K],
): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

/** Merges over defaults so a config written by an older version gains new fields. */
export async function getConfig(): Promise<Config> {
  return { ...DEFAULT_CONFIG, ...(await get("config")) };
}

export async function patchConfig(patch: Partial<Config>): Promise<Config> {
  const next: Config = { ...(await getConfig()), ...patch };
  await set("config", next);
  return next;
}

export async function getAvatar(): Promise<string> {
  const avatar = await get("selectedAvatar");
  return avatar || DEFAULT_AVATAR;
}

export async function setAvatar(avatar: string): Promise<void> {
  await set("selectedAvatar", avatar);
}

