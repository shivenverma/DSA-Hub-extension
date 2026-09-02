# DSAHub — Implementation Plan (Engineering Hand-off Spec)

> Companion to `DSAHub — Product Requirements Document (PRD).md`.
>
> **All nine milestones are built.** The extension is in `src/`, and it — not this file — is
> authoritative. Sections 2–16 are the pre-build spec: module stubs, signatures and selector
> maps written before any code existed. They record what was *intended* and are useful for
> that, but where they disagree with the source, the source is right. Read
> [README.md](README.md) for how it actually fits together.
>
> The part of this file that is still current is
> [§17, the milestone record](#17-milestone--file--task--test-build-order-per-prd-62) —
> what each milestone shipped, and what was cut from it and why.
>
> Selector values marked `// VERIFY` were confirmed against the live DOM in M2/M3 and
> captured as fixtures (PRD §48). What fixtures cannot confirm is whether the sites still
> behave that way — see `docs/VERIFY-leetcode.md` and `docs/VERIFY-gfg.md`.

---

## 1. Locked Decisions

| Area | Decision |
|------|----------|
| Stack | TypeScript 6, React 19, Vite 8, Tailwind 4, MV3 |
| Bundler | Vite + `@crxjs/vite-plugin` (manifest-driven multi-entry) |
| Auth | GitHub **OAuth App, Device Flow** — public `client_id` only, no secret, no server |
| GitHub writes | **Git Data API** (blobs→tree→commit→ref) for atomic multi-file commits |
| Categorization | Rule-based (tags→mappings→rules→fallback), no AI |
| Storage | `chrome.storage.local` (auth, config, syncIndex, queue, cache) |
| Tests | Vitest, fixture-driven. Playwright was planned and not built — see §18 |
| MVP hosts | `leetcode.com`, `www.geeksforgeeks.org/problems/*` only |
| Node floor | 22.13 (`engines.node`) — Vite 8 and Vitest 4 will not start below it |

---

## 2. `package.json`

> Superseded by the real [package.json](package.json). Kept for the reasoning; the version
> numbers and the `build`, `icons` and `engines` entries have since changed.

```jsonc
{
  "name": "dsahub",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "lint": "eslint 'src/**/*.{ts,tsx}'",
    "format": "prettier --write ."
  },
  "dependencies": { "react": "^18", "react-dom": "^18" },
  "devDependencies": {
    "@crxjs/vite-plugin": "^2.0.0-beta", "vite": "^5", "typescript": "^5",
    "@types/chrome": "^0.0.268", "@types/react": "^18", "@types/react-dom": "^18",
    "@vitejs/plugin-react": "^4", "tailwindcss": "^3", "postcss": "^8", "autoprefixer": "^10",
    "vitest": "^2", "jsdom": "^25", "@playwright/test": "^1",
    "eslint": "^9", "@typescript-eslint/parser": "^8", "@typescript-eslint/eslint-plugin": "^8",
    "prettier": "^3"
  }
}
```

`vite.config.ts` (essentials):

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.json" assert { type: "json" };

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  build: { target: "esnext", sourcemap: true },
  test: { environment: "jsdom", globals: true, setupFiles: ["./tests/setup.ts"] },
});
```

`tsconfig.json`: `"strict": true`, `"module": "ESNext"`, `"moduleResolution": "Bundler"`, `"jsx": "react-jsx"`, `"types": ["chrome","vitest/globals"]`, path alias `"@/*": ["src/*"]`.

---

## 3. `manifest.json` (real)

```json
{
  "manifest_version": 3,
  "name": "DSAHub",
  "version": "1.0.0",
  "description": "Automatically sync accepted LeetCode and GeeksforGeeks solutions to GitHub.",
  "permissions": ["storage", "notifications", "alarms"],
  "host_permissions": [
    "https://github.com/*",
    "https://api.github.com/*",
    "https://leetcode.com/*",
    "https://www.geeksforgeeks.org/*"
  ],
  "background": { "service_worker": "src/background/service-worker.ts", "type": "module" },
  "action": { "default_popup": "src/popup/index.html", "default_title": "DSAHub" },
  "options_page": "src/options/index.html",
  "icons": { "16": "public/icons/16.png", "48": "public/icons/48.png", "128": "public/icons/128.png" },
  "content_scripts": [
    {
      "matches": ["https://leetcode.com/*", "https://www.geeksforgeeks.org/problems/*"],
      "js": ["src/content/page-interceptor.ts"],
      "run_at": "document_start",
      "world": "MAIN"
    },
    {
      "matches": ["https://leetcode.com/*", "https://www.geeksforgeeks.org/problems/*"],
      "js": ["src/content/content.ts"],
      "run_at": "document_idle",
      "world": "ISOLATED"
    }
  ]
}
```

> No `identity` (Device Flow doesn't need it). No `<all_urls>`. Two content scripts: a **MAIN-world**
> interceptor (patches `fetch`/`XHR`) and an **ISOLATED-world** orchestrator that talks to the SW.

---

## 4. Directory Map (per-file responsibility)

```
src/
├─ background/
│  ├─ service-worker.ts   wires messaging router + queue processor + alarm handlers
│  ├─ messaging.ts        typed runtime message router (§6)
│  └─ alarms.ts           alarm names + handlers: device-poll, retry-sweep, online-sweep
├─ content/
│  ├─ page-interceptor.ts MAIN world: monkey-patch fetch/XHR → window.postMessage(DSAHUB_*)
│  └─ content.ts          ISOLATED: resolve adapter, listen to interceptor + DOM, send SUBMISSION_ACCEPTED
├─ platforms/
│  ├─ core/{types.ts, adapter.ts, registry.ts}
│  ├─ leetcode/{selectors,detector,submission,extractor,metadata,adapter}.ts
│  └─ gfg/{selectors,detector,submission,extractor,metadata,adapter}.ts
├─ github/{auth.ts, client.ts, commit.ts, repository.ts}
├─ sync/{state-machine.ts, sync-manager.ts, queue.ts, duplicate-detector.ts, retry-manager.ts}
├─ categorization/{categories.ts, mappings.ts, classifier.ts}
├─ readme/{parser.ts, statistics.ts, generator.ts, problem-readme.ts}
├─ languages/{index.ts, cpp.ts, java.ts, python.ts, javascript.ts}
├─ storage/{schema.ts, storage.ts}
├─ popup/{index.html, main.tsx, Popup.tsx, components/}
├─ options/{index.html, main.tsx, Options.tsx, components/}
└─ utils/{result.ts, logger.ts, sanitize.ts, paths.ts, markdown.ts}
```

**Layering rule (enforced by ESLint `no-restricted-imports`):** `github/*`, `sync/*`, `readme/*`,
`categorization/*` may **not** import `platforms/leetcode/*` or `platforms/gfg/*` — only normalized types.

---

## 5. Core Contracts — `platforms/core`

```typescript
// core/types.ts
export type Platform = "leetcode" | "gfg";
export type Difficulty = "Easy" | "Medium" | "Hard" | "Unknown";

export interface Solution { language: string; code: string; submittedAt: string; }

export interface ProblemMetadata {
  platform: Platform; problemId?: string; slug?: string;
  title: string; url: string; difficulty: Difficulty; topics: string[];
}

export interface SubmissionStatus { accepted: boolean; raw?: string; submissionId?: string; }

export interface Problem extends ProblemMetadata {
  primaryCategory: string;   // set by categorizer
  language: string;
  code: string;
  solvedAt: string;
}

export interface CodingPlatformAdapter {
  readonly platform: Platform;
  canHandle(url: string): boolean;
  isProblemPage(url: string): boolean;
  getProblemMetadata(): Promise<ProblemMetadata>;
  getSubmissionStatus(): Promise<SubmissionStatus>;
  getSubmittedSolution(): Promise<Solution>;
  /** Fires when the page reports an accepted submission. Returns an unsubscribe fn. */
  watchSubmissions(onAccepted: (submissionId?: string) => void): () => void;
}
```

```typescript
// core/registry.ts
import { CodingPlatformAdapter } from "./types";
import { LeetCodeAdapter } from "@/platforms/leetcode/adapter";
import { GFGAdapter } from "@/platforms/gfg/adapter";

