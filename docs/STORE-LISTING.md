# Chrome Web Store submission

Everything the submission form asks for, in the order it asks. Copy from here rather than
rewriting: the permission justifications in particular are reviewed against what the code
actually does, and this file is kept next to the code.

The five **screenshots and the promo tile cannot be produced from a build** — they need a
browser and a real synced repository. They are the only outstanding item in this file, and
they are listed with what each one has to show.

## Store listing

**Name** (45 max): `DSAHub — Sync DSA solutions to GitHub` (37)

**Short description** (132 max):

```text
Automatically commits your accepted LeetCode and GeeksforGeeks solutions to your own GitHub repo, with a README that stays current.
```

(131.)

**Category:** Developer Tools · **Language:** English

**Detailed description:**

```text
DSAHub turns the problems you already solve into a GitHub repository you can show someone.

Solve a problem on LeetCode or GeeksforGeeks. When the verdict is Accepted, DSAHub commits
the solution to your own repository — filed under the problem's topic, named after the
problem, in one commit — and updates a README with your progress. You do nothing.

WHAT IT DOES

• Watches for accepted submissions on LeetCode and GeeksforGeeks. Nothing else triggers it:
  a Wrong Answer, a Time Limit Exceeded, or a run that was never submitted are ignored.
• Files each solution as <Topic>/<Problem>/solution.<ext> — Arrays/0001-Two-Sum/solution.cpp
  — with the extension matching the language you submitted in.
• Writes a short README beside each solution: difficulty, topics, and a link back to the
  problem.
• Keeps a dashboard in your repository's main README — totals by platform, difficulty and
  language, and an index of every problem — between two markers, so your own text in that
  file is never touched.
• Commits the solution, its README and the dashboard as a single commit, so the README can
  never advertise a solution that is not there.
• Skips a resubmission that is byte-identical to what it already saved. On an improved
  solution it commits only the file that changed, and you choose whether a re-solve
  replaces the saved one, is skipped, or asks you each time.
• Queues a sync when you are offline or GitHub is down, and pushes it when the connection
  comes back. Your solution is held in the extension until it lands, because a submission
  cannot be recovered once you leave the page.
• Tells you what happened, and never claims a sync succeeded when it did not.

WHAT IT NEEDS

A GitHub account. Sign in once, with GitHub's device flow — you type an eight-character
code on github.com, and DSAHub never sees your password. Then pick a repository, or let
DSAHub create a private one.

PRIVACY

There is no DSAHub server. Your solutions go from the coding site to your GitHub
repository, and nowhere else. No analytics, no account, no telemetry, nothing sold. Your
settings and your sync history stay in your own browser.

Full policy: <PRIVACY_POLICY_URL>

OPEN SOURCE

<REPOSITORY_URL>
```

Replace both placeholders before submitting.

## Permission justifications

The form asks for one per permission, in a text box, and a reviewer compares each to the
code. Each line below names the file that would have to change for the justification to
stop being true.

**`storage`**

```text
Stores the user's settings, the GitHub repository they chose, their sync history, and their
OAuth token — all in chrome.storage.local, on their own machine. Also holds an accepted
submission that could not be pushed yet, because a submission cannot be re-read once the
user leaves the results page. There is no remote server; this permission is what makes that
possible. See src/storage/storage.ts.
```

**`alarms`**

```text
Two timed jobs the extension cannot do with a timer, because a Manifest V3 service worker is
evicted after 30 seconds of inactivity. First: polling GitHub while the user authorizes on
github.com, which closes the popup. Second: retrying a sync that failed because the user was
offline. The retry alarm exists only while something is queued and is cleared when the queue
empties. See src/background/service-worker.ts.
```

**`notifications`**

```text
Tells the user what happened to a submission after they have navigated away from the results
page, which is when a sync finishes. Three outcomes — committed, queued and not synced yet,
or could not sync — and one question, when the user has asked to be consulted before a
re-solve replaces a saved solution. The user can switch all of them off in Settings. See
src/background/notify.ts.
```

**`https://github.com/*` and `https://api.github.com/*`**

```text
The extension's whole purpose: signing in with GitHub's device flow (github.com) and
committing solutions to the user's repository (api.github.com). No other host is accessed.
```

