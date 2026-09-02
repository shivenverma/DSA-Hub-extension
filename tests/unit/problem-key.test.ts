import { describe, expect, it } from "vitest";
import { problemKey } from "@/platforms/core/types";

// PRD §32 / Rule 10: identity is platform-aware.
describe("problemKey", () => {
  it("keeps the same title on different platforms distinct", () => {
    const leetcode = problemKey({ platform: "leetcode", problemId: "1", slug: "two-sum" });
    const gfg = problemKey({ platform: "gfg", slug: "two-sum" });
    expect(leetcode).toBe("leetcode:1");
    expect(gfg).toBe("gfg:two-sum");
    expect(leetcode).not.toBe(gfg);
  });

  it("prefers a stable problem id over the slug", () => {
    expect(problemKey({ platform: "leetcode", problemId: "42", slug: "trapping-rain-water" })).toBe(
      "leetcode:42",
    );
  });

  it("falls back to the slug when the platform has no numeric id", () => {
    expect(problemKey({ platform: "gfg", slug: "kadanes-algorithm" })).toBe("gfg:kadanes-algorithm");
  });

  it("refuses to invent a key when both identifiers are missing", () => {
    // Silently keying on the title would let two problems collide (Rule 9).
    expect(() => problemKey({ platform: "gfg" })).toThrow();
  });
});
