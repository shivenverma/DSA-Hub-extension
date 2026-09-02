/**
 * Solution extraction for LeetCode (PRD §16's `SolutionExtractor`).
 *
 * Priority, and the reason for it:
 *   1. `typed_code` from the intercepted submit request — literally the bytes the
 *      judge received. Free, already captured, cannot disagree with the verdict.
 *   2. GraphQL `submissionDetails(submissionId)` — the same code read back from
 *      LeetCode, for when the interceptor missed the submit (extension installed
 *      or reloaded mid-session, so the patch was not in place yet).
 *   3. Fail loudly.
 *
 * There is deliberately no editor/DOM fallback. PRD §16 warns that visible editor
 * text can differ from what was submitted, and committing an edited buffer under an
 * "Accepted" verdict is the silent corruption Rule 14 forbids. Both sources above
 * are authoritative submission data; scraped text is not.
 */
import type { Solution } from "@/platforms/core/types";
import { resolveLanguage } from "@/languages";
import { queryEditorCode } from "@/content/editor-query";
import { detectLeetCodeLanguage, extractLeetCodeCodeFromDom } from "./dom";
import { LEETCODE } from "./selectors";

const QUERY = `query dsahubSubmission($submissionId: Int!) {
  submissionDetails(submissionId: $submissionId) {
    code
    lang { name }
  }
}`;

/** Pulls `{ code, lang }` out of a submissionDetails payload; null if unusable. */
export function parseSubmissionDetails(
  payload: unknown,
): { code: string; lang?: string } | null {
  const details = (payload as { data?: { submissionDetails?: unknown } } | null)?.data
    ?.submissionDetails;
  if (typeof details !== "object" || details === null) return null;
  const fields = details as { code?: unknown; lang?: unknown };
  if (typeof fields.code !== "string" || fields.code.trim().length === 0) return null;
  const lang =
    typeof fields.lang === "object" && fields.lang !== null
      ? (fields.lang as { name?: unknown }).name
      : undefined;
  return { code: fields.code, lang: typeof lang === "string" ? lang : undefined };
}

async function recoverFromApi(submissionId: string): Promise<{ code: string; lang?: string } | null> {
  const id = Number(submissionId);
  if (!Number.isInteger(id)) return null;
  try {
    const response = await fetch(LEETCODE.api.graphql, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: QUERY, variables: { submissionId: id } }),
      credentials: "include",
    });
    if (!response.ok) return null;
    return parseSubmissionDetails(await response.json());
  } catch {
    return null;
  }
}

/**
 * Resolves the submitted solution using multiple layered recovery strategies:
 * 1. `typed_code` from intercepted network submit request (highest fidelity)
 * 2. Direct Monaco editor query from the live page via MAIN-world messaging
 * 3. LeetCode GraphQL API `submissionDetails` query
 * 4. DOM Monaco editor extraction
 */
export async function extractSolution(input: {
  submissionId: string;
  interceptedCode?: string;
  interceptedLang?: string;
  submittedAt: string;
}): Promise<Solution> {
  let code = input.interceptedCode?.trim() ? input.interceptedCode : undefined;
  let lang = input.interceptedLang?.trim() ? input.interceptedLang : undefined;

  // 2. Query Monaco editor directly from the page
  if (!code) {
    const editorResult = await queryEditorCode();
    if (editorResult.code?.trim()) {
      code = editorResult.code;
      lang = lang ?? editorResult.lang;
    }
  }

  // 3. Try LeetCode GraphQL API
  if (!code) {
    const apiResult = await recoverFromApi(input.submissionId);
    if (apiResult?.code.trim()) {
      code = apiResult.code;
      lang = lang ?? apiResult.lang;
    }
  }

  // 4. Fallback to DOM extraction
  if (!code) {
    const domCode = extractLeetCodeCodeFromDom();
    if (domCode?.trim()) {
      code = domCode;
    }
  }

  if (!code) {
    throw new Error(
      `Could not recover the submitted source for LeetCode submission ${input.submissionId}`,
    );
  }

  // Detect language if still unassigned
  if (!lang) {
    lang = detectLeetCodeLanguage();
  }

  return {
    language: resolveLanguage(lang ?? "").canonical,
    code,
    submittedAt: input.submittedAt,
  };
}

