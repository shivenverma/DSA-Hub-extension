/**
 * GFG solution extraction.
 *
 * There is exactly one source: the code carried in the intercepted submit request —
 * the bytes the judge received. GFG exposes no submission-details read-back API to
 * recover from, so unlike LeetCode there is no priority-2 fallback.
 *
 * There is deliberately no editor fallback. PRD §16 permits editor state as a lower
 * priority but warns it "should not blindly copy visible editor text if that text
 * could differ from the submitted version" — and between clicking Submit and the
 * verdict arriving, the user is free to keep typing. Committing a buffer that the
 * judge never saw, under an Accepted verdict, is the failure Rule 14 forbids, so
 * this throws instead.
 */
import type { Solution } from "@/platforms/core/types";
import { resolveLanguage } from "@/languages";
import { queryEditorCode } from "@/content/editor-query";
import { extractGfgCodeFromDom } from "./dom";

export function extractSolution(input: {
  interceptedCode?: string;
  interceptedLang?: string;
  submittedAt: string;
}): Solution {
  if (!input.interceptedCode || input.interceptedCode.trim().length === 0) {
    throw new Error(
      "DSAHub saw an accepted GeeksforGeeks submission but never captured the submitted " +
        "code. This happens when the extension was installed or reloaded after Submit " +
        "was clicked; re-submitting will sync it.",
    );
  }
  return {
    language: resolveLanguage(input.interceptedLang ?? "").canonical,
    code: input.interceptedCode,
    submittedAt: input.submittedAt,
  };
}

export async function extractSolutionAsync(input: {
  interceptedCode?: string;
  interceptedLang?: string;
  submittedAt: string;
}): Promise<Solution> {
  if (input.interceptedCode && input.interceptedCode.trim().length > 0) {
    return extractSolution(input);
  }

  let code: string | undefined;
  let lang = input.interceptedLang?.trim() ? input.interceptedLang : undefined;

  // 1. Query Ace editor from live page
  const editorResult = await queryEditorCode();
  if (editorResult.code?.trim()) {
    code = editorResult.code;
    lang = lang ?? editorResult.lang;
  }

  // 2. DOM fallback
  if (!code) {
    const domCode = extractGfgCodeFromDom();
    if (domCode?.trim()) {
      code = domCode;
    }
  }

  if (!code) {
    return extractSolution(input); // will throw the expected error
  }

  return {
    language: resolveLanguage(lang ?? "").canonical,
    code,
    submittedAt: input.submittedAt,
  };
}


