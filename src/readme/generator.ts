/**
 * The main README dashboard (PRD §26, §29).
 *
 * Renders the *body* of the managed section; `parser.ts` owns the markers and the
 * user's surrounding text. Output is a pure function of the sync index, so two runs
 * over the same index produce identical bytes and re-syncing an unchanged repository
 * produces no commit.
 *
 * PRD §26 shows per-platform problem tables and §29 shows one combined table. Only the
 * §26 layout is generated: printing every row twice would double a large README for no
 * information gained, and §26 is the section the PRD calls the core product feature.
 */
import type { Platform } from "@/platforms/core/types";
import { PLATFORM_LABELS } from "@/platforms/core/types";
import type { SyncRecord } from "@/storage/storage";
import { escapeCell } from "./markdown";
import { spliceManagedSection } from "./parser";
import { computeStatistics, syncedRecords, type Count } from "./statistics";

/** Section order matches the PRD example; the emoji are part of that example. */
const PLATFORM_SECTIONS: { platform: Platform; heading: string }[] = [
  { platform: "leetcode", heading: "🟦 LeetCode" },
  { platform: "gfg", heading: "🟩 GeeksforGeeks" },
];

export function renderDashboard(index: Record<string, SyncRecord>): string {
  const records = syncedRecords(index);
  if (records.length === 0) {
    // An all-zero dashboard reads like a broken extension; one honest line does not.
    return "## 📊 Progress\n\nNo solutions synced yet.";
  }

  const stats = computeStatistics(index);
  const blocks: string[] = [
    section("📊 Progress", [
      "| Platform | Solved |",
      "|----------|-------:|",
      ...stats.byPlatform.map((entry) => `| ${PLATFORM_LABELS[entry.key]} | ${entry.count} |`),
      `| **Total** | **${stats.total}** |`,
    ]),
    countTable("🧠 By Difficulty", "Difficulty", stats.byDifficulty),
    countTable("📚 By Topic", "Topic", stats.byCategory),
    countTable("💻 By Language", "Language", stats.byLanguage),
  ];

  for (const { platform, heading } of PLATFORM_SECTIONS) {
    const forPlatform = records.filter((record) => record.platform === platform);
    if (forPlatform.length === 0) continue; // no empty section for a platform not used
    blocks.push(section(heading, problemTable(forPlatform)));
  }

  return blocks.join("\n\n");
}

/** Splices a freshly rendered dashboard into the user's README (PRD §27). */
export function generateReadme(
  existing: string | null,
  index: Record<string, SyncRecord>,
): string {
  return spliceManagedSection(existing, renderDashboard(index));
}

function section(heading: string, lines: string[]): string {
  return `## ${heading}\n\n${lines.join("\n")}`;
}

/** A two-column count table with the number column right-aligned, as in PRD §26. */
function countTable(heading: string, label: string, counts: Count<string>[]): string {
  return section(heading, [
    `| ${label} | Problems |`,
    `|${"-".repeat(label.length + 2)}|---------:|`,
    ...counts.map((entry) => `| ${escapeCell(entry.key)} | ${entry.count} |`),
  ]);
}

/**
 * `#` is the platform's own problem number where it has one, and a running index where
 * it does not (PRD §29's GFG rows are numbered 1, 2, … for exactly this reason).
 *
 * The problem title links to the committed solution: the README lives in the same
 * repository, so a relative path is the shortest route to the code, and the
 * per-problem README beside it carries the link back to the platform.
 */
function problemTable(records: SyncRecord[]): string[] {
  const sorted = [...records].sort(compareRecords);
  return [
    "| # | Problem | Difficulty | Topic | Language |",
    "|---|---------|------------|-------|----------|",
    ...sorted.map((record, position) => {
      const number = record.problemId ?? String(position + 1);
      const title = `[${escapeCell(record.title)}](${record.githubPath})`;
      return `| ${escapeCell(number)} | ${title} | ${record.difficulty} | ${escapeCell(
        record.primaryCategory,
      )} | ${escapeCell(record.language)} |`;
    }),
  ];
}

/** Numeric problem ids sort as numbers; everything else sorts by title. */
function compareRecords(a: SyncRecord, b: SyncRecord): number {
  const left = Number(a.problemId);
  const right = Number(b.problemId);
  if (Number.isFinite(left) && Number.isFinite(right) && left !== right) return left - right;
  return a.title.localeCompare(b.title);
}