const adapters: CodingPlatformAdapter[] = [new LeetCodeAdapter(), new GFGAdapter()];
export function resolveAdapter(url: string): CodingPlatformAdapter | null {
  return adapters.find((a) => a.canHandle(url)) ?? null;
}
```

```typescript
// utils/result.ts  — no throwing across worker/content boundary
export type FailureCode =
  | "SUBMISSION_FAILED" | "EXTRACTION_FAILED" | "AUTH_FAILED" | "GITHUB_FAILED"
  | "DUPLICATE" | "NETWORK_ERROR" | "RATE_LIMITED" | "UNKNOWN_ERROR";
export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; code: FailureCode; message: string; retryable: boolean };
export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const err = (code: FailureCode, message: string, retryable = false): Result<never> =>
  ({ ok: false, code, message, retryable });
```

---

## 6. Messaging Protocol — `background/messaging.ts`

```typescript
export type Msg =
  // content → SW
  | { t: "SUBMISSION_ACCEPTED"; problem: ProblemMetadata; solution: Solution }
  // popup → SW
  | { t: "AUTH_START" } | { t: "AUTH_STATUS" } | { t: "AUTH_DISCONNECT" }
  | { t: "REPO_LIST" } | { t: "REPO_CREATE"; name: string; description: string; private: boolean }
  | { t: "REPO_SELECT"; owner: string; repo: string; branch: string }
  | { t: "BRANCH_LIST"; owner: string; repo: string }
  | { t: "STATE_GET" } | { t: "RETRY_JOB"; id: string }
  // SW → popup (broadcast via chrome.runtime + storage change)
  | { t: "SYNC_PROGRESS"; state: SyncState; title: string }
  | { t: "AUTH_DEVICE_CODE"; userCode: string; verificationUri: string };

