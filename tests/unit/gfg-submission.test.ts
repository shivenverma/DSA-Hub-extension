import { describe, expect, it } from "vitest";
import {
  interpret,
  isAccepted,
  matches,
  parseResult,
  parseSubmitExchange,
  parseSubmitRequest,
} from "@/platforms/gfg/submission";
import fixtures from "../fixtures/gfg.json";

const SUBMIT_URL = "https://practiceapi.geeksforgeeks.org/api/v1/problems/700123/submit/";
const RESULT_URL = "https://practiceapi.geeksforgeeks.org/api/v1/submission/result/?id=55512346";

const json = (value: unknown) => JSON.stringify(value);

describe("matches", () => {
  it("recognises submit and result traffic", () => {
    expect(matches(SUBMIT_URL)).toBe(true);
    expect(matches(RESULT_URL)).toBe(true);
  });

  it("ignores everything else the portal fetches", () => {
    for (const url of [
      "https://www.geeksforgeeks.org/problems/reverse-a-string/1",
      "https://media.geeksforgeeks.org/img/logo.png",
      "https://practiceapi.geeksforgeeks.org/api/v1/problems/700123/",
      "https://api.github.com/user",
    ]) {
      expect(matches(url), url).toBe(false);
    }
  });
});

describe("isAccepted", () => {
  it("accepts the allow-listed verdicts, case- and space-insensitively", () => {
    for (const verdict of ["Correct Answer", "correct answer", "  Correct Answer  ", "Accepted"]) {
      expect(isAccepted(verdict), verdict).toBe(true);
    }
  });

  it("rejects every failure verdict", () => {
    for (const verdict of [
      "Wrong Answer",
      "Compilation Error",
      "Time Limit Exceeded",
      "Runtime Error",
      "Memory Limit Exceeded",
      "Pending",
      "",
    ]) {
      expect(isAccepted(verdict), verdict).toBe(false);
    }
  });

  it("never matches by substring", () => {
    // "Wrong Answer" contains "Answer"; a substring check would sync a failure.
    expect(isAccepted("Not Correct Answer")).toBe(false);
    expect(isAccepted("Answer")).toBe(false);
  });

  it("fails closed on a verdict GFG has not used before", () => {
    // The whole GFG surface is unverified, so this is the property that matters:
    // an unrecognised string must never count as accepted.
    expect(isAccepted("Partially Accepted")).toBe(false);
    expect(isAccepted("SUCCESS")).toBe(false);
  });
});

describe("parseSubmitRequest", () => {
  it("reads a JSON submit body", () => {
    const parsed = parseSubmitRequest(json(fixtures.submitRequestJson));
    expect(parsed.lang).toBe("cpp");
    expect(parsed.code).toContain("reverseWord");
  });

  it("reads a form-encoded submit body", () => {
    // GFG's portal is old enough that a form post is plausible; guessing JSON only
    // would silently lose the code.
    const parsed = parseSubmitRequest(fixtures.submitRequestForm);
    expect(parsed.lang).toBe("java");
    expect(parsed.code).toContain("StringBuilder");
  });

  it("returns nothing rather than throwing on an unreadable body", () => {
    expect(parseSubmitRequest(null)).toEqual({ code: undefined, lang: undefined });
    expect(parseSubmitRequest("<html>oops</html>")).toEqual({ code: undefined, lang: undefined });
  });
});

describe("parseSubmitExchange", () => {
  it("emits submit then verdict when GFG judges inline", () => {
    const events = parseSubmitExchange(
      json(fixtures.submitRequestJson),
      json(fixtures.submitResponseInlineAccepted),
    );

    // Order matters: the bus stores the submit, then the verdict consumes it.
    expect(events.map((e) => e.kind)).toEqual(["submit", "verdict"]);
    expect(events[0]).toMatchObject({ submissionId: "55512345", lang: "cpp" });
    expect(events[1]).toMatchObject({ submissionId: "55512345", statusMsg: "Correct Answer" });
  });

  it("emits only the submit when the verdict will arrive by poll", () => {
    const events = parseSubmitExchange(
      json(fixtures.submitRequestJson),
      json(fixtures.submitResponseNoVerdict),
    );
    expect(events.map((e) => e.kind)).toEqual(["submit"]);
  });

  it("still carries the code when the response is unparseable", () => {
    // Losing the id is survivable; losing the code is not, so the code must not
    // depend on the response parsing.
    const events = parseSubmitExchange(json(fixtures.submitRequestJson), "not json");
    expect(events).toHaveLength(1);
    expect(events[0]?.kind === "submit" && events[0].code).toContain("reverseWord");
  });

  it("finds a payload nested one level deep", () => {
    const events = parseSubmitExchange(null, json(fixtures.submitResponseNested));
    expect(events[1]).toMatchObject({
      submissionId: "55512348",
      statusMsg: "Problem Solved Successfully",
    });
  });

  it("pairs a queued submission by id so the later poll matches it", () => {
    const events = parseSubmitExchange(
      json(fixtures.submitRequestJson),
      json(fixtures.submitResponseQueued),
    );
    const verdict = parseResult(json(fixtures.resultAccepted));
    expect(events[0]?.submissionId).toBe("55512346");
    expect(verdict?.submissionId).toBe("55512346");
  });
});

describe("parseResult", () => {
  it("reports an accepted verdict", () => {
    expect(parseResult(json(fixtures.resultAccepted))).toMatchObject({
      kind: "verdict",
      submissionId: "55512346",
      statusMsg: "Correct Answer",
    });
  });

  it.each([
    ["resultWrongAnswer", "Wrong Answer"],
    ["resultCompilationError", "Compilation Error"],
    ["resultTimeLimit", "Time Limit Exceeded"],
  ] as const)("reports %s verbatim without accepting it", (key, expected) => {
    const verdict = parseResult(json(fixtures[key]));
    expect(verdict?.statusMsg).toBe(expected);
    expect(verdict && isAccepted(verdict.statusMsg)).toBe(false);
  });

  it("stays silent while the judge is still running", () => {
    // Reporting "Running" as a verdict would make an unknown result look like a
    // rejection, and the user would never learn the sync was skipped.
    expect(parseResult(json(fixtures.resultRunning))).toBeNull();
  });

  it("returns null for a response with no verdict at all", () => {
    expect(parseResult("{}")).toBeNull();
    expect(parseResult("not json")).toBeNull();
  });
});

describe("interpret", () => {
  it("routes a submit URL to the submit parser", () => {
    const events = interpret(
      SUBMIT_URL,
      json(fixtures.submitRequestJson),
      json(fixtures.submitResponseInlineAccepted),
    );
    expect(events.map((e) => e.kind)).toEqual(["submit", "verdict"]);
  });

  it("routes a result URL to the result parser", () => {
    const events = interpret(RESULT_URL, null, json(fixtures.resultAccepted));
    expect(events.map((e) => e.kind)).toEqual(["verdict"]);
  });

  it("checks submit before result, since the submit URL also matches the looser pattern", () => {
    // /problems/700123/submit/ contains no "submission", but a URL like
    // /submission/submit/ would match both; submit must win so the code is captured.
    const events = interpret(
      "https://practiceapi.geeksforgeeks.org/api/v1/submission/submit/",
      json(fixtures.submitRequestJson),
      json(fixtures.submitResponseInlineAccepted),
    );
    expect(events[0]?.kind).toBe("submit");
  });

  it("yields nothing for unrelated traffic", () => {
    expect(interpret("https://media.geeksforgeeks.org/img/logo.png", null, "{}")).toEqual([]);
  });
});
