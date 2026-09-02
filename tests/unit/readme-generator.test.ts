import { describe, expect, it } from "vitest";
import { generateReadme, renderDashboard } from "@/readme/generator";
import { computeStatistics } from "@/readme/statistics";
import { readManagedSection } from "@/readme/parser";
import type { SyncRecord } from "@/storage/storage";

function record(patch: Partial<SyncRecord> = {}): SyncRecord {
  return {
    platform: "leetcode",
    problemId: "1",
    slug: "two-sum",
    title: "Two Sum",
    url: "https://leetcode.com/problems/two-sum/",
    githubPath: "Arrays/0001-Two-Sum/solution.cpp",
    difficulty: "Easy",
    primaryCategory: "Arrays",
    topics: ["Array", "Hash Table"],
    language: "C++",
    solvedAt: "2026-01-01T00:00:00.000Z",
    status: "success",
    ...patch,
  };
}

/** Builds an index keyed the way `problemKey()` does. */
function index(...records: SyncRecord[]): Record<string, SyncRecord> {
  return Object.fromEntries(
    records.map((entry, position) => [
      `${entry.platform}:${entry.problemId ?? entry.slug ?? String(position)}`,
      entry,
    ]),
  );
}

const SAMPLE = index(
  record(),
  record({
    problemId: "15",
    slug: "3sum",
    title: "3Sum",
    difficulty: "Medium",
    language: "Java",
    githubPath: "Arrays/0015-3Sum/solution.java",
  }),
  record({
    problemId: "104",
    slug: "maximum-depth-of-binary-tree",
    title: "Maximum Depth of Binary Tree",
    difficulty: "Easy",
    primaryCategory: "Trees",
    language: "Python",
    githubPath: "Trees/0104-Maximum-Depth-of-Binary-Tree/solution.py",
  }),
  record({
    platform: "gfg",
    problemId: undefined,
    slug: "kadanes-algorithm",
    title: "Kadane's Algorithm",
    difficulty: "Medium",
    language: "Java",
    githubPath: "Arrays/kadanes-algorithm/solution.java",
    url: "https://www.geeksforgeeks.org/problems/kadanes-algorithm/1",
  }),
);

describe("computeStatistics", () => {
  it("counts by platform, difficulty, category and language (PRD §28)", () => {
    const stats = computeStatistics(SAMPLE);

    expect(stats.total).toBe(4);
    expect(stats.byPlatform).toEqual([
      { key: "leetcode", count: 3 },
      { key: "gfg", count: 1 },
    ]);
    expect(stats.byDifficulty).toEqual([
      { key: "Easy", count: 2 },
      { key: "Medium", count: 2 },
      { key: "Hard", count: 0 },
    ]);
    expect(stats.byCategory).toEqual([
      { key: "Arrays", count: 3 },
      { key: "Trees", count: 1 },
    ]);
    expect(stats.byLanguage).toEqual([
      { key: "Java", count: 2 },
      { key: "C++", count: 1 },
      { key: "Python", count: 1 },
    ]);
  });

  it("counts only what actually reached GitHub (Rule 14)", () => {
    // A queued or failed sync has no file in the repository; counting it would put a
    // number in the user's portfolio for work that is not there.
    const stats = computeStatistics(
      index(record(), record({ problemId: "2", status: "failed" }), record({ problemId: "3", status: "pending" })),
    );

    expect(stats.total).toBe(1);
    expect(stats.byPlatform).toEqual([
      { key: "leetcode", count: 1 },
      { key: "gfg", count: 0 },
    ]);
  });

  it("keeps Easy/Medium/Hard even at zero, but hides an empty Unknown row", () => {
    const stats = computeStatistics(index(record()));
    expect(stats.byDifficulty.map((row) => row.key)).toEqual(["Easy", "Medium", "Hard"]);

    const withUnknown = computeStatistics(index(record({ difficulty: "Unknown" })));
    expect(withUnknown.byDifficulty.at(-1)).toEqual({ key: "Unknown", count: 1 });
  });

  it("breaks count ties alphabetically so the table never reshuffles", () => {
    // Insertion order here is deliberately the reverse of the expected output.
    const stats = computeStatistics(
      index(
        record({ problemId: "1", primaryCategory: "Strings" }),
        record({ problemId: "2", primaryCategory: "Graphs" }),
        record({ problemId: "3", primaryCategory: "Arrays" }),
      ),
    );

    expect(stats.byCategory.map((row) => row.key)).toEqual(["Arrays", "Graphs", "Strings"]);
  });

  it("returns zeros rather than throwing on an empty index", () => {
    expect(computeStatistics({})).toMatchObject({ total: 0, byCategory: [], byLanguage: [] });
  });
});

