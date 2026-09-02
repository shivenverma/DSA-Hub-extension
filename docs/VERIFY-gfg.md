# Live verification — GeeksforGeeks adapter (M3)

This pass matters more than the LeetCode one. There, the parsers were built against
documented, widely-known endpoints; **here every endpoint, field name and verdict
string is a guess.** Nothing in `src/platforms/gfg/` has ever seen a real payload.

The design fails closed, so a wrong guess means *nothing syncs* rather than *the wrong
thing syncs* (Rule 14). That makes "no output at all" the expected symptom of a bad
guess — and it is what this pass is looking for.

Everything marked `⚠ VERIFY` in [`src/platforms/gfg/selectors.ts`](../src/platforms/gfg/selectors.ts)
is an assumption this pass either confirms or corrects.

This pass stops at detection. Once an accepted submission reaches the service worker,
continue with [VERIFY-github.md part two](VERIFY-github.md#part-two--syncing-a-real-solution-m5)
— step 8 there is the GFG half of the sync check.

## Setup

```bash
npm run build
```

Load the extension: `chrome://extensions` → Developer mode → **Load unpacked** →
select `dist/`.

Open a practice problem, e.g. <https://www.geeksforgeeks.org/problems/reverse-a-string/1>,
open DevTools, and confirm before submitting:

- Console shows `[DSAHub] watching gfg submissions`. If not, the ISOLATED content
  script never matched — check `content_scripts.matches` in `manifest.json`.
- The host in the address bar is exactly `www.geeksforgeeks.org`. `practice.geeksforgeeks.org`
  is the old portal and is deliberately out of scope; `GFG.host` gates on the new one,
  so nothing at all will install on the old domain.

## Step 1 — read the network before trusting any parser

Do this **before** looking at the console output, because it tells you whether a silent
console means "parser wrong" or "extension broken".

Submit a solution that will be accepted, then in the Network tab record four things:

| What | Where | Feeds |
| --- | --- | --- |
| The submit request's full URL | Network → the POST fired by Submit | `GFG.api.submit` |
| Its **Type** column (`fetch` or `xhr`) | same row | which patch in `page-interceptor.ts` survives |
| Whether a *second* request polls for the verdict | rows after the submit | `GFG.api.result` |
| The exact verdict string | that response's body | `GFG.acceptedVerdicts` |

Then check the guesses against what you saw:

- `GFG.api.submit` is `/geeksforgeeks\.org\/.*\/submit/i`. It must match the submit URL
  and **must not** match the "Run" / sample-test request — a Run has no real verdict, so
  matching it would report a pass that never happened. Fire Run once and confirm its URL
  fails the pattern.
- `GFG.api.result` is `/geeksforgeeks\.org\/.*(?:submission|result)/i`. It is deliberately
  loose. If it matches something noisy (a submissions-history fetch on page load, say),
  tighten it to the real polling path — a false match wastes a clone, and if that response
  happens to carry a `status` field it could emit a stale verdict.
- The four `GFG.fields` lists exist because the real key names are unknown. Once you have a
  real payload, **prune each list to the one key that is actually there.** Leaving four
  candidates in place after you know the answer is exactly the kind of speculative
  flexibility that hides the next bug.

## Step 2 — the console

Expected, in order:

1. Nothing while the judge is pending. `parseResult` returns `null` for
   pending/running/processing/queued/in-progress, so an early line means an unknown
   result is being reported as a known one.
2. One line: `[DSAHub] accepted: {"platform":"gfg","slug":"reverse-a-string",...}`

| Field | Expected | If wrong |
| --- | --- | --- |
| `slug` | matches the URL segment after `/problems/` | `GFG.problemPath` |
| `problemId` | **absent** — GFG has no stable numeric id (PRD §32) | if present, something invented one |
| `title` | the real title, not a slug-derived guess like `Reverse A String` | `GFG.dom.title` missed; see below |
| `difficulty` | `Easy`/`Medium`/`Hard` — `School`/`Basic` fold to `Easy` | `GFG.dom.difficulty` |
| `topics` | the problem's real tags, non-empty | `GFG.dom.topics` |
| `language` | the language you submitted | the `lang` field name, or `LANGUAGE_MAP` |
| `codeChars` | roughly the size of what you wrote | the `code` field name — the important one |

A title matching `titleFromSlug` exactly (every word capitalised) is the tell that the
DOM selector missed and the fallback fired. That is graceful degradation working (PRD §18),
not success.

## Step 3 — the failures worth hunting

**No output at all.** The fail-closed default. Work outward: was `watching gfg
submissions` logged? Did the submit URL match (`GFG.api.submit.test(url)` in the page
console)? Did the verdict string appear in `GFG.acceptedVerdicts`? Each answer narrows it
to one line of `selectors.ts`.

**A skip line on a solved problem.** `submission <id> not accepted (<raw>) — skipping`
with a `raw` that plainly means success — add that exact string to
`GFG.acceptedVerdicts`, lowercased. Never widen the check to a substring match: `Wrong
Answer` contains `Answer`.

**Accepted verdict, no code.** The error
`saw an accepted GeeksforGeeks submission but never captured the submitted code` means
the verdict was paired but the submit's `code` field was not found — a wrong key in
`GFG.fields.code`, or a submit body that is neither JSON nor form-encoded (check
Network → Payload → view source). GFG has no read-back API, so unlike LeetCode there is
no recovery path: this must be fixed at the field name.

**Wrong code, right verdict.** Submit solution A and, before its verdict lands, submit a
different solution B. Two lines should appear, each with its own `codeChars`. If they are
swapped or identical, pairing by `submissionId` is not working — most likely the submit
and result responses use *different* id fields, so the bus never matches them and every
verdict arrives with `submit: undefined`.

**`gfg-latest` in a log line.** `submission.ts` falls back to that literal id when no id
field is found. It "works" for a single submission and silently mis-pairs concurrent
ones, so treat it as a red flag, not a feature — find the real id field.

## Step 4 — capture the fixtures

[`tests/fixtures/gfg.json`](../tests/fixtures/gfg.json) is entirely guessed and says so at
the top. Replace each entry with a real capture:

| Key | Capture |
| --- | --- |
| `submitRequestJson` / `submitRequestForm` | Network → submit → Payload → **view source**. Keep whichever form is real and delete the other. |
| `submitResponseInlineAccepted` | the submit response, if it already carries the verdict |
| `submitResponseQueued` | the submit response, if the verdict comes by poll instead |
| `resultAccepted` | the last poll of an accepted submission |
| `resultWrongAnswer`, `resultCompilationError`, `resultTimeLimit` | one failing submission each |
| `resultRunning` | any non-final poll |

Delete the keys that turn out not to exist (`submitResponseNested` is a pure hedge against
a wrapper object; drop it if the payload is flat). Then `npm test` — failures now mean a
real shape drifted, which is the point.

> Read each payload before pasting it. GFG responses may carry account-identifying
> fields, and this repo is public.

## Cuts to make once you have looked

Each of these is real code kept only because the answer is unknown. Deleting them is part
of finishing M3, not a follow-up.

1. **One transport.** [`page-interceptor.ts`](../src/content/page-interceptor.ts) patches
   both `fetch` and `XMLHttpRequest`. Step 1 records the Type column for both platforms;
   once they agree, delete the other patch (~40 lines).
2. **One field name per list.** `GFG.fields` holds 4 lists of 3–4 candidates. Prune to the
   real key (~10 lines, and the `firstString` loop stops being a loop).
3. **One verdict path.** `parseSubmitExchange` emits `[submit, verdict]` for an inline
   verdict *and* `parseResult` handles a polled one. GFG does one or the other. Delete the
   branch that never fires.
4. **`candidates()`** in `submission.ts` looks one level into `result`/`data`/`submission`
   for the payload. If the real response is flat, that whole function goes.

Record what you saw here so the next person does not re-check:

```
Observed on <date>:
  submit URL:      <paste>
  transport:       fetch | xhr
  verdict arrives: inline | polled at <paste>
  id field:        <paste>
  code field:      <paste>
  accepted string: <paste>
```
