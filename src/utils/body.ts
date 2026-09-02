/**
 * Wire-format helpers for reading intercepted request/response bodies.
 * Platforms differ: LeetCode posts JSON, GFG's practice portal may post a form
 * body, so each adapter picks the reader it needs rather than assuming JSON.
 */

/** Parses JSON, or returns null. Intercepted bodies are untrusted by definition. */
export function parseJson(text: string | null): unknown {
  if (text === null) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/**
 * Reads a request body that is either JSON or `application/x-www-form-urlencoded`
 * into a flat record, so callers can look up a field without caring which it was.
 */
export function parseBodyFields(text: string | null): Record<string, unknown> {
  if (text === null) return {};
  const json = parseJson(text);
  if (typeof json === "object" && json !== null && !Array.isArray(json)) {
    return json as Record<string, unknown>;
  }
  try {
    return Object.fromEntries(new URLSearchParams(text));
  } catch {
    return {};
  }
}

/** First candidate key holding a non-blank string. Used where a field name is unverified. */
export function firstString(
  source: Record<string, unknown> | null | undefined,
  keys: readonly string[],
): string | undefined {
  if (!source) return undefined;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim().length > 0) return value;
    // Ids arrive as numbers about as often as strings.
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}
