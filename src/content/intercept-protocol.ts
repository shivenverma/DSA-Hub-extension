/**
 * The contract between the MAIN-world interceptor and the ISOLATED-world content
 * script. They run in separate JavaScript realms and share no memory, so
 * everything crosses as a `window.postMessage` payload and must stay
 * structured-clone friendly (plain data, no classes, no functions).
 *
 * Kept in its own module so the MAIN-world bundle stays tiny — it must not pull
 * in the bus, the logger, or anything that touches `chrome.*` (unavailable there).
 */
export const INTERCEPT_SOURCE = "dsahub/intercept";

/** A submit request LeetCode sent, carrying the code the user actually submitted. */
export interface SubmitEvent {
  source: typeof INTERCEPT_SOURCE;
  kind: "submit";
  submissionId: string;
  lang?: string;
  code?: string;
}

/** A finished verdict LeetCode returned for a submission we saw go out. */
export interface VerdictEvent {
  source: typeof INTERCEPT_SOURCE;
  kind: "verdict";
  submissionId: string;
  /** Verbatim platform verdict: "Accepted", "Wrong Answer", "Time Limit Exceeded", ... */
  statusMsg: string;
  lang?: string;
}

export type InterceptEvent = SubmitEvent | VerdictEvent;

export function isInterceptEvent(data: unknown): data is InterceptEvent {
  if (typeof data !== "object" || data === null) return false;
  const candidate = data as Partial<InterceptEvent>;
  if (candidate.source !== INTERCEPT_SOURCE) return false;
  return candidate.kind === "submit" || candidate.kind === "verdict";
}
