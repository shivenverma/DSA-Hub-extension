/**
 * Every GeeksforGeeks-specific string lives here (PRD §48).
 * MVP targets the current practice portal only: www.geeksforgeeks.org/problems/<slug>.
 *
 * ⚠ EVERYTHING BELOW IS UNVERIFIED. GFG's submit endpoint and verdict shape are the
 * least certain part of this project — unlike LeetCode there is no widely-documented
 * API. Each `⚠ VERIFY` entry is a best guess to be confirmed or corrected against the
 * live portal; see docs/VERIFY-gfg.md. The design fails closed: an unrecognised
 * verdict counts as *not accepted*, so a wrong guess means "nothing syncs", never
 * "the wrong thing syncs" (Rule 14).
 */
export const GFG = {
  host: "www.geeksforgeeks.org",

  /** Practice URLs look like /problems/<slug>/1 — the trailing segment varies. */
  problemPath: /^\/problems\/([^/]+)/,

  api: {
    /**
     * ⚠ VERIFY. GFG serves the practice API from a separate host, so this matches on
     * the full URL rather than a path. Requires the word "submit" so that "run"
     * (sample-test) requests, which produce no real verdict, are ignored.
     */
    submit: /geeksforgeeks\.org\/.*\/submit/i,
    /** ⚠ VERIFY. Verdict polling, if the portal polls rather than answering inline. */
    result: /geeksforgeeks\.org\/.*(?:submission|result)/i,
  },

  /**
   * ⚠ VERIFY. Candidate field names, most likely first. Verification prunes each
   * list to the one that is real — a list this short is a hedge against a single
   * unverified guess, not open-ended flexibility.
   */
  fields: {
    submissionId: ["submission_id", "submissionId", "id"],
    verdict: ["status", "result", "verdict", "status_msg"],
    code: ["code", "source_code", "typed_code"],
    language: ["lang", "language", "selected_language"],
  },

  /**
   * ⚠ VERIFY. The exact strings that mean "accepted". Matched case-insensitively
   * after trimming, but never by substring: "Wrong Answer" must not match "Answer".
   */
  acceptedVerdicts: ["correct answer", "problem solved successfully", "accepted", "solved"],

  /**
   * ⚠ VERIFY. DOM is used for *metadata only* — GFG publishes no metadata API, and a
   * wrong title is cosmetic. Verdict and code never come from the DOM; see
   * extractor.ts for why.
   */
  dom: {
    /** Problem title on the practice page. */
    title: "[class*='problems_header_content'] h3, [class*='problem_title'], h1",
    /** Difficulty chip. */
    difficulty: "[class*='problems_header_description'] strong, [class*='difficulty']",
    /** Topic-tag links in the sidebar / accordion. */
    topics: "[class*='problems_tag_container'] a, [class*='tags'] a",
  },
} as const;
