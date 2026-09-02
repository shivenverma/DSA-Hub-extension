/**
 * Every LeetCode-specific string lives here (PRD §48). When LeetCode changes its
 * UI or endpoints, this file is the only thing that moves.
 *
 * ⚠ VERIFY: the two API patterns below are the load-bearing part of detection and
 * have not yet been confirmed against a live accepted submission. See
 * `docs/VERIFY-leetcode.md` for the procedure and what to correct if they drift.
 */
export const LEETCODE = {
  host: "leetcode.com",
  /** Captures the slug so `isProblemPage` and `slugFromPath` share one pattern. */
  problemPath: /^\/problems\/([^/]+)/,
  api: {
    graphql: "https://leetcode.com/graphql",
    /**
     * POST /problems/<slug>/submit/ — the *request* body carries `typed_code`,
     * which is the code that was actually submitted. PRD §16 wants exactly this
     * and warns against trusting editor text, which can differ.
     */
    submit: /^\/problems\/[^/]+\/submit\/?$/,
    /**
     * GET /submissions/detail/<id>/check/ — polled by LeetCode until the judge
     * finishes; the response carries `state` and `status_msg` (the verdict).
     */
    check: /^\/submissions\/detail\/(\d+)\/check\/?$/,
  },
  /** The one verdict string that may trigger a sync (PRD §14). */
  acceptedVerdict: "Accepted",
  /** `state` value that means the judge has finished; anything else is still running. */
  finishedState: "SUCCESS",
} as const;
