import { describe, expect, it } from "vitest";
import type { Problem } from "@/platforms/core/types";
import {
  categoryFolder,
  problemDir,
  problemFolder,
  problemReadmePath,
  sanitizeSegment,
  solutionFileName,
  solutionPath,
} from "@/utils/paths";

/**
 * Paths are identity. If the same problem resolves to two different paths across
 * versions, a re-solve writes a second copy instead of updating the first, and the
 * duplicate detector — which matches on the stored path — never sees the collision.
 */
function problem(patch: Partial<Problem> = {}): Problem {
  return {
    platform: "leetcode",
    problemId: "1",
    slug: "two-sum",
    title: "Two Sum",
    url: "https://leetcode.com/problems/two-sum/",
    difficulty: "Easy",
    topics: ["Array", "Hash Table"],
    primaryCategory: "Arrays",
    language: "C++",
    code: "int main(){}",
    solvedAt: "2026-01-01T00:00:00.000Z",
    ...patch,
  };
}

describe("sanitizeSegment", () => {
  it("removes every character PRD §23 forbids", () => {
    expect(sanitizeSegment('a/b\\c:d?e*f<g>h|i"j')).toBe("a-b-c-d-e-f-g-h-i-j");
  });

  it("keeps apostrophes out of the middle of a word", () => {
    // "Kadane-s-Algorithm" is what naive replacement produces, and it reads badly.
    expect(sanitizeSegment("Kadane's Algorithm")).toBe("Kadanes-Algorithm");
    expect(sanitizeSegment("Kadane’s Algorithm")).toBe("Kadanes-Algorithm");
  });

  it("collapses punctuation runs into a single hyphen", () => {
    expect(sanitizeSegment("Pow(x, n)")).toBe("Pow-x-n");
    expect(sanitizeSegment("String to Integer (atoi)")).toBe("String-to-Integer-atoi");
    expect(sanitizeSegment("3Sum")).toBe("3Sum");
  });

  it("leaves an already-clean segment untouched", () => {
    // Idempotence matters: sanitizing a stored path must not change it.
    for (const clean of ["N-Queens", "two-sum", "0001-Two-Sum", "Dynamic-Programming"]) {
      expect(sanitizeSegment(clean)).toBe(clean);
      expect(sanitizeSegment(sanitizeSegment(clean))).toBe(clean);
    }
  });

  it("never starts or ends with a hyphen", () => {
    expect(sanitizeSegment("  ...Two Sum!!  ")).toBe("Two-Sum");
  });

  it("caps the length at a word boundary", () => {
    const long = "Minimum Number of Operations to Make Elements in Array Distinct and Sorted Again";
    const result = sanitizeSegment(long);

    expect(result.length).toBeLessThanOrEqual(80);
    expect(result.endsWith("-")).toBe(false);
    // Cut between words, so the name still reads.
    expect(long.replace(/ /g, "-")).toContain(result);
  });

  it("hard-cuts a single word longer than the cap", () => {
    // No hyphen to cut at; truncating is the only option left.
    expect(sanitizeSegment("x".repeat(200))).toBe("x".repeat(80));
  });

  it("returns a usable name when the title sanitizes to nothing", () => {
    // A title of only punctuation would otherwise produce "Arrays//solution.py".
    for (const empty of ["", "   ", "???", "///"]) {
      expect(sanitizeSegment(empty)).toBe("untitled");
    }
  });
});

describe("problemFolder", () => {
  it("zero-pads a LeetCode id so folders sort by problem number (PRD §23)", () => {
    expect(problemFolder(problem())).toBe("0001-Two-Sum");
    expect(problemFolder(problem({ problemId: "53", title: "Maximum Subarray" }))).toBe(
      "0053-Maximum-Subarray",
    );
    expect(problemFolder(problem({ problemId: "1234", title: "Replace the Substring" }))).toBe(
      "1234-Replace-the-Substring",
    );
  });

  it("uses the slug for a platform with no stable id (PRD §23)", () => {
    expect(
      problemFolder(
        problem({ platform: "gfg", problemId: undefined, slug: "two-sum", title: "Two Sum" }),
      ),
    ).toBe("two-sum");
  });

  it("falls back to the title when there is neither id nor slug", () => {
    expect(problemFolder(problem({ problemId: undefined, slug: undefined }))).toBe("Two-Sum");
  });

  it("does not mangle an id that is not a short number", () => {
    expect(problemFolder(problem({ problemId: "12345" }))).toBe("12345-Two-Sum");
  });
});

describe("solutionFileName", () => {
  it("maps each MVP language to its extension (Acceptance Test 9)", () => {
    const cases: Array<[string, string]> = [
      ["C++", "solution.cpp"],
      ["Java", "solution.java"],
      ["Python", "solution.py"],
      ["Python3", "solution.py"],
      ["JavaScript", "solution.js"],
    ];
    for (const [language, expected] of cases) {
      expect(solutionFileName(problem({ language }), "solution")).toBe(expected);
    }
  });

  it("still names a file for a language we do not know", () => {
    // PRD §18: an unrecognized language must not stop the solution reaching GitHub.
    expect(solutionFileName(problem({ language: "Rust" }), "solution")).toBe("solution.txt");
  });

  it("honours the other two naming settings (PRD §24)", () => {
    expect(solutionFileName(problem(), "main")).toBe("main.cpp");
    expect(solutionFileName(problem(), "problem-name")).toBe("Two-Sum.cpp");
  });
});

describe("full paths", () => {
  it("builds the PRD §22 layout", () => {
    expect(solutionPath(problem(), "solution")).toBe("Arrays/0001-Two-Sum/solution.cpp");
    expect(problemReadmePath(problem())).toBe("Arrays/0001-Two-Sum/README.md");
    expect(problemDir(problem())).toBe("Arrays/0001-Two-Sum");
  });

  it("hyphenates a multi-word category", () => {
    expect(categoryFolder("Dynamic Programming")).toBe("Dynamic-Programming");
    expect(problemDir(problem({ primaryCategory: "Linked List" }))).toBe("Linked-List/0001-Two-Sum");
  });

  it("puts a GFG problem beside a LeetCode one, not under a platform folder", () => {
    // PRD §22: platform lives in metadata, not in the directory structure.
    const gfg = problem({
      platform: "gfg",
      problemId: undefined,
      slug: "kadanes-algorithm",
      title: "Kadane's Algorithm",
      primaryCategory: "Arrays",
      language: "Java",
    });
    expect(solutionPath(gfg, "solution")).toBe("Arrays/kadanes-algorithm/solution.java");
  });

  it("produces no empty path segment even for the worst metadata", () => {
    const broken = problem({
      problemId: undefined,
      slug: undefined,
      title: "???",
      primaryCategory: "",
    });
    expect(solutionPath(broken, "solution").split("/")).toEqual([
      "untitled",
      "untitled",
      "solution.cpp",
    ]);
  });
});