export type MsgResult = Result<unknown>;
// router: chrome.runtime.onMessage → switch(msg.t) → handler → sendResponse(Result)
```

Rule: content script **never** touches GitHub/auth — it only emits `SUBMISSION_ACCEPTED` (PRD §40).

---

## 7. Storage — `storage/schema.ts` + `storage.ts`

```typescript
// schema.ts
export interface Config {
  repoOwner?: string; repoName?: string; defaultBranch?: string;
  newRepoVisibility: "private" | "public";                 // default "private"
  autoSync: boolean;                                       // default true
  folderNaming: "id-title";                                // MVP fixed
  fileNaming: "solution" | "problem-name" | "main";        // default "solution"
  updateReadme: boolean; problemReadmes: boolean;          // default true
  duplicateHandling: "update" | "ignore" | "ask";          // default "update"
  notifications: boolean;                                  // default true
}
export interface SyncRecord {
  platform: Platform; problemId?: string; slug?: string; title: string; url: string;
  githubPath: string; commitSha?: string; difficulty: Difficulty;
  primaryCategory: string; topics: string[]; language: string;
  solvedAt: string; status: "success" | "failed" | "pending";
}
export interface SyncJob {
  id: string; problem: Problem; attempts: number; nextAttemptAt: number;
  lastError?: string; createdAt: string;
}
export interface StorageShape {
  auth?: { accessToken: string; scope: string; login: string; avatarUrl?: string; connectedAt: string };
  config: Config;
  syncIndex: Record<string, SyncRecord>;   // key = `${platform}:${problemId ?? slug}`  ← SOURCE OF TRUTH
  queue: SyncJob[];
  cache: { repos?: unknown; branches?: Record<string, string[]>; readmeSha?: string; rateLimit?: unknown; ts: number };
}
export const DEFAULT_CONFIG: Config = {
  newRepoVisibility: "private", autoSync: true, folderNaming: "id-title", fileNaming: "solution",
  updateReadme: true, problemReadmes: true, duplicateHandling: "update", notifications: true,
};
```

```typescript
// storage.ts — typed wrapper over chrome.storage.local
export async function get<K extends keyof StorageShape>(k: K): Promise<StorageShape[K]>;
export async function set<K extends keyof StorageShape>(k: K, v: StorageShape[K]): Promise<void>;
export async function patchConfig(p: Partial<Config>): Promise<Config>;
export function keyOf(p: { platform: Platform; problemId?: string; slug?: string }): string; // `lc:1` etc.
export async function upsertRecord(r: SyncRecord): Promise<void>;
export async function getRecord(key: string): Promise<SyncRecord | undefined>;
```

---

## 8. Content Scripts

```typescript
// content/page-interceptor.ts  (MAIN world, document_start)
// Wrap fetch + XHR; when a submission-check/compile response is seen, forward it.
(function () {
  const origFetch = window.fetch;
  window.fetch = async (...args) => {
    const res = await origFetch(...args);
    try {
      const url = typeof args[0] === "string" ? args[0] : (args[0] as Request).url;
      if (/\/submissions\/detail\/\d+\/check\/|\/graphql|geeksforgeeks\.org\/.*submit/i.test(url)) {
        res.clone().json().then((body) =>
          window.postMessage({ source: "DSAHUB_INTERCEPT", url, body }, "*")
        ).catch(() => {});
      }
    } catch {}
    return res;
  };
  // (repeat equivalent monkey-patch for XMLHttpRequest.open/send)
})();
```

```typescript
// content/content.ts  (ISOLATED, document_idle)
import { resolveAdapter } from "@/platforms/core/registry";
const adapter = resolveAdapter(location.href);
if (adapter?.isProblemPage(location.href)) {
  const stop = adapter.watchSubmissions(async () => {
    const status = await adapter.getSubmissionStatus();
    if (!status.accepted) return;                       // PRD §14: accepted only
    const [meta, sol] = await Promise.all([adapter.getProblemMetadata(), adapter.getSubmittedSolution()]);
    chrome.runtime.sendMessage({ t: "SUBMISSION_ACCEPTED", problem: meta, solution: sol });
  });
  window.addEventListener("beforeunload", stop);
}
// Adapters read interceptor data via a shared bus that listens for window.postMessage("DSAHUB_INTERCEPT").
```

---

## 9. LeetCode Adapter — `platforms/leetcode`

```typescript
// leetcode/selectors.ts   // VERIFY all against live DOM (M2) + capture fixtures
export const LC = {
  host: "leetcode.com",
  problemPath: /^\/problems\/[^/]+/,
  submitButton: '[data-e2e-locator="console-submit-button"]',  // VERIFY
  resultBanner: '[data-e2e-locator="submission-result"]',      // VERIFY (text ~ "Accepted")
  api: {
    check: /\/submissions\/detail\/(\d+)\/check\/$/,           // JSON: { state, status_msg, lang, code? }
    graphql: "https://leetcode.com/graphql",
  },
  editorGlobal: "monaco",                                       // monaco.editor.getModels()[0].getValue()
} as const;
```

```typescript
// leetcode/metadata.ts — prefer GraphQL over DOM
const QUESTION_QUERY = `query q($slug:String!){question(titleSlug:$slug){
  questionId questionFrontendId title titleSlug difficulty topicTags{name}}}`;
export async function getMetadata(): Promise<ProblemMetadata> {
  const slug = location.pathname.split("/")[2];
  const r = await fetch(LC.api.graphql, { method: "POST", headers: {"content-type":"application/json"},
    body: JSON.stringify({ query: QUESTION_QUERY, variables: { slug } }) }).then(x=>x.json());
  const q = r.data.question;
  return { platform: "leetcode", problemId: q.questionFrontendId, slug: q.titleSlug,
    title: q.title, url: `https://leetcode.com/problems/${q.titleSlug}/`,
    difficulty: mapDifficulty(q.difficulty), topics: q.topicTags.map((t:any)=>t.name) };
}
```

```typescript
// leetcode/submission.ts — accepted detection
// Primary: interceptor payload from /submissions/detail/{id}/check/ → body.status_msg === "Accepted"
// Fallback: MutationObserver on LC.resultBanner text.
export function isAccepted(interceptBody: any): boolean { return interceptBody?.status_msg === "Accepted"; }

