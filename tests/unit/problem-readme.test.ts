import { describe, expect, it } from "vitest";
import type { Problem } from "@/platforms/core/types";
import { renderProblemReadme } from "@/readme/problem-readme";

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
    code: "class Solution {};",
    solvedAt: "2026-01-01T00:00:00.000Z",
    ...patch,
  };
}

describe("renderProblemReadme", () => {
  it("renders the PRD §25 LeetCode example", () => {
    expect(renderProblemReadme(problem(), "solution.cpp")).toBe(
      `# Two Sum

**Platform:** LeetCode

**Difficulty:** Easy

**Topics:**

- Array
- Hash Table

## Problem

[View Problem](https://leetcode.com/problems/two-sum/)

## Language

C++

## Solution

See \`solution.cpp\`.
`,
    );
  });

  it("renders the PRD §25 GFG example with GFG's own metadata (Acceptance Test 6)", () => {
    const readme = renderProblemReadme(
      problem({
        platform: "gfg",
        problemId: undefined,
        url: "https://www.geeksforgeeks.org/problems/two-sum/1",
        topics: ["Arrays", "Hashing"],
        language: "Java",
      }),
      "solution.java",
    );

    expect(readme).toContain("**Platform:** GeeksforGeeks");
    expect(readme).toContain("- Hashing");
    expect(readme).toContain("[View Problem](https://www.geeksforgeeks.org/problems/two-sum/1)");
    expect(readme).toContain("See `solution.java`.");
  });

  it("points at the file that was actually written", () => {
    // With `fileNaming: "main"` the README must not still say solution.cpp.
    expect(renderProblemReadme(problem(), "main.cpp")).toContain("See `main.cpp`.");
  });

  it("is byte-identical across renders", () => {
    // Any timestamp or ordering wobble here means every re-sync produces a diff.
    expect(renderProblemReadme(problem(), "solution.cpp")).toBe(
      renderProblemReadme(problem(), "solution.cpp"),
    );
  });
});

describe("renderProblemReadme — missing metadata (PRD §18, §30)", () => {
  it("omits the difficulty line rather than claiming Unknown", () => {
    const readme = renderProblemReadme(problem({ difficulty: "Unknown" }), "solution.cpp");

    expect(readme).not.toContain("Difficulty");
    expect(readme).toContain("**Platform:** LeetCode");
    expect(readme).toContain("## Solution");
  });

  it("omits the topics section when the platform gave none", () => {
    const readme = renderProblemReadme(problem({ topics: [] }), "solution.cpp");

    expect(readme).not.toContain("**Topics:**");
    expect(readme).not.toMatch(/^- /m);
    expect(readme).toContain("## Problem");
  });

  it("still produces a usable README with nothing but a title and a URL", () => {
    const readme = renderProblemReadme(
      problem({ difficulty: "Unknown", topics: [], title: "Some Problem" }),
      "solution.txt",
    );

    expect(readme.startsWith("# Some Problem\n")).toBe(true);
    expect(readme).toContain("[View Problem](https://leetcode.com/problems/two-sum/)");
  });
});

describe("renderProblemReadme — untrusted strings", () => {
  it("escapes markdown in a title so the heading survives", () => {
    // Platform-supplied text lands in markdown; an underscore would italicise the rest.
    expect(renderProblemReadme(problem({ title: "Find *the* _max_ [value]" }), "s.cpp")).toContain(
      "# Find \\*the\\* \\_max\\_ \\[value\\]",
    );
  });

  it("escapes a topic that could open an HTML tag", () => {
    expect(renderProblemReadme(problem({ topics: ["<script>"] }), "s.cpp")).toContain(
      "- \\<script\\>",
    );
  });

  it("leaves ordinary punctuation alone", () => {
    // Over-escaping is its own bug: `Pow\(x, n\)` renders worse than the risk it avoids.
    const readme = renderProblemReadme(problem({ title: "Pow(x, n)" }), "s.cpp");
    expect(readme).toContain("# Pow(x, n)");
  });
});
