import { describe, expect, it } from "vitest";
import {
  calculateDifficultyStats,
  normalizeDifficulty,
} from "@/readme/statistics";
import type { Difficulty } from "@/platforms/core/types";
import type { SyncRecord } from "@/storage/storage";

function mockRecord(patch: Partial<SyncRecord> = {}): SyncRecord {
  return {
    platform: "leetcode",
    problemId: "1",
    title: "Two Sum",
    url: "https://leetcode.com/problems/two-sum/",
    githubPath: "Arrays/0001-Two-Sum/solution.cpp",
    difficulty: "Easy",
    primaryCategory: "Arrays",
    topics: ["Array"],
    language: "C++",
    solvedAt: "2026-01-01T12:00:00.000Z",
    status: "success",
    ...patch,
  };
}

describe("normalizeDifficulty", () => {
  it("normalizes case-insensitively", () => {
    expect(normalizeDifficulty("easy")).toBe("Easy");
    expect(normalizeDifficulty("EASY")).toBe("Easy");
    expect(normalizeDifficulty("medium")).toBe("Medium");
    expect(normalizeDifficulty("MEDIUM")).toBe("Medium");
    expect(normalizeDifficulty("hard")).toBe("Hard");
    expect(normalizeDifficulty("HARD")).toBe("Hard");
  });

  it("handles malformed, undefined, or missing values safely as Unknown", () => {
    expect(normalizeDifficulty(undefined)).toBe("Unknown");
    expect(normalizeDifficulty(null)).toBe("Unknown");
    expect(normalizeDifficulty("")).toBe("Unknown");
    expect(normalizeDifficulty("super-hard")).toBe("Unknown");
    expect(normalizeDifficulty(123)).toBe("Unknown");
  });
});

describe("calculateDifficultyStats", () => {
  it("TEST 1: returns all zeros when no problems exist", () => {
    const stats = calculateDifficultyStats([]);
    expect(stats).toEqual({
      easy: 0,
      medium: 0,
      hard: 0,
      unknown: 0,
      total: 0,
    });
  });

  it("TEST 2: calculates one Easy problem correctly", () => {
    const stats = calculateDifficultyStats([mockRecord({ difficulty: "Easy" })]);
    expect(stats).toEqual({
      easy: 1,
      medium: 0,
      hard: 0,
      unknown: 0,
      total: 1,
    });
  });

  it("TEST 3: calculates one Medium problem correctly", () => {
    const stats = calculateDifficultyStats([
      mockRecord({ problemId: "2", difficulty: "Medium" }),
    ]);
    expect(stats).toEqual({
      easy: 0,
      medium: 1,
      hard: 0,
      unknown: 0,
      total: 1,
    });
  });

  it("TEST 4: calculates one Hard problem correctly", () => {
    const stats = calculateDifficultyStats([
      mockRecord({ problemId: "4", difficulty: "Hard" }),
    ]);
    expect(stats).toEqual({
      easy: 0,
      medium: 0,
      hard: 1,
      unknown: 0,
      total: 1,
    });
  });

  it("TEST 5: calculates mixed difficulties (Easy, Easy, Medium, Hard, Hard)", () => {
    const stats = calculateDifficultyStats([
      mockRecord({ problemId: "1", difficulty: "Easy" }),
      mockRecord({ problemId: "2", difficulty: "Easy" }),
      mockRecord({ problemId: "3", difficulty: "Medium" }),
      mockRecord({ problemId: "4", difficulty: "Hard" }),
      mockRecord({ problemId: "5", difficulty: "Hard" }),
    ]);
    expect(stats).toEqual({
      easy: 2,
      medium: 1,
      hard: 2,
      unknown: 0,
      total: 5,
    });
  });

  it("TEST 6: handles unknown difficulty without corrupting easy/medium/hard totals", () => {
    const stats = calculateDifficultyStats([
      mockRecord({ problemId: "1", difficulty: "Easy" }),
      mockRecord({ problemId: "2", difficulty: "Medium" }),
      mockRecord({ problemId: "3", difficulty: "Unknown" }),
    ]);
    expect(stats).toEqual({
      easy: 1,
      medium: 1,
      hard: 0,
      unknown: 1,
      total: 3,
    });
  });

  it("TEST 7: aggregates across multiple platforms (LeetCode + GFG)", () => {
    const stats = calculateDifficultyStats([
      mockRecord({ platform: "leetcode", problemId: "1", difficulty: "Easy" }),
      mockRecord({ platform: "leetcode", problemId: "2", difficulty: "Medium" }),
      mockRecord({ platform: "gfg", problemId: undefined, slug: "two-sum", difficulty: "Easy" }),
      mockRecord({ platform: "gfg", problemId: undefined, slug: "alien-dict", difficulty: "Hard" }),
    ]);
    expect(stats).toEqual({
      easy: 2,
      medium: 1,
      hard: 1,
      unknown: 0,
      total: 4,
    });
  });

  it("TEST 8: deduplicates duplicate problem submissions", () => {
    const stats = calculateDifficultyStats([
      mockRecord({ platform: "leetcode", problemId: "1", difficulty: "Easy", solvedAt: "2026-01-01" }),
      mockRecord({ platform: "leetcode", problemId: "1", difficulty: "Easy", solvedAt: "2026-01-02" }),
      mockRecord({ platform: "leetcode", problemId: "2", difficulty: "Medium" }),
    ]);
    expect(stats).toEqual({
      easy: 1,
      medium: 1,
      hard: 0,
      unknown: 0,
      total: 2,
    });
  });

  it("TEST 9: excludes failed and pending records from difficulty totals", () => {
    const stats = calculateDifficultyStats([
      mockRecord({ problemId: "1", difficulty: "Easy", status: "success" }),
      mockRecord({ problemId: "2", difficulty: "Medium", status: "failed" }),
      mockRecord({ problemId: "3", difficulty: "Hard", status: "pending" }),
    ]);
    expect(stats).toEqual({
      easy: 1,
      medium: 0,
      hard: 0,
      unknown: 0,
      total: 1,
    });
  });

  it("TEST 10: safely classifies missing or malformed difficulty as Unknown", () => {
    const stats = calculateDifficultyStats([
      mockRecord({ problemId: "1", difficulty: "easy" as unknown as Difficulty }),
      mockRecord({ problemId: "2", difficulty: "" as unknown as Difficulty }),
      mockRecord({ problemId: "3", difficulty: undefined as unknown as Difficulty }),
    ]);
    expect(stats).toEqual({
      easy: 1,
      medium: 0,
      hard: 0,
      unknown: 2,
      total: 3,
    });
  });
});
