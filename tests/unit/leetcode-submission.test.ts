import { describe, expect, it } from "vitest";
import {
  classifyUrl,
  isAccepted,
  parseSubmit,
  parseVerdict,
} from "@/platforms/leetcode/submission";
import fixtures from "../fixtures/leetcode.json";

describe("classifyUrl", () => {
  it.each([
    ["https://leetcode.com/problems/two-sum/submit/", "submit"],
    ["/problems/two-sum/submit/", "submit"],
    ["/problems/two-sum/submit", "submit"],
  ])("recognises the submit endpoint: %s", (url, kind) => {
    expect(classifyUrl(url)).toMatchObject({ kind });
  });

  it("recognises the check endpoint and captures the submission id", () => {
    expect(classifyUrl("/submissions/detail/1234567890/check/")).toEqual({
      kind: "check",
      submissionId: "1234567890",
    });
  });

  it("ignores unrelated LeetCode traffic", () => {
    // The interceptor sees every request the page makes; it must stay quiet for
    // GraphQL polling, assets and interpret-runs, or it would emit noise constantly.
    for (const url of [
      "https://leetcode.com/graphql",
      "/problems/two-sum/interpret_solution/",
      "/problems/two-sum/",
      "/submissions/detail/123/",
      "https://leetcode.com/static/main.js",
      "not a url at all",
    ]) {
      expect(classifyUrl(url), url).toBeNull();
    }
  });
});

describe("parseSubmit", () => {
  it("pairs the submitted code with the id LeetCode assigned", () => {
    const event = parseSubmit(fixtures.submitRequest, fixtures.submitResponse);
    expect(event).toMatchObject({
      kind: "submit",
      submissionId: "1234567890", // numeric in the response, normalised to string
      lang: "cpp",
    });
    expect(event?.kind === "submit" && event.code).toContain("unordered_map");
  });

  it("returns null without a submission id, since a verdict could never be matched to it", () => {
    expect(parseSubmit(fixtures.submitRequest, {})).toBeNull();
    expect(parseSubmit(fixtures.submitRequest, null)).toBeNull();
  });

  it("still reports the submission when the request body was unreadable", () => {
    // Code can be recovered from the API later; losing the id cannot be recovered.
    const event = parseSubmit(null, fixtures.submitResponse);
    expect(event).toMatchObject({ kind: "submit", submissionId: "1234567890" });
    expect(event?.kind === "submit" && event.code).toBeUndefined();
  });
});

describe("parseVerdict", () => {
  it("emits the accepted verdict once the judge has finished", () => {
    expect(parseVerdict("1234567890", fixtures.checkAccepted)).toEqual({
      source: "dsahub/intercept",
      kind: "verdict",
      submissionId: "1234567890",
      statusMsg: "Accepted",
      lang: "C++",
    });
  });

  it.each([
    ["checkPending"],
    ["checkStarted"],
  ] as const)("stays silent while the judge is still running (%s)", (key) => {
    // Emitting early would make a not-yet-known result indistinguishable from a
    // failure, and PRD §14 hangs the whole sync decision on this one signal.
    expect(parseVerdict("1", fixtures[key])).toBeNull();
  });

  it.each([
    ["checkWrongAnswer", "Wrong Answer"],
    ["checkTimeLimit", "Time Limit Exceeded"],
    ["checkCompileError", "Compile Error"],
  ] as const)("reports %s verbatim without accepting it", (key, expected) => {
    const verdict = parseVerdict("1", fixtures[key]);
    expect(verdict).toMatchObject({ statusMsg: expected });
    expect(verdict && verdict.kind === "verdict" && isAccepted(verdict.statusMsg)).toBe(false);
  });
});

describe("isAccepted", () => {
  it("accepts only the exact verdict", () => {
    expect(isAccepted("Accepted")).toBe(true);
  });

  it("rejects every near-miss", () => {
    // A substring or case-insensitive match would let "Not Accepted"-style
    // strings through and sync a failing solution.
    for (const status of ["accepted", "ACCEPTED", "Not Accepted", "Accepted ", "", "Wrong Answer"]) {
      expect(isAccepted(status), status).toBe(false);
    }
  });
});
