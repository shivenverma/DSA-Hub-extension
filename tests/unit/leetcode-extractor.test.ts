import { afterEach, describe, expect, it, vi } from "vitest";
import { extractSolution, parseSubmissionDetails } from "@/platforms/leetcode/extractor";
import fixtures from "../fixtures/leetcode.json";

const SUBMITTED_AT = "2026-08-25T12:00:00.000Z";

function mockFetch(payload: unknown, ok = true): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    json: () => Promise.resolve(payload),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseSubmissionDetails", () => {
  it("reads the code and language back from the API", () => {
    expect(parseSubmissionDetails(fixtures.submissionDetails)).toMatchObject({ lang: "cpp" });
    expect(parseSubmissionDetails(fixtures.submissionDetails)?.code).toContain("twoSum");
  });

  it.each([
    ["a null submissionDetails", fixtures.submissionDetailsEmpty],
    ["an empty payload", {}],
    ["whitespace-only code", { data: { submissionDetails: { code: "   " } } }],
    ["a non-string code", { data: { submissionDetails: { code: 42 } } }],
  ])("returns null for %s", (_label, payload) => {
    expect(parseSubmissionDetails(payload)).toBeNull();
  });
});

describe("extractSolution", () => {
  it("prefers the intercepted submit body and makes no network call (PRD §16)", async () => {
    // This is the only source that cannot disagree with the verdict, so it must win
    // outright — and it must not cost a request.
    const fetchMock = mockFetch(fixtures.submissionDetails);
    const solution = await extractSolution({
      submissionId: "1234567890",
      interceptedCode: "int main() { return 0; }",
      interceptedLang: "cpp",
      submittedAt: SUBMITTED_AT,
    });

    expect(solution).toEqual({
      language: "C++",
      code: "int main() { return 0; }",
      submittedAt: SUBMITTED_AT,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("recovers from the API when the interceptor missed the submit", async () => {
    // Happens when the extension is installed or reloaded mid-session, so the
    // fetch patch was not in place when the user hit Submit.
    const fetchMock = mockFetch(fixtures.submissionDetails);
    const solution = await extractSolution({
      submissionId: "1234567890",
      submittedAt: SUBMITTED_AT,
    });

    expect(solution.code).toContain("twoSum");
    expect(solution.language).toBe("C++");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("treats blank intercepted code as missing rather than syncing an empty file", async () => {
    mockFetch(fixtures.submissionDetails);
    const solution = await extractSolution({
      submissionId: "1234567890",
      interceptedCode: "   \n  ",
      submittedAt: SUBMITTED_AT,
    });
    expect(solution.code).toContain("twoSum");
  });

  it("throws rather than syncing a solution it could not read (Rule 14)", async () => {
    mockFetch(fixtures.submissionDetailsEmpty);
    await expect(
      extractSolution({ submissionId: "1234567890", submittedAt: SUBMITTED_AT }),
    ).rejects.toThrow(/1234567890/);
  });

  it("throws when the recovery request itself fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(
      extractSolution({ submissionId: "1234567890", submittedAt: SUBMITTED_AT }),
    ).rejects.toThrow(/Could not recover/);
  });

  it("throws on a non-OK response instead of parsing an error page", async () => {
    mockFetch("<html>429</html>", false);
    await expect(
      extractSolution({ submissionId: "1234567890", submittedAt: SUBMITTED_AT }),
    ).rejects.toThrow(/Could not recover/);
  });

  it("does not call the API with a non-numeric submission id", async () => {
    const fetchMock = mockFetch(fixtures.submissionDetails);
    await expect(
      extractSolution({ submissionId: "abc", submittedAt: SUBMITTED_AT }),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps an unrecognised language rather than blocking the sync", async () => {
    const solution = await extractSolution({
      submissionId: "1",
      interceptedCode: "fn main() {}",
      interceptedLang: "rust",
      submittedAt: SUBMITTED_AT,
    });
    expect(solution.language).toBe("rust");
  });
});
