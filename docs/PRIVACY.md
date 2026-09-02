# DSAHub — Privacy Policy

Last updated: 2026-08-27. Applies to DSAHub 1.0.0.

## The short version

DSAHub sends your accepted solutions to **your** GitHub repository and nowhere else. There
is no DSAHub server, no account, and no analytics. Everything else it knows stays in your
browser.

```text
LeetCode / GeeksforGeeks  →  DSAHub (your browser)  →  your GitHub repository
```

Nothing branches off that line.

## What DSAHub stores, and where

All of it is in `chrome.storage.local` — your own browser profile, on your own machine.
Chrome does not sync `storage.local` to your Google account. Nothing is stored anywhere
else.

| Stored | What it is | Why |
| --- | --- | --- |
| `auth` | Your GitHub OAuth access token, the granted scope, your GitHub login, your avatar URL, and when you connected | Committing to your repository needs the token. The login is shown in the popup so you can see which account is connected. |
| `config` | Repository owner, name and branch; the nine settings from the Settings panel | Your choices, so DSAHub does not ask again. |
| `syncIndex` | One record per synced problem: platform, id or slug, title, problem URL, the path in your repository, the commit SHA, difficulty, topics, category, language, when you solved it, and whether the sync succeeded | Duplicate detection, the popup's counts, and the statistics table in your README. |
| `queue` | Any accepted submission not yet pushed — **including your solution code** — with the attempt count and the last error | An accepted submission cannot be recovered later; if GitHub is unreachable, the code has to be held somewhere or it is lost. Each entry is deleted as soon as it is pushed or given up on. |
| `cache` | Branch names for your repository, with a timestamp | Avoids re-asking GitHub for the same list every time you open Settings. Expires after 10 minutes. |

Your solution code is stored **only** while a sync is queued. A successful sync leaves the
code in your GitHub repository and nowhere in the extension.

## What DSAHub sends, and to whom

| Sent to | What | When |
| --- | --- | --- |
| `api.github.com` | Your solution code, the generated README text, the commit message, the repository and branch names, and your access token in the `Authorization` header | When a sync runs |
| `api.github.com` | Your access token | When listing your repositories or branches, or verifying write access |
| `github.com/login/device/code` and `github.com/login/oauth/access_token` | DSAHub's public OAuth client ID and, while you are authorizing, the device code | Only during **Connect GitHub** |

That is the complete list of network destinations. DSAHub contacts no other host — the
extension declares access to `github.com` and `api.github.com` only, so it could not reach
one if it tried.

DSAHub does **not** send anything to LeetCode or GeeksforGeeks. It reads the result of a
submission you already made; it does not submit, and it does not report back.

## What DSAHub does not do

- No DSAHub server, no database, no account. There is nothing to breach.
- No analytics, telemetry, crash reporting, or usage statistics.
- No advertising, and nothing sold or shared with anyone.
- No reading of pages other than LeetCode and GeeksforGeeks problem pages.
- No browsing history, bookmarks, downloads, cookies, or other tabs.
- **Nothing is logged that could identify you or authenticate as you.** Your access token
  and the device code never appear in the console, in an error message, in a notification,
  or in a queued job.

## GitHub permissions

DSAHub requests one OAuth scope: **`repo`**.

That scope is broader than DSAHub uses — it grants access to all of your repositories,
while DSAHub touches only the one you select. It is requested because DSAHub creates your
solutions repository as **private** by default, and GitHub's narrower `public_repo` scope
cannot write to a private repository. Choosing a public repository does not narrow the
scope, because the token is minted before you choose.

DSAHub never requests `user`, `gist`, `workflow`, `delete_repo`, `read:org`, or any other
scope, and it never deletes a repository or changes a repository's visibility.

## Your solutions belong to you

They are committed to a repository you own, under your GitHub account, with you as the
commit author. Your repository is private unless you choose otherwise. DSAHub cannot read
it once it is written, beyond reading back the files it wrote in order to avoid committing
the same bytes twice.

## Removing your data

- **Disconnect** (popup → Settings → Disconnect) deletes the stored token immediately.
- **Revoke** DSAHub at <https://github.com/settings/applications> to invalidate the token
  at GitHub's end as well. Worth doing: disconnecting forgets the token, it does not tell
  GitHub to reject it.
- **Uninstalling** the extension deletes everything in the table above — Chrome discards
  `storage.local` with the extension.
- Your GitHub repository is unaffected by all three. Delete it yourself if you want it
  gone.

## Children

DSAHub requires a GitHub account, and GitHub requires users to be at least 13. DSAHub
does not knowingly handle data from anyone younger.

## Changes

This file is versioned with the extension. A release that changes what DSAHub stores or
sends changes this file in the same commit, and the date at the top with it.

## Contact

Open an issue on the DSAHub repository.
