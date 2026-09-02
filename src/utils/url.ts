/** Parses a URL without throwing — scraped/navigated URLs are not always well-formed. */
export function safeUrl(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}
