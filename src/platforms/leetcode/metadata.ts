/**
 * Problem metadata for LeetCode (PRD §18).
 *
 * Source is LeetCode's own GraphQL endpoint, queried from the content script so it
 * travels with the page's cookies and needs no extra host permission (PRD §52).
 * Every field degrades independently: PRD §18 says a missing field must not stop a
 * sync, and PRD §30 says never invent a difficulty.
 */
import type { Difficulty, ProblemMetadata } from "@/platforms/core/types";
import { LEETCODE } from "./selectors";

const QUERY = `query dsahubQuestion($titleSlug: String!) {
  question(titleSlug: $titleSlug) {
    questionFrontendId
    title
    difficulty
    topicTags { name }
  }
}`;

/** LeetCode returns "Easy" | "Medium" | "Hard"; anything else becomes Unknown. */
function toDifficulty(raw: unknown): Difficulty {
  return raw === "Easy" || raw === "Medium" || raw === "Hard" ? raw : "Unknown";
}

function topicsOf(question: Record<string, unknown>): string[] {
  const tags = question.topicTags;
  if (!Array.isArray(tags)) return [];
  return tags
    .map((tag) => (typeof tag === "object" && tag !== null ? (tag as { name?: unknown }).name : ""))
    .filter((name): name is string => typeof name === "string" && name.length > 0);
}

export function slugFromPath(pathname: string): string | null {
  return LEETCODE.problemPath.exec(pathname)?.[1] ?? null;
}

/** Turns a slug into a readable title ("two-sum" → "Two Sum") when GraphQL fails. */
export function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Shapes a GraphQL payload into normalized metadata. Split out from the network
 * call so every degradation path is testable against a fixture.
 */
export function parseMetadata(slug: string, url: string, payload: unknown): ProblemMetadata {
  const question = (payload as { data?: { question?: unknown } } | null)?.data?.question;
  const fields = typeof question === "object" && question !== null ? (question as Record<string, unknown>) : {};
  const id = fields.questionFrontendId;
  const title = fields.title;
  return {
    platform: "leetcode",
    problemId: typeof id === "string" && id.length > 0 ? id : undefined,
    slug,
    title: typeof title === "string" && title.length > 0 ? title : titleFromSlug(slug),
    url,
    difficulty: toDifficulty(fields.difficulty),
    topics: topicsOf(fields),
  };
}

/**
 * Fetches metadata for the problem currently on screen. Never throws: a failed
 * query degrades to slug-derived identity so the solution can still sync.
 */
export async function fetchMetadata(location: Location): Promise<ProblemMetadata | null> {
  const slug = slugFromPath(location.pathname);
  if (!slug) return null;
  const url = `https://${LEETCODE.host}${location.pathname}`;
  try {
    const response = await fetch(LEETCODE.api.graphql, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: QUERY, variables: { titleSlug: slug } }),
      credentials: "include",
    });
    if (!response.ok) return parseMetadata(slug, url, null);
    return parseMetadata(slug, url, await response.json());
  } catch {
    return parseMetadata(slug, url, null);
  }
}
