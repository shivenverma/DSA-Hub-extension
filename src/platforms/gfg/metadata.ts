/**
 * GFG problem metadata. Unlike LeetCode there is no documented GraphQL endpoint, so
 * this reads the rendered page through the centralized selectors (PRD §48) and
 * degrades field by field rather than failing the sync (PRD §18).
 *
 * DOM reading is acceptable here and not for solution code: a wrong title is a
 * cosmetic defect, whereas wrong code committed under an "Accepted" verdict is the
 * silent corruption Rule 14 forbids. See extractor.ts.
 */
import type { Difficulty, ProblemMetadata } from "@/platforms/core/types";
import { GFG } from "./selectors";

/** GFG has no stable numeric id, so the slug is the identity (PRD §23, §32). */
export function slugFromPath(pathname: string): string | null {
  return GFG.problemPath.exec(pathname)?.[1] ?? null;
}

/** "reverse-a-string" → "Reverse A String". Used when the DOM gives us no title. */
export function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Maps GFG's difficulty labels onto the internal three. GFG uses "School" and
 * "Basic" below Easy; both are folded into Easy because they are genuinely easier
 * problems, not unknown ones. Anything unrecognised stays Unknown (PRD §30 — never
 * invent a difficulty).
 */
export function toDifficulty(raw: string | null | undefined): Difficulty {
  switch (raw?.trim().toLowerCase()) {
    case "school":
    case "basic":
    case "easy":
      return "Easy";
    case "medium":
      return "Medium";
    case "hard":
      return "Hard";
    default:
      return "Unknown";
  }
}

function text(root: ParentNode, selector: string): string | null {
  const value = root.querySelector(selector)?.textContent?.trim();
  return value && value.length > 0 ? value : null;
}

/**
 * Pure so it can be tested against captured HTML without a live page.
 * `root` is the document (or a fixture fragment) to read from.
 */
export function parseMetadata(root: ParentNode, slug: string, url: string): ProblemMetadata {
  const topics = [...root.querySelectorAll(GFG.dom.topics)]
    .map((node) => node.textContent?.trim())
    .filter((topic): topic is string => !!topic && topic.length > 0);

  return {
    platform: "gfg",
    // No problemId: GFG has no stable numeric id, and inventing one would break
    // duplicate detection the moment the guess changed.
    slug,
    title: text(root, GFG.dom.title) ?? titleFromSlug(slug),
    url,
    difficulty: toDifficulty(text(root, GFG.dom.difficulty)),
    topics: [...new Set(topics)],
  };
}

/** Reads metadata for the current page, or null when this is not a problem page. */
export function readMetadata(location: Location, root: ParentNode = document): ProblemMetadata | null {
  const slug = slugFromPath(location.pathname);
  if (!slug) return null;
  return parseMetadata(root, slug, `https://${GFG.host}${location.pathname}`);
}
