# Live verification — LeetCode adapter (M2)

The unit tests prove the parsers hold against captured payload *shapes*. They cannot
prove those shapes are still what LeetCode actually sends. This is the manual pass
that closes that gap, and it is the M2 exit criterion.

Everything marked `⚠ VERIFY` in [`src/platforms/leetcode/selectors.ts`](../src/platforms/leetcode/selectors.ts)
is an assumption this pass either confirms or corrects.

This pass stops at detection: an accepted submission reaching the service worker is a
pass. What happens to it afterwards is
[VERIFY-github.md part two](VERIFY-github.md#part-two--syncing-a-real-solution-m5), which
assumes this one already succeeded.

## Setup

```bash
npm run build
```

Then load the extension: `chrome://extensions` → enable Developer mode → **Load
unpacked** → select `dist/`.

Open a problem you have not yet solved, e.g. <https://leetcode.com/problems/two-sum/>,
open DevTools on the page, and confirm before submitting anything:

- Console shows `[DSAHub] watching leetcode submissions`. If it does not, the
  ISOLATED content script never matched — check `content_scripts.matches`.

## The run

Submit a solution that will be **Accepted**.

Expected console output, in order:

1. Nothing at all while the judge is pending. The verdict parser stays silent
   until `state === "SUCCESS"`; any earlier line means it is reporting an
   unknown result as a known one.
2. One line: `[DSAHub] accepted: {"platform":"leetcode","problemId":"1",...}`

Check every field of that object:

| Field | Expected | If wrong |
| --- | --- | --- |
| `problemId` | the number shown on the problem page | GraphQL field name changed — fix `metadata.ts` |
| `slug` | matches the URL | `slugFromPath` regex |
| `title` | the real title, not a slug-derived guess | GraphQL returned nothing; check the query |
| `difficulty` | `Easy`/`Medium`/`Hard`, never `Unknown` | the difficulty string changed |
| `topics` | the problem's real tags, non-empty | `topicTags` shape changed |
| `language` | the language you submitted | `LANGUAGE_MAP` in `extractor.ts` |
| `codeChars` | roughly the size of what you wrote | see below — this is the important one |

## The two failures worth hunting

**Wrong code, right verdict.** The whole design exists to prevent this. Submit
solution A, and *before its verdict lands*, submit a different solution B.
Two `accepted:`/skip lines should appear, each with the `codeChars` of its own
submission. If they are swapped or identical, pairing is broken.

**The interceptor missed the submit.** Check the Network tab for
`POST /problems/<slug>/submit/` and confirm the request payload really carries
`typed_code`. If it does not, priority 1 of PRD §16 is gone and the extractor is
silently falling back to the GraphQL recovery on every sync. To confirm the
recovery path independently, reload the extension *after* clicking Submit but
*before* the verdict arrives — `codeChars` must still be correct.

A non-accepted submission should log
`submission <id> not accepted (Wrong Answer) — skipping` and nothing else.

## One cut to make once you have looked

[`page-interceptor.ts`](../src/content/page-interceptor.ts) patches **both** `fetch`
and `XMLHttpRequest`, because which one LeetCode uses for `submit/`+`check/` has not
been confirmed and guessing wrong means detecting nothing at all. Once this pass
runs, the Network tab's **Type** column answers it — `fetch` or `xhr`. Delete the
patch for the transport LeetCode does not use (~40 lines), and note here what you
saw so the next person does not have to re-check.

## Capturing real fixtures

Replace the guessed shapes with real ones so the tests defend actual payloads:

- `submitRequest` / `submitResponse` — Network → the `submit/` request → Payload
  and Response.
- `checkAccepted` and one failing verdict — the last `check/` poll for each.
- `question` — the `graphql` request whose `operationName` fetches the question.
- `submissionDetails` — DevTools console on the page:

  ```js
  fetch("/graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query: "query d($id: Int!) { submissionDetails(submissionId: $id) { code lang { name } } }",
      variables: { id: <your submission id> },
    }),
  }).then((r) => r.json()).then(console.log);
  ```

Paste each into [`tests/fixtures/leetcode.json`](../tests/fixtures/leetcode.json),
then `npm test`. Failures now mean a real shape drifted, which is the point.

> Do not paste a captured payload straight into the repo without reading it —
> `check/` responses and GraphQL bodies can carry session-identifying fields that
> should not be committed.
