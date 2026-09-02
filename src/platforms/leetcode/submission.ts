/**
 * Pure parsing of LeetCode's submit/check traffic. No DOM, no `fetch`, no
 * `chrome.*` — so the interceptor stays a thin shim and every branch here is
 * unit-testable against captured fixtures (PRD §48, §53).
 */
import { LEETCODE } from "./selectors";
import type { InterceptEvent } from "@/content/intercept-protocol";
import { INTERCEPT_SOURCE } from "@/content/intercept-protocol";
import { parseJson } from "@/utils/body";

/** Reads a string property off an unknown JSON value without asserting a shape. */
function str(value: unknown, key: string): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const raw = (value as Record<string, unknown>)[key];
  return typeof raw === "string" && raw.length > 0 ? raw : undefined;
}

/**
 * Builds the submit event from a `/submit/` exchange. The submission id comes from
 * the *response*; the code comes from the *request* body, because that is the text
 * the judge received (PRD §16 priority 1-2).
 */
export function parseSubmit(requestBody: unknown, responseBody: unknown): InterceptEvent | null {
  const id = str(responseBody, "submission_id") ?? numericId(responseBody, "submission_id");
  if (!id) return null;
  return {
    source: INTERCEPT_SOURCE,
    kind: "submit",
    submissionId: id,
    lang: str(requestBody, "lang"),
    code: str(requestBody, "typed_code"),
  };
}

function numericId(value: unknown, key: string): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const raw = (value as Record<string, unknown>)[key];
  return typeof raw === "number" && Number.isFinite(raw) ? String(raw) : undefined;
}

/**
 * Builds the verdict event from a `/check/` response, but only once the judge has
 * finished. LeetCode polls this endpoint repeatedly while state is PENDING/STARTED;
 * emitting early would let a "Wrong Answer" look like a missing verdict.
 */
export function parseVerdict(submissionId: string, responseBody: unknown): InterceptEvent | null {
  if (str(responseBody, "state") !== LEETCODE.finishedState) return null;
  const statusMsg = str(responseBody, "status_msg");
  if (!statusMsg) return null;
  return {
    source: INTERCEPT_SOURCE,
    kind: "verdict",
    submissionId,
    statusMsg,
    lang: str(responseBody, "pretty_lang") ?? str(responseBody, "lang"),
  };
}

/** True only for the exact accepted verdict — every other status is a failure (PRD §14). */
export function isAccepted(statusMsg: string): boolean {
  return statusMsg === LEETCODE.acceptedVerdict;
}

/**
 * The interceptor's single entry point: a raw exchange in, the events it yielded out.
 * Keeping the raw-string boundary here lets each platform own its own wire format.
 * A list rather than a single event because GFG's equivalent can yield two.
 */
export function interpret(
  url: string,
  requestBody: string | null,
  responseText: string,
): InterceptEvent[] {
  const target = classifyUrl(url);
  if (!target) return [];
  const response = parseJson(responseText);
  const event =
    target.kind === "submit"
      ? parseSubmit(parseJson(requestBody), response)
      : parseVerdict(target.submissionId, response);
  return event ? [event] : [];
}

/** URL-only pre-filter, so the interceptor never clones and reads unrelated responses. */
export function matches(url: string): boolean {
  return classifyUrl(url) !== null;
}

/**
 * Classifies a URL as one of the two endpoints worth intercepting.
 * Accepts absolute or relative URLs, since `fetch` is called with both.
 */
export function classifyUrl(
  raw: string,
): { kind: "submit" } | { kind: "check"; submissionId: string } | null {
  let path: string;
  try {
    path = new URL(raw, `https://${LEETCODE.host}`).pathname;
  } catch {
    return null;
  }
  if (LEETCODE.api.submit.test(path)) return { kind: "submit" };
  const check = LEETCODE.api.check.exec(path);
  if (check?.[1]) return { kind: "check", submissionId: check[1] };
  return null;
}
