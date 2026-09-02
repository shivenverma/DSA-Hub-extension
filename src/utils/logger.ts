const REDACTED = "[redacted]";

/** GitHub token shapes: ghp_/gho_/ghu_/ghs_/ghr_ and fine-grained github_pat_. */
const TOKEN_PATTERN = /\b(?:gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{16,})/g;

/** Credential-bearing JSON fields, redacted by key so unknown token shapes are covered too. */
const CREDENTIAL_FIELDS =
  /("(?:access_?token|token|authorization|device_code|client_secret)"\s*:\s*)"[^"]*"/gi;

function stringify(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return "[unserializable]";
  }
}

/**
 * Strips credentials from anything on its way to the console.
 * PRD Rule 13 / §37: authentication credentials must never be logged.
 */
export function redact(value: unknown): string {
  return stringify(value)
    .replace(CREDENTIAL_FIELDS, `$1"${REDACTED}"`)
    .replace(TOKEN_PATTERN, REDACTED);
}

/** Always log through this, never `console` directly — redaction is the whole point. */
export const log = {
  info: (...parts: unknown[]) => console.log("[DSAHub]", ...parts.map(redact)),
  warn: (...parts: unknown[]) => console.warn("[DSAHub]", ...parts.map(redact)),
  error: (...parts: unknown[]) => console.error("[DSAHub]", ...parts.map(redact)),
};