**Content scripts on `https://leetcode.com/*` and `https://www.geeksforgeeks.org/problems/*`**

```text
Detects an accepted verdict and reads the submitted source code from the page the user is
already on. Restricted to these two sites, and on GeeksforGeeks to the /problems/ path.
Nothing is sent to either site, and no other page is read.
```

**Are you using remote code?** No — the package contains all its code.

**Single purpose:**

```text
Saving a user's accepted competitive-programming solutions to a GitHub repository they own.
```

## Data-use disclosures

The form has a checkbox per category. Tick nothing except the two below.

| Category | Answer |
| --- | --- |
| Personally identifiable information | **No** |
| Health information | No |
| Financial and payment information | No |
| Authentication information | **Yes** — a GitHub OAuth token, stored locally, sent only to api.github.com |
| Personal communications | No |
| Location | No |
| Web history | No |
| User activity | No — accepted submissions are recorded locally and committed to the user's own repository, not collected |
| Website content | **Yes** — the source code the user submitted, read from the page and committed to their repository |

Then the three certifications: no selling or transferring to third parties for purposes
unrelated to the single purpose, no use for creditworthiness or lending, and no use beyond
the single purpose. All three hold.

## Images — still to capture

Nothing in the repository can produce these. Do a real part-one-through-three run from
[VERIFY-github.md](VERIFY-github.md) first, so the screenshots show a real repository rather
than a staged one; blur or crop the GitHub username if you would rather not publish it.

| Asset | Size | Required | Must show |
| --- | --- | --- | --- |
| Screenshot 1 | 1280×800 | yes | The popup dashboard with a real count and a few recent syncs — the thing a browser sees on the store page first |
| Screenshot 2 | 1280×800 | yes | A GitHub commit made by DSAHub, with the three files in it |
| Screenshot 3 | 1280×800 | recommended | The generated main README — the statistics table and the problem index |
| Screenshot 4 | 1280×800 | recommended | The device-flow code in the popup, so the sign-in is not a surprise |
| Screenshot 5 | 1280×800 | optional | The Settings panel |
| Small promo tile | 440×280 | yes | The icon and the name. No screenshot content — it is rendered small |
| Marquee promo tile | 1400×560 | optional | Only needed for featuring |

PNG or JPEG, no alpha, no browser chrome, no text smaller than it would be on screen.
Do not put a claim in an image that the extension does not do.

## Before you hit submit

- `npm run build` — this runs `scripts/validate-dist.mjs`, which checks MV3, that every
  file the manifest names is in the package, that the permission set is exactly the three
  above, that no sourcemap shipped, and that nothing token-shaped is in a bundle.
- The build must have been made with **your** `VITE_GITHUB_CLIENT_ID` in `.env.local`, from
  an OAuth app with **Enable Device Flow** ticked. Open the popup on the built extension:
  if it says the build has no client ID, the store package is dead on arrival.
- Zip the **contents** of `dist/`, not the folder.
- Bump `version` in both `manifest.json` and `package.json`. The store rejects a re-upload
  at the same version.
- Publish [PRIVACY.md](PRIVACY.md) at a URL and put it in the listing. The store requires a
  privacy policy link whenever any data-use box is ticked, and two are.

## Review notes worth expecting

**The `repo` OAuth scope looks broad.** It is, and
[PRIVACY.md](PRIVACY.md#github-permissions) says so plainly: DSAHub creates the solutions
repository private by default, and GitHub's `public_repo` cannot write to a private
repository. This is a GitHub scope, not a Chrome permission, so it is not on the form — but
a reviewer who reads the privacy policy will see it.

**A content script in the `MAIN` world.** `src/content/page-interceptor.ts` runs in the
page's own world because that is the only place the page's `fetch` and `XMLHttpRequest`
exist — an isolated content script gets its own copies and would see nothing. It wraps both,
returns the page's response untouched, and reads a **clone** of the body, so nothing the page
does changes. It adds no network requests of its own, and every hook swallows its own errors
rather than letting a bug in DSAHub break someone's submission.

What it finds is passed to the extension with `window.postMessage` on the page's own origin.
That is visible to the page — but it contains only the verdict and the code the page just
sent to its own server, so there is nothing in it the site did not already have. No token
and no GitHub call is ever in this world; those live in the service worker.