describe("renderDashboard", () => {
  it("renders the PRD §26 sections in order", () => {
    const dashboard = renderDashboard(SAMPLE);

    expect(dashboard.match(/^## .*$/gm)).toEqual([
      "## 📊 Progress",
      "## 🧠 By Difficulty",
      "## 📚 By Topic",
      "## 💻 By Language",
      "## 🟦 LeetCode",
      "## 🟩 GeeksforGeeks",
    ]);
  });

  it("totals the platform table", () => {
    expect(renderDashboard(SAMPLE)).toContain("| **Total** | **4** |");
  });

  it("links each problem to its committed solution", () => {
    expect(renderDashboard(SAMPLE)).toContain(
      "| 1 | [Two Sum](Arrays/0001-Two-Sum/solution.cpp) | Easy | Arrays | C++ |",
    );
  });

  it("numbers rows by problem id, and sequentially where there is none", () => {
    const dashboard = renderDashboard(SAMPLE);
    const leetcodeRows = dashboard.slice(dashboard.indexOf("## 🟦")).split("\n").slice(4, 7);

    // LeetCode numbers sort numerically — 15 before 104, not "104" before "15".
    expect(leetcodeRows.map((row) => row.split("|")[1]?.trim())).toEqual(["1", "15", "104"]);
    // GFG has no ids, so its rows are numbered from 1 (PRD §29).
    expect(dashboard).toContain("| 1 | [Kadane's Algorithm](Arrays/kadanes-algorithm/solution.java)");
  });

  it("omits a platform section with nothing in it", () => {
    const dashboard = renderDashboard(index(record()));

    expect(dashboard).toContain("## 🟦 LeetCode");
    expect(dashboard).not.toContain("## 🟩 GeeksforGeeks");
    // The progress table still shows the zero, because that is a fact about progress.
    expect(dashboard).toContain("| GeeksforGeeks | 0 |");
  });

  it("says so plainly when nothing has synced yet", () => {
    expect(renderDashboard({})).toBe("## 📊 Progress\n\nNo solutions synced yet.");
  });

  it("escapes a title that would otherwise break the table", () => {
    const dashboard = renderDashboard(
      index(record({ title: "Split | Merge", primaryCategory: "Arrays" })),
    );

    expect(dashboard).toContain("[Split \\| Merge]");
    // Six pipes in the row means five cells: the escape held the shape.
    const row = dashboard.split("\n").find((line) => line.includes("Split"));
    expect(row?.match(/(?<!\\)\|/g)).toHaveLength(6);
  });

  it("flattens a multi-line value into one cell", () => {
    const dashboard = renderDashboard(index(record({ title: "Two\nSum" })));
    expect(dashboard).toContain("[Two Sum]");
  });
});

describe("generateReadme", () => {
  it("is idempotent — regenerating an unchanged index produces identical bytes", () => {
    // Otherwise every sync commits a README diff whether or not anything changed.
    const once = generateReadme(null, SAMPLE);
    expect(generateReadme(once, SAMPLE)).toBe(once);
    expect(generateReadme(generateReadme(once, SAMPLE), SAMPLE)).toBe(once);
  });

  it("does not depend on the order records were solved in", () => {
    const forwards = generateReadme(null, SAMPLE);
    const backwards = generateReadme(null, Object.fromEntries(Object.entries(SAMPLE).reverse()));
    expect(backwards).toBe(forwards);
  });

  it("updates the dashboard inside a user's README without touching their text", () => {
    const user = `# Prep\n\nMy notes.\n\n${generateReadme(null, index(record())).split("\n").slice(4).join("\n")}`;
    const updated = generateReadme(user, SAMPLE);

    expect(updated.startsWith("# Prep\n\nMy notes.")).toBe(true);
    expect(updated).toContain("| **Total** | **4** |");
    expect(updated).not.toContain("| **Total** | **1** |");
  });

  it("puts the whole dashboard inside the managed markers", () => {
    // Anything that leaked outside would be edited by hand and lost on the next sync.
    const readme = generateReadme(null, SAMPLE);
    expect(readManagedSection(readme)).toBe(renderDashboard(SAMPLE));
  });
});
