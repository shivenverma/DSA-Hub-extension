# DSAHub

A Chrome extension that commits your accepted LeetCode and GeeksforGeeks solutions to your
own GitHub repository, and keeps a README of them current.

Solve a problem. When the verdict is Accepted, DSAHub files the solution under the problem's
topic, writes a short README beside it, updates a statistics table and problem index in the
repository's main README, and pushes all three as **one** commit. You do nothing.

```text
LeetCode / GeeksforGeeks  →  DSAHub (your browser)  →  your GitHub repository
```

There is no DSAHub server. Nothing goes anywhere else — see [PRIVACY.md](docs/PRIVACY.md).

## What lands in the repository

```text
dsa-solutions/
├── README.md                       ← statistics + problem index, between two markers
├── Arrays/
│   └── 0001-Two-Sum/
│       ├── README.md               ← difficulty, topics, link back to the problem
│       └── solution.cpp
└── Dynamic-Programming/
    └── kadanes-algorithm/
        └── solution.java           ← GFG has no stable numeric id, so the slug is the name
```

Your own prose in the main README is left alone; DSAHub only rewrites what is between its
markers.

## Install from source

Requires **Node 22.13+** (Vite 8 and Vitest 4 refuse to start below it) and Chrome 116+.

```bash
npm install
```

DSAHub signs in with GitHub's **device flow**, which needs no client secret and no backend —
but it does need a public OAuth client ID, and you supply your own:

1. <https://github.com/settings/developers> → **OAuth Apps** → **New OAuth App**. The
   homepage and callback URLs are never used; put anything in them.
2. On the app's page, tick **Enable Device Flow** and update. Skipping this is the failure
   that looks like a bug: GitHub's device endpoint answers `404`.
3. Copy the **Client ID**. Do not generate a client secret.

```bash
cp .env.example .env.local
```

Put the ID in `.env.local` as `VITE_GITHUB_CLIENT_ID=…`, then:

```bash
npm run build
```

Load it: `chrome://extensions` → Developer mode → **Load unpacked** → `dist/`.

If the build ends with `warning: no VITE_GITHUB_CLIENT_ID …`, Vite inlined an empty string
— `.env.local` was written after the build, or the variable is missing its `VITE_` prefix.
The popup says the same thing when you click **Connect GitHub**.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run build` | Typechecks, builds `dist/`, then validates the package (MV3, referenced files, permission set, no sourcemaps, nothing token-shaped) |
| `npm test` | The full unit suite |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint, type-aware |
| `npm run format` | Prettier |
| `npm run icons` | Regenerates `public/icon-{16,48,128}.png` from `scripts/make-icons.mjs` |
| `npm run dev` | Vite dev server with extension HMR |

## How it is put together

```text
src/
├── content/            page-interceptor (MAIN world) wraps fetch/XHR to see the verdict;
│                       content.ts (isolated) normalizes it and messages the worker
├── platforms/          per-platform: selectors, verdict interpretation, metadata, code
├── categorization/     topic → folder
├── github/             device-flow auth, REST client, single-commit builder, repo setup
├── readme/             generation and marker-preserving parsing, statistics
├── sync/               the sync itself, and the durable retry queue
├── background/         service worker: orchestration, alarms, notifications
├── popup/              dashboard and settings
└── storage/            the whole chrome.storage.local schema, in one file
```

The token is read in the service worker and nowhere else. The popup talks to the worker; the
content scripts never see it.

Two design notes that explain most of the code:

- **One commit per problem.** The solution, its README and the dashboard go into a single
  tree, so the README can never advertise a solution that is not in the repository.
- **An accepted submission cannot be re-read.** By the time a sync fails the user has left
  the page, so anything worth retrying is written to a durable queue — with the code — before
  the failure is reported.

## Tests

```bash
npm test
```

394 unit tests across 26 files: platform detection and verdict interpretation against
recorded fixtures, categorization, path and filename sanitization, README generation and
marker-preserving parsing, statistics, deduplication, the GitHub client against a scripted
`fetch`, the sync pipeline against an in-memory GitHub, and the service worker driven through
its real message, alarm and notification listeners.

Two of PRD §57's acceptance tests are only checkable end to end — offline-then-recovered
(8) and a repository or branch changed mid-life (10) — and both run in
`tests/unit/service-worker.test.ts`.

What tests cannot cover is whether LeetCode and GeeksforGeeks still respond the way the
fixtures were recorded, and whether a real token can push. Those are the live passes:

- [docs/VERIFY-github.md](docs/VERIFY-github.md) — connect, commit, sync, queue, retry,
  notifications, dashboard
- [docs/VERIFY-leetcode.md](docs/VERIFY-leetcode.md) — detection on LeetCode
- [docs/VERIFY-gfg.md](docs/VERIFY-gfg.md) — detection on GeeksforGeeks

Each ends with a block to record what you saw, and a list of code to **delete** if the live
behaviour turns out not to need it.

## Definition of done

PRD §63 is one path, and it is the three live passes in order. A release is done when, on a
clean profile:

install → connect GitHub → create or select a repository → solve a problem on LeetCode or
GeeksforGeeks → get Accepted → the solution, its README and an updated dashboard appear in
one commit, and the popup says so.

Run [VERIFY-leetcode.md](docs/VERIFY-leetcode.md) or [VERIFY-gfg.md](docs/VERIFY-gfg.md)
first — if detection does not fire, nothing after it happens — then
[VERIFY-github.md](docs/VERIFY-github.md) parts one to three. The credential checks at the
end of that file are not optional; they are how PRD Rule 13 is verified rather than assumed.

## Publishing

[docs/STORE-LISTING.md](docs/STORE-LISTING.md) holds the listing copy, the per-permission
justifications, the data-use answers, and the screenshots still to capture.

## Permissions, and why each one

| Permission | Why |
| --- | --- |
| `storage` | Settings, chosen repository, sync history, the OAuth token, and any submission not yet pushed — all local |
| `alarms` | Polling GitHub while you authorize, and retrying a queued sync. An MV3 worker is evicted after 30 s, so a timer would not survive either |
| `notifications` | Telling you the outcome after you have navigated away from the results page. Switchable off in Settings |
| `github.com`, `api.github.com` | Signing in, and committing |
| Content scripts on `leetcode.com`, `geeksforgeeks.org/problems` | Reading the verdict and the code you submitted |

No `<all_urls>`, no `tabs`, no `identity`. The reference is
[docs/PRIVACY.md](docs/PRIVACY.md); the code is `manifest.json`, and
`scripts/validate-dist.mjs` fails the build if the built package asks for anything else.

## Documents

- [DSAHub — Product Requirements Document (PRD).md](DSAHub%20—%20Product%20Requirements%20Document%20(PRD).md)
  — the spec. Section numbers referenced throughout the source.
- [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) — the milestones, and what was cut from
  each one and why.