// leetcode/extractor.ts — submitted code
// Priority: intercept body.code / typed_code → monaco model value → DOM textarea.
```

```typescript
// leetcode/adapter.ts
export class LeetCodeAdapter implements CodingPlatformAdapter {
  readonly platform = "leetcode" as const;
  canHandle(u: string) { return new URL(u).host === LC.host; }
  isProblemPage(u: string) { return LC.problemPath.test(new URL(u).pathname); }
  getProblemMetadata() { return getMetadata(); }
  getSubmissionStatus() { /* read last intercept or banner */ }
  getSubmittedSolution() { /* extractor chain */ }
  watchSubmissions(cb) { /* bus.on("DSAHUB_INTERCEPT", check) + MutationObserver fallback; return off */ }
}
```

Difficulty map (`metadata.ts`): `Easy|Medium|Hard` pass-through, anything else → `"Unknown"` (PRD §30, never invent).

---

## 10. GFG Adapter — `platforms/gfg`  (higher uncertainty → fixtures-first in M3)

```typescript
// gfg/selectors.ts   // VERIFY — capture from live www.geeksforgeeks.org/problems/<slug>/1
export const GFG = {
  host: "www.geeksforgeeks.org",
  problemPath: /^\/problems\//,
  submitButton: "button.problems_submit_button",             // VERIFY
  resultBanner: ".problems_content .result",                 // VERIFY (~ "Correct"/"Problem Solved")
  api: { submitLike: /geeksforgeeks\.org\/.*(submit|run)/i }, // VERIFY compile/submit endpoint
  editor: "ace",                                             // ace.edit(el).getValue()  // VERIFY (could be CodeMirror)
} as const;
```

- **id/slug:** GFG lacks a stable numeric id → use the URL slug as `slug`; folder name = sanitized slug (PRD §23).
- **metadata:** title from header, difficulty label, tags from the sidebar — via centralized selectors; missing fields degrade gracefully (PRD §18).
- **accepted:** interceptor payload from the submit endpoint (verdict field) → DOM banner fallback.
- **adapter.ts:** same shape/class as LeetCode; **zero shared platform code** — only the `core` interface.

---

## 11. GitHub Layer — `github/`

```typescript
// github/auth.ts — Device Flow (runs in SW; polling scheduled via chrome.alarms)
const CLIENT_ID = "<DSAHUB_OAUTH_APP_CLIENT_ID>";  // public; safe to embed
const H = { Accept: "application/json", "Content-Type": "application/json" };

export async function startDeviceFlow(): Promise<{ userCode: string; verificationUri: string; deviceCode: string; interval: number }> {
  const r = await fetch("https://github.com/login/device/code",
    { method: "POST", headers: H, body: JSON.stringify({ client_id: CLIENT_ID, scope: "repo" }) }).then(x=>x.json());
  return { userCode: r.user_code, verificationUri: r.verification_uri, deviceCode: r.device_code, interval: r.interval };
}

