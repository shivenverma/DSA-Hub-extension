/**
 * The per-problem README (PRD §25).
 *
 * Deterministic by design: the same problem always renders byte-identical output, so
 * re-syncing a problem whose solution has not changed produces no diff and no commit
 * noise. Anything non-deterministic — a timestamp, a "last updated" line — would make
 * every re-sync look like a change.
 *
 * Sections are omitted rather than filled with placeholders when the platform did not
 * give us the data. A README that says "Difficulty: Unknown" tells the reader nothing;
 * leaving the line out says the same thing more honestly, and never invents a
 * difficulty (PRD §30).
 */
import type { Problem } from "@/platforms/core/types";
import { PLATFORM_LABELS } from "@/platforms/core/types";
import { escapeInline } from "./markdown";

export function renderProblemReadme(problem: Problem, solutionFileName: string): string {
  const lines: string[] = [
    `# ${escapeInline(problem.title)}`,
    "",
    `**Platform:** ${PLATFORM_LABELS[problem.platform]}`,
    "",
  ];

  if (problem.difficulty !== "Unknown") {
    lines.push(`**Difficulty:** ${problem.difficulty}`, "");
  }

  if (problem.topics.length > 0) {
    lines.push("**Topics:**", "");
    for (const topic of problem.topics) lines.push(`- ${escapeInline(topic)}`);
    lines.push("");
  }

  lines.push(
    "## Problem",
    "",
    `[View Problem](${problem.url})`,
    "",
    "## Language",
    "",
    escapeInline(problem.language),
    "",
    "## Solution",
    "",
    `See \`${solutionFileName}\`.`,
    "",
  );

  return lines.join("\n");
}
