/**
 * Pure parsing of GeeksforGeeks submit/result traffic. No DOM, no `fetch` — every
 * branch is unit-testable against fixtures (PRD §48, §53).
 *
 * GFG differs from LeetCode in two ways that shape this file:
 *  1. The submit response may carry the verdict inline rather than requiring a poll,
 *     so one exchange can produce both a submit and a verdict event.
 *  2. Field names are unverified, so lookups go through GFG.fields candidate lists.
 */
import { GFG } from "./selectors";
import type { InterceptEvent, SubmitEvent, VerdictEvent } from "@/content/intercept-protocol";
import { INTERCEPT_SOURCE } from "@/content/intercept-protocol";
import { firstString, parseBodyFields, parseJson } from "@/utils/body";

/** Synthetic id for a verdict GFG reported without one, so pairing still works. */
const UNKNOWN_ID = "gfg-latest";

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * GFG has been observed nesting the payload under `result` / `data`. Looks one level
 * deep so a wrapper object does not hide the verdict.
 */
function candidates(response: unknown): Array<Record<string, unknown>> {
  const root = asRecord(response);
  if (!root) return [];
  const nested = ["result", "data", "submission"]
    .map((key) => asRecord(root[key]))
    .filter((value): value is Record<string, unknown> => value !== null);
  return [root, ...nested];
}

function lookup(response: unknown, keys: readonly string[]): string | undefined {
  for (const scope of candidates(response)) {
    const found = firstString(scope, keys);
    if (found) return found;
  }
  return undefined;
}

/**
 * True only for a verdict on the accepted allow-list. Anything unrecognised — including
 * a verdict GFG renames tomorrow — is a failure, so nothing syncs (PRD §14, Rule 14).
 */
export function isAccepted(verdict: string): boolean {
  const normalized = verdict.trim().toLowerCase();
  return GFG.acceptedVerdicts.some((accepted) => accepted === normalized);
}

/** Reads the code and language the user actually submitted out of the request body. */
export function parseSubmitRequest(requestBody: string | null): {
  code?: string;
  lang?: string;
} {
  const fields = parseBodyFields(requestBody);
  return {
    code: firstString(fields, GFG.fields.code),
    lang: firstString(fields, GFG.fields.language),
  };
}

/**
 * Turns a submit exchange into a submit event, and — when GFG answered with the
 * verdict inline — a verdict event too. Returning both is what lets a single
 * request/response produce a complete, correctly-paired sync.
 */
export function parseSubmitExchange(
  requestBody: string | null,
  responseText: string,
): InterceptEvent[] {
  const response = parseJson(responseText);
  const submissionId = lookup(response, GFG.fields.submissionId) ?? UNKNOWN_ID;
  const { code, lang } = parseSubmitRequest(requestBody);

  const submit: SubmitEvent = {
    source: INTERCEPT_SOURCE,
    kind: "submit",
    submissionId,
    code,
    lang,
  };

  const verdict = lookup(response, GFG.fields.verdict);
  if (!verdict) return [submit];
  return [submit, { source: INTERCEPT_SOURCE, kind: "verdict", submissionId, statusMsg: verdict, lang }];
}

/** Turns a result-poll response into a verdict event, or null while still running. */
export function parseResult(responseText: string): VerdictEvent | null {
  const response = parseJson(responseText);
  const verdict = lookup(response, GFG.fields.verdict);
  if (!verdict) return null;
  // GFG reports an in-progress judge with these; treat them as "no verdict yet"
  // rather than as a failure, so a pending poll never looks like a rejection.
  if (/^(pending|running|processing|queued|in.?progress)$/i.test(verdict.trim())) return null;
  return {
    source: INTERCEPT_SOURCE,
    kind: "verdict",
    submissionId: lookup(response, GFG.fields.submissionId) ?? UNKNOWN_ID,
    statusMsg: verdict,
    lang: lookup(response, GFG.fields.language),
  };
}

/** URL-only pre-filter, so the interceptor never clones and reads unrelated responses. */
export function matches(url: string): boolean {
  return GFG.api.submit.test(url) || GFG.api.result.test(url);
}

/**
 * The interceptor's entry point. Submit is checked first because GFG's submit URL
 * would also satisfy the looser result pattern.
 */
export function interpret(
  url: string,
  requestBody: string | null,
  responseText: string,
): InterceptEvent[] {
  if (GFG.api.submit.test(url)) return parseSubmitExchange(requestBody, responseText);
  if (GFG.api.result.test(url)) {
    const verdict = parseResult(responseText);
    return verdict ? [verdict] : [];
  }
  return [];
}
