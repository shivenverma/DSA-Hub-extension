export type FailureCode =
  | "SUBMISSION_FAILED"
  | "EXTRACTION_FAILED"
  | "AUTH_FAILED"
  | "GITHUB_FAILED"
  | "DUPLICATE"
  | "NETWORK_ERROR"
  | "RATE_LIMITED"
  | "UNKNOWN_ERROR"
  | "NOT_IMPLEMENTED";

export interface Failure {
  ok: false;
  code: FailureCode;
  /** Shown to the user verbatim, so write it for a human (PRD §49). */
  message: string;
  retryable: boolean;
}

/**
 * Failures cross the content-script ↔ service-worker ↔ popup boundary, where
 * structured cloning strips Error prototypes and stacks. A plain result object
 * survives the trip and carries the human-readable message PRD §49 requires.
 */
export type Result<T> = { ok: true; value: T } | Failure;

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err(code: FailureCode, message: string, retryable = false): Failure {
  return { ok: false, code, message, retryable };
}
