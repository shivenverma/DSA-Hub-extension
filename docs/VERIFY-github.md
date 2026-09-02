# Live verification — GitHub connection and sync (M4, M5, M8)

The 56 unit tests in `tests/unit/github-{client,auth,repository}.test.ts` drive a
scripted `fetch`. They prove DSAHub sends the right requests in the right order and
reacts correctly to each documented reply. They cannot prove GitHub still replies that
way, and they cannot prove a token minted by a real OAuth app can actually push. This
pass closes that gap, and it is the M4 exit criterion:

> fresh install → device connect → create/select private repo → a hand-built commit lands

[Part two](#part-two--syncing-a-real-solution-m5) continues into M5, where an accepted
submission becomes a commit, and
[part three](#part-three--notifications-the-dashboard-and-the-re-solve-question-m8) into
M8's notifications and dashboard. Do them in order: each one assumes the state the previous
one left behind.

## One-time setup: the OAuth app

DSAHub has no client secret and no backend (PRD §38), so it uses the **Device Flow**.
That has to be turned on explicitly:

1. <https://github.com/settings/developers> → **OAuth Apps** → **New OAuth App**
2. Application name: anything. Homepage URL: anything (it is never used).
   Authorization callback URL: anything — the device flow never redirects, but the
   field is required.
3. Register, then on the app's page tick **Enable Device Flow** and **Update
   application**. Skipping this is the failure mode that looks like a bug: the device
   endpoint answers `404` and the popup says *"GitHub did not start the sign-in"*.
4. Copy the **Client ID** (`Iv1.` or `Ov23li…`). There is no need to generate a client
   secret; do not generate one.

Then:

```bash
cp .env.example .env.local
```

Put the client ID in `.env.local` as `VITE_GITHUB_CLIENT_ID=…` and build:

```bash
npm run build
```

`.env.local` is gitignored. The client ID is not a secret — the device flow is designed
around that — but it identifies *your* app, so it stays out of the repo anyway.

Load the extension: `chrome://extensions` → Developer mode → **Load unpacked** →
`dist/`.

### Confirm the build picked it up

The build says so. A build with no client ID ends with:

```
warning: no VITE_GITHUB_CLIENT_ID in the build environment — this package cannot connect a GitHub account.
```

If you see that, `.env.local` was added after the build or the variable is missing its
`VITE_` prefix. Rebuild. A silent build has the ID inlined.

The popup repeats the message (*"This build of DSAHub has no GitHub OAuth client ID"*)
for anyone who loads a package built elsewhere. Both checks exist because the
alternative symptom — an empty string sent as `client_id` — is a confusing `404` from
GitHub that reads like a broken endpoint.

## Part one — the connection (M4)

**Step 1 — connect.** Click **Connect GitHub**. Expected, in order:

- A new tab opens at <https://github.com/login/device>.
- The popup shows an 8-character code with a hyphen (`WDJB-MJHT`) and a countdown
  ("expires in about 15 minutes").
- The service worker console (`chrome://extensions` → DSAHub → **service worker**)
  shows **nothing yet**. Not the device code, not a request body. Anything logged here
  during authorization is a Rule 13 violation — see the credential checks below.

Type the code on GitHub, approve the `repo` scope.

**Step 2 — come back.** Reopen the popup. It should already show
*"Connected as @you"* and the repository step. The popup polls on open, so this is the
fast path; if you instead leave the popup closed for 30 seconds and then open it, the
alarm will have done it. Either way you should never have to click **Connect GitHub** a
second time.

**Step 3 — choose a repository.** Leave the name as `dsa-solutions` and click **Use**.
Expected:

- A new **private** repository appears at `https://github.com/<you>/dsa-solutions`,
  already containing a README (`auto_init`).
- The popup moves to the ready screen showing `you/dsa-solutions` and a **Branch**
  select populated from the repo, with its default branch selected.

Then click **Choose a different repository**, type the name of a repository you
*already own*, and click **Use** again. Its visibility must be unchanged afterwards —
DSAHub reuses an existing repository and never flips public↔private.

**Step 4 — prove it can push.** Click **Verify write access**. Expected:

- The popup says `Committed .dsahub/connection-check.md to <branch>.`
- That file exists on GitHub, in one commit, on the branch shown in the select.

This step is the point of the milestone. A read-only permissions check cannot prove
push access: SSO-protected organizations, protected branches, and a scope the user
narrowed on the consent screen all read fine and fail on write.

## Field checks

| What | Expected | If wrong |
| --- | --- | --- |
| Device code shape | `XXXX-XXXX`, copyable with **Copy** | `user_code` field renamed in [`auth.ts`](../src/github/auth.ts) |
| Scope on GitHub's consent screen | `repo` only — no user, gist, or org access | `GITHUB.scope` in [`config.ts`](../src/github/config.ts) |
| Repo list | only repositories you can push to | `permissions.push` filter in [`client.ts`](../src/github/client.ts) |
| Branch select | repo's real branches, default first | `listBranches` in [`repository.ts`](../src/github/repository.ts) |
| Commit count for the check file | exactly 1 | the Git Data API path in [`commit.ts`](../src/github/commit.ts) |

## The failures worth hunting

**A token stored that cannot push.** Revoke DSAHub's authorization at
<https://github.com/settings/applications> *without* clicking Disconnect, then click
**Verify write access**. The popup must show a sign-in error, not a success and not a
silent nothing. Reconnecting from that state must work.

**A connection claimed before it is real.** Start the flow, then instead of approving,
click **Cancel** on GitHub. The popup should say the sign-in was cancelled and offer to
start again — never "Connected".

**An expired code.** Start the flow and wait out the 15 minutes without approving. The
popup should say the code expired and offer to start again. The service worker should
stop polling; `chrome://extensions` → DSAHub → **service worker** → Application →
Alarms should show no `dsahub-auth-poll`.

**A repository someone else owns.** Type `torvalds/linux`'s name (`linux`) at the
repository step. DSAHub looks under *your* account, so this creates `you/linux` rather
than failing — surprising, but not wrong. Note here if it feels wrong enough to change.

**An empty repository.** Create a repository on GitHub with **no** README, select it,
and verify. The commit must still land: the empty-repo path creates the branch instead
of parenting onto a head that does not exist. This is unit-tested, but the 404-on-`ref`
shape it depends on is GitHub's, not ours.

## Part two — syncing a real solution (M5)

Everything here is the M5 exit criteria — Acceptance Tests 1, 2 and 3 — against a real
repository. `tests/unit/sync-manager.test.ts` proves all three against an in-memory
GitHub, which is enough to catch a logic mistake and not enough to catch a wrong
assumption about what the platforms hand us.

**Before you start:**

- Part one finished, including **Verify write access**.
- Detection confirmed for the platform you are about to use — run
  [VERIFY-leetcode.md](VERIFY-leetcode.md) or [VERIFY-gfg.md](VERIFY-gfg.md) first. If
  detection does not fire, nothing below happens and the reason is not in this file.
- **Read results from the console, not the popup.** The popup's dashboard is
  [part three](#part-three--notifications-the-dashboard-and-the-re-solve-question-m8);
  keeping it shut here means a wrong number in part three is a dashboard bug and not an
  ambiguity. The three places to look are the **page** console (content script), the
  **service worker** console, and GitHub.

**Step 5 — solve one problem.** Pick something easy you have not solved before, and
submit until Accepted. Expected:

- Page console: `[DSAHub] sync synced: Arrays/0001-Two-Sum/solution.cpp` — the category
  folder from your problem's topics, the numeric id zero-padded to four digits.
- On GitHub: **exactly one** new commit, subject `feat: add LeetCode Two Sum solution`.
- That commit contains **exactly three** files — the solution, `README.md` beside it, and
  the repository's main `README.md`. Three files in three commits means `commitFiles` is
  not building a single tree, and PRD §45's partial-sync state has become reachable.
- The solution file matches what you submitted, plus a trailing newline.
- The main README has a dashboard row linking to the solution and `**Total** | **1**`.
- Any prose you wrote in that README, above or below the DSAHub markers, is unchanged
  (Acceptance Test 7).

Time it. PRD §55 budgets under 5 seconds from verdict to synced; the alarm is not
involved on this path, so what you measure is four or five GitHub round trips. Write the
number in the record block — M8 needs to know whether there is work to do.

**Step 6 — resubmit the same solution unchanged.** Expected: `[DSAHub] sync unchanged:
…` and **no new commit**. This is the step the fake GitHub cannot vouch for. DSAHub reads
each file back before writing and commits only what differs, so `unchanged` depends on
the platform handing back byte-identical code the second time. If a second commit
appears, diff it — whitespace or line-ending drift in the extracted code is the likely
cause, and it means every resubmission will add an empty-looking commit.

**Step 7 — improve the solution.** Change a comment, submit, get Accepted. Expected:
`sync synced`, one commit, subject `feat: update LeetCode Two Sum solution`, and the
commit touches **only** the solution file — the dashboard row and the problem README did
not change, so they are not rewritten.

**Step 8 — the other platform (Acceptance Test 2).** Solve one GeeksforGeeks problem.
Expected: a path with no numeric prefix (`Dynamic-Programming/kadanes-algorithm/…`),
because GFG has no stable numeric id and the slug is the identity; subject
`feat: add GeeksforGeeks Kadane's Algorithm solution`; and a dashboard with both problems
and `**Total** | **2**`. The two must not have collided into one row or one folder.

**Step 9 — a failed submission (Acceptance Test 3).** Submit something that fails on
purpose. Expected: no commit, no queue entry, and the page console shows only the
adapter's `not accepted` line. Nothing may reach the service worker — once a message
arrives there, nothing downstream knows the verdict was a Wrong Answer.

### Step 10 — offline, queued, retried (PRD §44)

The path the unit tests can only simulate.

1. Turn off Wi-Fi. (The worker's own DevTools → Network → **Offline** also works and is
   more surgical; the page's DevTools does not, because the GitHub calls happen in the
   worker, not the page.)
2. Solve a new problem and get Accepted.
3. Page console: `[DSAHub] sync rejected: Could not reach GitHub. (<Title> is queued.)`
   The word *queued* has to be there and the word *synced* must not be — a queued sync
   reported as a success is a Rule 14 violation.
4. In the service worker console:

   ```js
   chrome.storage.local.get(["queue", "syncIndex"]).then(console.log);
   ```

   Expect one job carrying the whole normalized problem including `problem.code`, with
   `attempts: 0`, and a `syncIndex` record whose `status` is `pending`. The code has to be
   in there: the user has left the page and it cannot be extracted again.

   ```js
   chrome.alarms.getAll().then(console.log);
   ```

   Expect `dsahub-retry`, `periodInMinutes: 1`.
5. **Kill the worker.** `chrome://serviceworker-internals/` → find DSAHub → **Stop**, or
   just leave the browser idle for a minute. Re-run the `chrome.storage.local.get` above:
   the job must still be there. That is the whole reason the queue is in storage rather
   than in memory.
6. Turn the network back on and wait for the next sweep — under a minute. Expected: the
   commit lands, `chrome.alarms.getAll()` no longer lists `dsahub-retry` (the alarm exists
   only while jobs do), `queue` is `[]`, and the record's `status` is now `success`. The
   worker logs nothing on success; it logs `[DSAHub] N sync(s) still queued` only when
   something is left.
7. **Watch it give up.** Repeat 1–3 and stay offline for five minutes. The job is queued
   at T and swept at T+1, T+2 and T+4 — three attempts, `MAX_ATTEMPTS`. After that:
   `queue` empty, `dsahub-retry` cleared, and the record's `status` must be **`failed`**.
   A record still saying `pending` is promising a retry that no longer exists.

### Field checks

| What | Expected | If wrong |
| --- | --- | --- |
| LeetCode path | `<Category>/0001-Two-Sum/solution.cpp` | `problemFolder` in [`paths.ts`](../src/utils/paths.ts) |
| GFG path | `<Category>/<slug>/solution.java` — no numeric prefix | same |
| Category folder | the problem's real topic, not `Misc` | [`categorization/`](../src/categorization) |
| File extension | matches the language you submitted in | [`languages.ts`](../src/languages.ts) |
| Commits per accepted problem | exactly 1 | [`commit.ts`](../src/github/commit.ts) |
| Files in a first sync | exactly 3 | the `planned` list in [`sync-manager.ts`](../src/sync/sync-manager.ts) |

### The failures worth hunting

**A repository that is gone.** Delete the repo on GitHub, then solve a problem. Expected:
a fatal failure — the record goes straight to `failed`, `queue` stays empty, and the page
console shows the rejection. If it queues instead, a 404 is being classified retryable and
DSAHub will retry three times against a repository that will never exist.

**A revoked token, from a submission.** Revoke DSAHub at
<https://github.com/settings/applications> and solve a problem. Same expectation: failed,
not queued. Reconnecting and re-solving must then work.

**Re-solves the user asked to leave alone.** Popup → **Settings** → **When you re-solve a
problem** → **Keep the saved solution**. Resubmit a solved problem with different code.
Expected: `sync skipped`, no commit, and the file in the repository unchanged. Set it back
to **Replace the saved solution** afterwards. The third mode, **Ask me each time**, is
[step 13](#step-13--the-re-solve-question-survives-eviction).

**Two problems accepted seconds apart** (two tabs, submit both). Expected: two commits and
both rows in the dashboard. If the second sync fails, it should be a retryable 422 —
`setRef` is never forced, so GitHub rejects a commit built on a stale parent — and the
queued retry should re-render a README containing both problems within a minute. This is
the one race handled by retrying rather than by locking, so it is worth watching once.

## Part three — notifications, the dashboard, and the re-solve question (M8)

`tests/unit/service-worker.test.ts` drives the worker's real message, alarm and
notification listeners, so the routing and the queue arithmetic are already covered —
including Acceptance Tests 8 and 10. Three things it cannot cover: whether Chrome renders
these notifications at all, whether a button click still reaches an **evicted** worker, and
whether the popup's numbers agree with the README a user is actually looking at.

**Step 11 — a notification for a real sync.** Solve a problem. Expected: an OS
notification titled `Synced <Title>`, body `Committed to <path>`. If nothing appears,
check Windows **Settings → Notifications** for Chrome before touching the code —
`chrome.notifications.create` resolves with an id either way.

Then untick **Notifications** (popup → **Settings**; changes apply as you make them, there
is no Save) and solve another. Expected: the commit lands, and nothing appears on screen.
Re-tick it afterwards.

**Step 12 — the dashboard agrees with the repository.** Open the popup. Expected:

- Progress lists LeetCode and GeeksforGeeks with the counts from your README's stats
  table, in that order, zeros included, and a **Total** equal to `**Total**` there.
  A disagreement here is a Rule 14 bug even if both numbers are individually explicable —
  they come from `computeStatistics`, so they cannot differ unless the index is stale.
- `N synced · 0 failed · 0 pending`.
- **Recent syncs**, newest first, each linking to the file on your branch. Click one; it
  must open the solution, not a 404.

### Step 13 — the re-solve question survives eviction

This is the step worth the setup.

1. Popup → **Settings** → **When you re-solve a problem** → **Ask me each time**.
2. Re-solve a problem you have already synced, with different code.
3. Expected: a notification titled `<Title> is already saved`, two buttons — **Update it**
   first, **Keep existing** second — that does *not* dismiss itself. The page console shows
   `sync skipped:` with "holding this submission".
4. **Now kill the worker** (`chrome://serviceworker-internals/` → DSAHub → **Stop**) while
   the notification is still up. This is the real case: answering takes as long as the user
   takes, and MV3 evicts.
5. Click **Update it**. Expected: the worker wakes, and a commit lands with subject
   `feat: update <Platform> <Title> solution` containing your new code. Nothing but the
   notification id carried across that eviction, which is why the id encodes the job.
6. Repeat 2–3 and click **Keep existing** instead. Expected: no commit, the file on GitHub
   unchanged, `queue` empty, and the index record still `success` — the saved solution
   really is in the repository, so anything else would be under-reporting.
7. Repeat 2–3 once more and answer from the **popup** instead (the amber *not synced yet*
   block). Same two buttons, same outcomes. One handler serves both, so a difference here
   means the popup is not sending `RESOLVE_CHOICE`.

Set it back to **Replace the saved solution** afterwards.

**Step 14 — automatic syncing off (PRD §31).** Popup → **Settings** → untick **Sync
automatically**. Solve a problem. Expected:

- No commit, and **no GitHub request at all** — the worker's Network tab stays empty.
- The popup shows `1 not synced yet` with `Queued.` and a **Sync now** button.
- `chrome.alarms.getAll()` does **not** list `dsahub-retry`. There is nothing for a timer
  to do while the answer is "wait for the user", and a heartbeat that ticks anyway wakes
  the worker every minute for the rest of the session.
- Press **Sync now**: the commit lands, the block disappears, `queue` is `[]`.

Re-tick it afterwards.

**Step 15 — the branch cache (PRD §47).** With the popup open on **Settings**, watch the
worker's Network tab and switch away from Settings and back. Expected: `GET /branches`
once, then nothing for 10 minutes. And during a *sync*, no request to `/branches` or
`GET /repos/<you>/<repo>` at all — the branch comes from config.

### Field checks

| What | Expected | If wrong |
| --- | --- | --- |
| Queued notification title | `<Title> is queued, not synced yet` | `notifyQueued` in [`notify.ts`](../src/background/notify.ts) |
| Failed notification | says it could not sync, promises no retry | `notifyFailed`, same file |
| Re-solve buttons | `Update it`, then `Keep existing` | `ASK_UPDATE` index, same file |
| Popup totals | identical to the README's stats table | [`summary.ts`](../src/popup/summary.ts) |
| `dsahub-retry` while parked | absent | `drainNow` in [`service-worker.ts`](../src/background/service-worker.ts) |

## Credential checks (Rule 13)

Run all five. Each one is a rule the code is written to satisfy, and each one is
invisible until someone looks.

1. **Service worker console.** Do a full connect + verify with the console open and its
   log level set to **All levels**. Search the output for `gho_`, `ghu_`, `Bearer`, and
   the first six characters of the device code you were shown. Nothing may match.
2. **Popup DevTools.** Right-click the popup → Inspect → Console and Network. The
   popup must never see the token: it talks to the service worker, and
   `api.github.com` requests must appear in the *worker's* network log, not the
   popup's.
3. **Stored state.** In the service worker console:

   ```js
   chrome.storage.local.get(null).then((s) => console.log(Object.keys(s)));
   ```

   Expect `auth`, `config`, and — once part two has run — `syncIndex` and `queue` (plus
   `cache` once Settings has listed branches; it holds branch names and a timestamp, nothing
   else). But **no** `pendingAuth` once the flow has finished: `pendingAuth` surviving a
   successful connect means the device code was never dropped. Then read the queue itself:

   ```js
   chrome.storage.local.get("queue").then(({ queue }) => console.log(JSON.stringify(queue)));
   ```

   A queued job holds a whole problem including the user's code, which is the point. It
   must hold nothing else — no token, no login, no request headers. The GitHub calls are
   built fresh from `auth` at retry time precisely so a credential never sits in a second
   place.
4. **The built bundle.** `npm run build` already does this — `scripts/validate-dist.mjs`
   fails the build if any file in `dist/` matches `gh[pousr]_[A-Za-z0-9]{16,}` or
   `github_pat_[A-Za-z0-9_]{16,}`, which is the same pair `logger.ts` redacts. A green build
   is the check. To see it by hand:

   ```bash
   grep -rE "gh[pousr]_[A-Za-z0-9]{16,}" dist/ || echo "clean"
   ```

   Expect `clean`. A token-shaped literal in `dist/` means one got hardcoded. (The logger's
   own redaction regex does not match — it is a character class in source, not a literal
   token. Use the `{16,}` quantifier or you will match the detector and think you found a
   leak.)
5. **The sync path logs nothing.** Do a full part-two run with both consoles open at
   **All levels**. The only DSAHub lines may be `sync synced|unchanged|skipped: <path>` and
   `sync rejected: <message>` from the page, and `N sync(s) still queued` /
   `retry sweep failed: <message>` from the worker. Nothing that quotes a request, a
   response body, or a header. The notifications count as output too: none of the four may
   contain a token shape or the solution code — `notify.test.ts` asserts this, but Windows
   caches notification text in the Action Center, so it is worth one look.

## Cuts to make once you have looked

The ponytail pass on these milestones deferred these to real data. Make them now.

**From part one:**

1. **`slow_down` handling** ([`auth.ts`](../src/github/auth.ts)) — the 30-second alarm
   period is already six times GitHub's suggested 5-second interval, so `slow_down` may
   be unreachable in practice. If a long authorization never triggers it, the branch is
   ~10 lines defending against something that cannot happen. Delete it and let the
   default `expired` path catch the surprise.
2. **`intervalSeconds`** — same reasoning: if it is always 5 and the alarm always wins,
   store the constant and drop the field.
3. **The 5-second popup interval** ([`Popup.tsx`](../src/popup/Popup.tsx)) — the
   poll-on-open covers the case that matters. If reopening the popup always resolves the
   flow immediately, the interval is redundant.
4. **`getBranches` vs `listBranches`** — if nothing ever needs the raw branch list, fold
   `getBranches` into `listBranches` and drop one export.

**From part two:**

5. **Read-before-write on the solution file** ([`sync-manager.ts`](../src/sync/sync-manager.ts))
   — the whole point of step 6. If resubmitting an identical solution never actually yields
   identical extracted bytes, the `unchanged` path is dead for the file it was written for,
   and only the main README's comparison earns its request. Either fix the extraction or
   stop reading the solution back.
6. **`withTrailingNewline`** — if both adapters already return code ending in a newline,
   it is a function defending against nothing.
7. **`decode`'s non-inline branch** — the `encoding !== "base64"` guard exists for files
   the contents API declines to inline above 1 MB. If no real README gets near that, it is
   a condition protecting nothing.
8. **Three attempts** ([`queue.ts`](../src/sync/queue.ts)) — if a retry that failed at T+1
   has never once succeeded at T+2 or T+4, `MAX_ATTEMPTS` is two attempts more than needed
   and the exponent goes with it.

**From part three:**

9. **The branch cache** ([`service-worker.ts`](../src/background/service-worker.ts)) — it
   saves one request per Settings visit. If step 15 shows Settings is opened once a session,
   `cachedBranches` and the `cache` storage key are ~20 lines and a schema field buying
   nothing.
10. **`requireInteraction`** ([`notify.ts`](../src/background/notify.ts)) — Chrome has
    ignored it on some platforms. If the question auto-dismisses anyway, drop the flag and
    say in the popup that the answer lives there.

Record what you saw here so the next person does not re-run the pass:

```
Observed on <date>:
- Device endpoint / token endpoint behaved as documented: yes / no —
- slow_down ever returned: yes / no
- Empty-repo commit path exercised: yes / no
- Credential checks 1–5: pass / fail —
- Verdict → commit visible on GitHub: <n> s   (PRD §55 budget: 5 s)
- Identical resubmission produced `unchanged`: yes / no —
- Extracted code already ended in a newline: yes / no
- Offline → queue → retry landed the commit: yes / no
- Gave up with status `failed` after ~4 min offline: yes / no
- Concurrent-submission 422 self-healed: yes / no / not seen
- Notifications appeared at all: yes / no
- Popup totals matched the README's stats table: yes / no
- Re-solve question answered correctly after killing the worker: yes / no
- `requireInteraction` kept it on screen: yes / no
- autoSync off made zero GitHub requests: yes / no
- Settings opened more than once per session: yes / no
```