export async function pollOnce(deviceCode: string): Promise<Result<string>> {
  const r = await fetch("https://github.com/login/oauth/access_token", { method: "POST", headers: H,
    body: JSON.stringify({ client_id: CLIENT_ID, device_code: deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code" }) }).then(x=>x.json());
  if (r.access_token) return ok(r.access_token);
  if (r.error === "authorization_pending" || r.error === "slow_down") return err("NETWORK_ERROR","pending",true);
  return err("AUTH_FAILED", r.error_description ?? "Device authorization failed");
}
// Driver: on AUTH_START → startDeviceFlow → broadcast AUTH_DEVICE_CODE → chrome.alarms every `interval`s
// calls pollOnce; on success store auth + getUser(); on expired_token restart flow.
```

```typescript
// github/client.ts — the ONLY place raw GitHub calls live (PRD §34)
export class GitHubClient {
  constructor(private token: string) {}
  private async gh(path: string, init: RequestInit = {}) {
    const res = await fetch(`https://api.github.com${path}`, { ...init,
      headers: { Authorization: `Bearer ${this.token}`, Accept: "application/vnd.github+json",
                 "X-GitHub-Api-Version": "2022-11-28", ...(init.headers ?? {}) } });
    if (res.status === 401) throw errObj("AUTH_FAILED", "GitHub session expired");
    if (res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0")
      throw errObj("RATE_LIMITED", "GitHub API rate limit reached", true);
    if (!res.ok && res.status >= 500) throw errObj("GITHUB_FAILED", `GitHub ${res.status}`, true);
    return res;
  }
  getUser(): Promise<{ login: string; avatar_url: string }>;
  getRepositories(): Promise<Repo[]>;                                  // cache in storage.cache.repos
  createRepository(name: string, description: string, priv: boolean): Promise<Repo>;
  getRepository(owner: string, repo: string): Promise<Repo>;
  getBranches(owner: string, repo: string): Promise<string[]>;        // default-branch fallback (PRD §12)
  getFile(owner: string, repo: string, path: string, ref: string): Promise<{ sha: string; content: string } | null>;
  // Git Data primitives used by commit.ts:
  getRef(o,r,ref): Promise<{ object:{ sha:string } }>;
  getCommit(o,r,sha): Promise<{ tree:{ sha:string } }>;
  createBlob(o,r,content,encoding:"base64"): Promise<{ sha:string }>;
  createTree(o,r,baseTree,items): Promise<{ sha:string }>;
  createCommit(o,r,message,tree,parents:string[]): Promise<{ sha:string }>;
  updateRef(o,r,ref,sha): Promise<void>;   // 409 → caller refetches + retries
}
```

```typescript
// github/commit.ts — ONE problem = ONE atomic commit (PRD §45/§46)
export async function commitFiles(c: GitHubClient, o: string, r: string, branch: string,
  message: string, files: { path: string; content: string }[]): Promise<string> {
  const ref = await c.getRef(o, r, `heads/${branch}`);
  const base = await c.getCommit(o, r, ref.object.sha);
  const blobs = await Promise.all(files.map(f => c.createBlob(o, r, btoa(unescape(encodeURIComponent(f.content))), "base64")));
  const tree = await c.createTree(o, r, base.tree.sha,
    files.map((f, i) => ({ path: f.path, mode: "100644", type: "blob", sha: blobs[i].sha })));
  const commit = await c.createCommit(o, r, message, tree.sha, [ref.object.sha]);
  await c.updateRef(o, r, `heads/${branch}`, commit.sha);   // wrap in retry: on 409 re-run whole fn
  return commit.sha;
}
```

`repository.ts`: resolve `{owner,repo,branch}` from config; if `main` absent use repo default branch; cache branches.

---

## 12. Categorization — `categorization/`

```typescript
// categories.ts — canonical top-level categories (PRD §19)
export const CATEGORIES = ["Arrays","Strings","Linked List","Stack","Queue","Hashing","Sorting",
  "Binary Search","Two Pointers","Sliding Window","Recursion","Backtracking","Trees","Binary Trees",
  "Binary Search Tree","Heap","Priority Queue","Graphs","Greedy","Dynamic Programming","Trie",
  "Bit Manipulation","Math","Matrix","Miscellaneous"] as const;
export const FALLBACK = "Miscellaneous";

// mappings.ts — platform tag → canonical primary category (sample; extend from fixtures)
export const TAG_TO_CATEGORY: Record<string,string> = {
  "Array":"Arrays","Hash Table":"Hashing","Dynamic Programming":"Dynamic Programming",
  "Sliding Window":"Sliding Window","Two Pointers":"Two Pointers","Tree":"Trees",
  "Binary Search Tree":"Binary Search Tree","Depth-First Search":"Graphs","Graph":"Graphs",
  "Greedy":"Greedy","Backtracking":"Backtracking","Trie":"Trie","Bit Manipulation":"Bit Manipulation",
  "Math":"Math","Matrix":"Matrix","String":"Strings","Linked List":"Linked List",
  "Stack":"Stack","Queue":"Queue","Heap (Priority Queue)":"Heap","Sorting":"Sorting","Binary Search":"Binary Search",
};

// classifier.ts (PRD §20)
export function classify(topics: string[]): { primaryCategory: string; tags: string[] } {
  for (const t of topics) if (TAG_TO_CATEGORY[t]) return { primaryCategory: TAG_TO_CATEGORY[t], tags: topics };
  // (local keyword rules on title could refine here — still deterministic, no AI)
  return { primaryCategory: FALLBACK, tags: topics };
}
```

Priority order = first matching platform tag → (future) local rules → `Miscellaneous`. Pure + unit-tested.

---

## 13. Languages — `languages/`

```typescript
// index.ts
export interface LangDef { canonical: string; ext: string; aliases: string[]; }
export const LANGS: LangDef[] = [
  { canonical: "C++",        ext: "cpp", aliases: ["cpp","c++","g++","cpp17","cpp20"] },
  { canonical: "Java",       ext: "java", aliases: ["java","java8"] },
  { canonical: "Python",     ext: "py",  aliases: ["python","python3","py","py3"] },
  { canonical: "JavaScript", ext: "js",  aliases: ["javascript","js","node","nodejs"] },
];
export function resolveLang(raw: string): LangDef {
  const k = raw.trim().toLowerCase();
  return LANGS.find(l => l.aliases.includes(k) || l.canonical.toLowerCase() === k)
      ?? { canonical: raw, ext: "txt", aliases: [] };   // unknown → keep raw, .txt
}
```

---

## 14. README Engine — `readme/`

```typescript
// parser.ts — managed-section splice (PRD §27); never touch outside markers
export const START = "<!-- DSAHUB:START -->", END = "<!-- DSAHUB:END -->";
export function hasMarkers(md: string) { const s = md.indexOf(START), e = md.indexOf(END); return s !== -1 && e > s; }
export function replaceManaged(md: string, generated: string): string | null {
  const s = md.indexOf(START), e = md.indexOf(END);
  if (s === -1 || e === -1 || e < s) return null;   // caller offers "Add DSAHub Section"
  return md.slice(0, s + START.length) + "\n\n" + generated + "\n\n" + md.slice(e);
}

// statistics.ts — computed from storage.syncIndex (source of truth), PRD §28
export function computeStats(records: SyncRecord[]): {
  byPlatform: Record<Platform, number>; total: number;
  byDifficulty: Record<Difficulty, number>;
  byTopic: Record<string, number>; byLanguage: Record<string, number>;
};

// generator.ts — progress + difficulty + topic + language tables + per-platform index (PRD §26/§29)
export function generateManagedSection(records: SyncRecord[]): string;  // markdown, escaped (utils/markdown.ts)

// problem-readme.ts — deterministic per-problem README (PRD §25)
export function problemReadme(r: SyncRecord, filename: string): string;
```

README updates are folded into the same atomic commit as the solution (via `commit.ts`), keeping "one problem = one commit."

---

## 15. Sync Engine — `sync/`

```typescript
// state-machine.ts (PRD §15)
export type SyncState = "IDLE"|"SUBMISSION_DETECTED"|"CHECKING_RESULT"|"ACCEPTED"|"EXTRACTING"
  |"CLASSIFYING"|"CHECKING_DUPLICATE"|"SYNCING"|"UPDATING_README"|"COMPLETE";
export type FailState = FailureCode;   // reuse Result codes
export const NEXT: Record<SyncState, SyncState> = {
  IDLE:"SUBMISSION_DETECTED", SUBMISSION_DETECTED:"CHECKING_RESULT", CHECKING_RESULT:"ACCEPTED",
  ACCEPTED:"EXTRACTING", EXTRACTING:"CLASSIFYING", CLASSIFYING:"CHECKING_DUPLICATE",
  CHECKING_DUPLICATE:"SYNCING", SYNCING:"UPDATING_README", UPDATING_README:"COMPLETE", COMPLETE:"COMPLETE",
};

// duplicate-detector.ts (PRD §32) — platform-aware identity
export async function findDuplicate(p: Problem): Promise<SyncRecord | null> {
  const rec = await getRecord(keyOf(p));         // 1) local index
  if (rec) return rec;
  // 2) optional: HEAD check existing GitHub path before committing
  return null;
}

// sync-manager.ts — the pipeline (runs in SW, single-flight via queue)
export async function runSync(problem: Problem): Promise<Result<SyncRecord>> {
  // ACCEPTED → classify → dup check (respect config.duplicateHandling: update|ignore|ask)
  // → build files [solution.<ext>, README.md?, main README.md] → commitFiles() → upsertRecord()
  // → notify. On any failure return err(code,msg,retryable); NEVER report success on partial (PRD §45).
}
```

```typescript
// queue.ts — persistent, single-flight; survives SW restart (stored in storage.queue)
export async function enqueue(problem: Problem): Promise<void>;
export async function processNext(): Promise<void>;   // pop → runSync → on retryable err reschedule

// retry-manager.ts (PRD §44) — max 3, exponential backoff via chrome.alarms
export function backoffMs(attempt: number) { return Math.min(60_000, 1000 * 2 ** attempt); }
// alarms.ts: "dsahub-retry-sweep" every 1 min → process jobs whose nextAttemptAt <= now
//            "dsahub-online-sweep" on reconnect → flush queue
```

---

## 16. Utils

```typescript
// sanitize.ts (PRD §23) — filesystem-safe titles/slugs
export function sanitizeTitle(t: string, max = 80): string {
  return t.replace(/[\/\\:?*<>|"]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, max).replace(/^-|-$/g, "");
}
export function padId(id?: string): string { return id ? id.padStart(4, "0") : ""; }

// paths.ts — GitHub path builder (validated)
export function folderName(p: Problem): string {
  const t = sanitizeTitle(p.title);
  return p.problemId ? `${padId(p.problemId)}-${t}` : sanitizeTitle(p.slug ?? t);
}
export function solutionPath(p: Problem, ext: string, base = "solution"): string {
  return `${p.primaryCategory}/${folderName(p)}/${base}.${ext}`;   // e.g. Arrays/0001-Two-Sum/solution.cpp
}

// logger.ts — token-redacting (Rule 13); markdown.ts — escape table cells / links.
```

---

## 17. Milestone → File → Task → Test (build order per PRD §62)

Each milestone gate (Rule 16): `npm test` + `npm run lint` + `npm run build` green, manual verify, report.

### M0 — Tooling
| File | Task |
|---|---|
| `package.json`, `tsconfig.json`, `vite.config.ts`, `.eslintrc`, `tailwind.config` | project init |
| `.github/workflows/ci.yml` | test + lint + build on push |
| `utils/result.ts`, `utils/logger.ts` | Result + redacting logger |
**Exit:** empty extension loads unpacked; CI green.

### M1 — Foundation & Interfaces (PRD M1)
| File | Task | Test |
|---|---|---|
| `manifest.json` | §3 | manual load |
| `background/{service-worker,messaging}.ts` | router skeleton | message round-trip |
| `storage/{schema,storage}.ts` | typed wrapper + defaults | get/set/keyOf |
| `platforms/core/{types,adapter,registry}.ts` | freeze interfaces | registry resolves by URL |
| `languages/*` | registry | resolveLang aliases |
| `popup/*`, `options/*` | React skeletons | renders |
**Exit:** popup opens; content logs detected platform on LC/GFG.

### M2 — LeetCode (PRD M2)
| File | Task | Test (fixtures) |
|---|---|---|
| `leetcode/selectors.ts` | centralize + VERIFY | — |
| `content/page-interceptor.ts` | fetch/XHR patch | intercept unit |
| `leetcode/{detector,submission,extractor,metadata,adapter}.ts` | full adapter | metadata parse, accepted vs each failure, extraction, difficulty map |
**Exit:** real LC accept → correct normalized `Problem` (logged).

### M3 — GFG (PRD M3)
| File | Task | Test |
|---|---|---|
| `gfg/selectors.ts` | VERIFY on live + fixtures | — |
| `gfg/{detector,submission,extractor,metadata,adapter}.ts` | full adapter, slug id | GFG metadata/accepted/extraction, slug sanitize |
**Exit:** GFG accept → normalized `Problem`; both adapters satisfy identical interface.

### M4 — GitHub (PRD M4)
| File | Task | Test (mock api.github.com) |
|---|---|---|
| `github/auth.ts` | device flow + alarm poll | pending/success/expired paths |
| `github/client.ts` | all methods + error mapping | 200/401/403-rate/404/409 |
| `github/commit.ts` | atomic Git Data commit | blob→tree→commit→ref |
| `github/repository.ts` | resolve repo/branch, default fallback | branch fallback |
| onboarding UI (popup) | connect→repo→branch→done | E2E |
**Exit:** fresh install → device connect → create/select private repo → a hand-built commit lands.

### M5 — Sync Engine (PRD M5)
| File | Task | Test |
|---|---|---|
| `sync/sync-manager.ts` | full pipeline + `drainQueue` | integration w/ fake GitHub |
| `sync/queue.ts` | durable single-flight queue + backoff | survives SW restart, exhausts at 3 |
| `background/service-worker.ts` | wire `SUBMISSION_ACCEPTED`, retry alarm | — |
**Exit:** Acceptance Test 1,2 (LC+GFG land solution); Test 3 (failed never sync).

Cut from this milestone: `sync/state-machine.ts` — PRD §15's states are a straight line
with no branch except failure, so the pipeline *is* the sequence of awaits and a
transition table would only describe the same order twice. `sync/duplicate-detector.ts` —
the decision is two conditions on the sync index, and it lives where the index is
written. Backoff went into `queue.ts` rather than a retry manager of its own: "when
should this run again" is a property of the queued job.

### M6 — Repo Organization (PRD M6)
| File | Task | Test |
|---|---|---|
| `categorization/*` | full pipeline | category chain + fallback |
| `utils/{sanitize,paths}.ts` | folder/file naming | edge cases, max length |
| `readme/problem-readme.ts` | per-problem README | snapshot LC/GFG |
**Exit:** Acceptance Test 4,6,9 pass.

### M7 — README Engine (PRD M7)
| File | Task | Test |
|---|---|---|
| `readme/parser.ts` | marker splice, add-section | preserves user content (Test 7) |
| `readme/statistics.ts` | stats from index | math |
| `readme/generator.ts` | dashboard tables + index | idempotent regen, md escape |
**Exit:** Acceptance Test 5,7 pass.

### M8 — Reliability (PRD M8) — shipped
| File | Task | Test |
|---|---|---|
| `background/notify.ts` | OS notifications: synced / queued / failed / re-solve question | wording (Rule 14), `notifications: false` creates nothing, id routing |
| `background/service-worker.ts` | `autoSync` gate, `"ask"` park, branch cache, `SYNC_NOW`, `RESOLVE_CHOICE`, notification buttons | `service-worker.test.ts` — 34 tests through the real listeners |
| `sync/queue.ts` | `parkForChoice` / `releaseJob`; `dueJobs` skips parked | park survives, sweep cannot answer the question |
| `sync/sync-manager.ts` | `isAlreadySynced`, `markPending`, `reason` on records | pending vs failed, never downgrades a success |
| `popup/{Dashboard,Settings,summary}.tsx` | PRD §41–43 dashboard + §40 settings | `summary.test.ts` — counts, ordering, parked-first |
| `manifest.json` + `public/icon-128.png` | `notifications` permission and the icon it requires | build |
**Exit:** Acceptance Test 8 and 10 pass in `service-worker.test.ts`; 394 tests green.

Backoff, the durable queue and the retry alarm shipped in M5, so `sync/retry-manager.ts`
and `background/alarms.ts` are not needed.

Cut from this milestone:
- **PRD §42's seven-step progress feed.** It has no viewer — the popup is shut while a
  sync runs and the whole operation finishes inside 5 s (PRD §55). The outcome is what
  reaches the user, through a notification and the dashboard.
- **An error-catalog module.** `describeFailure` in `client.ts` already maps every status
  onto a code, a retry decision and a sentence; a second table would restate it and drift.
- **Repository/branch caching on the sync path.** There was nothing to cache:
  `resolveTarget` answers from `config.branch`, so a sync spends zero requests on
  repository metadata. The cache is the popup's branch list only (2 requests, 10 min TTL).
- **A separate options page.** A second HTML entry point and React root for ten fields,
  when §41's mock already has a `[Settings]` button. Settings live in the popup.
- **"Folder Naming" from §40's settings list.** PRD §22/§23 fix the layout, so the
  dropdown would have one option.
- **"Current platform" from §40's popup list.** Reading the active tab's URL needs the
  `tabs` permission, and PRD §52 forbids a permission that current functionality does not
  require. The footer names the platforms DSAHub watches instead.
- **`readmeSha`.** `commitFiles` reads the README immediately before writing it, so a
  stored sha would only be a second, staler copy of the same fact.

### M9 — Production (PRD M9) — shipped
| File | Task | Check |
|---|---|---|
| `scripts/make-icons.mjs` + `public/icon-{16,48,128}.png` | the artwork, rendered per size rather than downscaled | `npm run icons` |
| `manifest.json` | `icons` field | in the built manifest |
| `vite.config.ts` | sourcemaps off — crxjs puts content-script chunks in `web_accessible_resources`, and `.map` siblings went with them | 255 kB package, no maps |
| `scripts/validate-dist.mjs` | MV3 validation as a postbuild step: manifest version, referenced files present, exact permission set, no sourcemap, nothing token-shaped | `npm run build` fails on any of them |
| `docs/PRIVACY.md` | PRD §51 — every stored field and every network destination, by name | — |
| `docs/STORE-LISTING.md` | listing copy, per-permission justifications, data-use answers, images still to capture | short description measured at 131/132 |
| `README.md` | the repo had none: install, scripts, architecture, DoD, permissions | — |
| `package.json` | `engines.node >= 22.13`, so the toolchain's floor is a warning rather than a native-binding error | — |
**Exit:** store package validated by `npm run build`; DoD (PRD §63) is the three live passes,
recorded in the README.

Cut from this milestone:
- **A separate DoD checklist document.** PRD §63's path is exactly the three VERIFY docs in
  order, so a fourth file would be a copy that drifts. The README names the sequence and
  links them.
- **A separate permission-justification document.** The store form asks for one string per
  permission; a file holding exactly those strings, next to the listing copy that is
  submitted with them, is one file, not two.
- **A licence.** Not in the PRD, and choosing one is the repository owner's call.
- **The 32px icon.** Chrome documents needing 16, 48 and 128. A fourth size is a fourth
  thing to keep consistent.
- **Screenshots and the promo tile.** They need a browser and a real synced repository, so
  they cannot come out of a build. `STORE-LISTING.md` lists all six with what each must
  show — the only outstanding item in the milestone.

---

## 18. Testing — as built

**394 tests across 26 files**, all Vitest. `npm test`.

- **Unit (jsdom):** detection, verdict interpretation, metadata, categorization,
  sanitize/paths, README gen+parse, dedupe, stats, difficulty/language maps.
- **Fixtures:** `tests/fixtures/{leetcode,gfg}/` — recorded DOM HTML and submission JSON.
  Adapters are tested against these, never live sites.
- **Integration:** `accepted → normalized → categorized → commit → README` against an
  in-memory GitHub (`sync-manager.test.ts`), and the GitHub client against a scripted
  `fetch`.
- **The service worker:** `service-worker.test.ts` drives the real message, alarm and
  notification listeners against a `fetch`-level fake GitHub, which is where request
  *counts* become assertable. Acceptance Tests 8 and 10 live here.
- **Manual QA:** `docs/VERIFY-{github,leetcode,gfg}.md`. The 10 acceptance tests (PRD §54)
  are covered by the suite except where they need a live site or a real token, which is
  exactly what those documents are for.

**Playwright E2E: planned, not built.** It was going to drive onboarding and sync against a
mock `api.github.com` and fixture pages. Every case it listed — public/private repo,
multi-language, failure, duplicate, re-solve, network failure, rate limit, expired auth — is
covered by `service-worker.test.ts` and `sync-manager.test.ts` at a fraction of the cost,
because the worker's listeners can be called directly. What Playwright would add over those
is a real Chrome loading a real `dist/` — and that overlaps with what a human has to do in
the VERIFY passes anyway, since neither Playwright nor a unit test can tell you LeetCode
changed its DOM. Revisit it if the VERIFY passes start finding regressions that the suite
should have caught.

**CI: not set up.** `.github/workflows/ci.yml` needs a git repository, and this is not one
yet. The gate to encode when it becomes one is what every milestone ran:
`npm run typecheck && npm run lint && npm test && npm run build`.

---

## 19. Cross-Cutting

**Permission justification (PRD §36):** the submitted wording is
[docs/STORE-LISTING.md](docs/STORE-LISTING.md#permission-justifications), the user-facing
version is [docs/PRIVACY.md](docs/PRIVACY.md), and `scripts/validate-dist.mjs` fails the
build if the built manifest asks for anything outside that set. Four copies of the same table
would be three too many; this section is the pointer.

**Security (PRD §37/§50):** token never logged/committed/sent elsewhere; sanitize extracted content; escape markdown; validate paths + API responses; HTTPS only; `repo` scope documented (needed for private default; `public_repo` if public-only).

**Errors (PRD §49):** every failure → `{code, human message, recovery action}` (Connect / Choose Repo / Retry / Update / queued). Implemented in `describeFailure` in
`src/github/client.ts` — one table, rather than the separate error-catalog module M8
planned, because that is where the status code arrives.

---

## 20. Risks · Open Questions · DoD

**Risks/mitigations:** UI drift → interceptor-primary + centralized selectors; GFG unknowns → fixtures-first spike in M3; SW termination → persist + alarms; README races → single-flight queue + 409 refetch; partial writes → atomic Git Data commit; rate limits → cache + backoff; token at rest → disclosed, Disconnect wipes.

**Open questions / assumptions:** (1) developer registers the OAuth App (Device Flow on) and embeds its public `client_id`; (2) MVP = `leetcode.com` + `www.geeksforgeeks.org/problems/*` only; (3) `repo` scope accepted for private-repo default; (4) editor internals are fallback only; (5) `GitHubClient` may be built alongside M2/M3 with a temporary PAT dev-shim to unblock sync tests — optional, doesn't change PRD order.

**Definition of Done (PRD §63):** install → device-flow connect → select/create repo → solve+submit on LC **or** GFG → on Accepted, DSAHub detects platform, extracts solution+metadata, categorizes, dedupes, commits files, updates managed README+stats, shows success — no manual copy/organize/commit, user README content untouched.

**Status.** Every step of that path is built and tested. Walking it in a real browser is the
one thing left, and it cannot be done from here: it needs Chrome, a GitHub OAuth app with
Device Flow enabled, and LeetCode and GeeksforGeeks accounts. The three `docs/VERIFY-*.md`
passes are that walk, in order, each ending in a block to record what was seen. Store
screenshots come out of the same session (`docs/STORE-LISTING.md`).

Two things those passes are for beyond ticking the DoD: confirming the recorded fixtures
still match what the sites send, and the list at the end of each file of code to **delete**
if the live behaviour turns out not to need it.
