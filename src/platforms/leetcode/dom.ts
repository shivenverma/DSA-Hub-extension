/**
 * DOM-based detection and extraction for LeetCode.
 * Acts as a resilient fallback/co-pilot alongside network interception.
 */

export function detectLeetCodeAccepted(): boolean {
  if (typeof document === "undefined") return false;

  // 1. Check specific data selectors used by LeetCode
  const specific = document.querySelector(
    '[data-e2e-locator="submission-result"], [class*="result-state-accepted"], [class*="status-accepted"], [class*="text-green"]'
  );
  if (specific && /accepted/i.test(specific.textContent ?? "")) {
    return true;
  }

  // 2. Scan text nodes/elements for "Accepted" in submission context
  const candidates = Array.from(
    document.querySelectorAll("span, div, p, h1, h2, h3, h4, a")
  );

  for (const el of candidates) {
    const text = el.textContent?.trim() ?? "";
    if (text === "Accepted" || text.startsWith("Accepted")) {
      const parent =
        el.closest(
          '[class*="submission"], [class*="result"], [class*="tabs"], [class*="container"], main, div'
        ) ?? el.parentElement;
      const parentText = parent?.textContent ?? "";
      if (
        /testcases passed|runtime|beats|memory|time taken/i.test(parentText) ||
        el.className.includes("green") ||
        el.className.includes("success") ||
        window.getComputedStyle(el).color.includes("44, 187, 93") ||
        window.getComputedStyle(el).color.includes("0, 184, 163")
      ) {
        return true;
      }
    }
  }

  return false;
}

export function detectLeetCodeLanguage(): string | undefined {
  if (typeof document === "undefined") return undefined;

  const buttons = Array.from(
    document.querySelectorAll('button, [role="button"], [id*="headlessui-listbox-button"], [class*="rounded"]')
  );

  const KNOWN_LANGS = [
    "C++", "Java", "Python", "Python3", "C", "C#", "JavaScript", "TypeScript",
    "PHP", "Swift", "Kotlin", "Dart", "Go", "Ruby", "Scala", "Rust", "Racket", "Erlang", "Elixir"
  ];

  for (const btn of buttons) {
    const txt = btn.textContent?.trim() ?? "";
    for (const lang of KNOWN_LANGS) {
      if (txt === lang || txt.startsWith(lang + "\n") || txt.startsWith(lang + " ")) {
        return lang;
      }
    }
  }

  return undefined;
}

export function extractLeetCodeCodeFromDom(): string | undefined {
  if (typeof document === "undefined") return undefined;

  // Try extracting from Monaco editor lines in DOM
  const lines = Array.from(document.querySelectorAll(".monaco-editor .view-line"));
  if (lines.length > 0) {
    const code = lines.map((l) => l.textContent ?? "").join("\n");
    if (code.trim().length > 0) {
      return code;
    }
  }

  // Fallback to textarea or code block
  const textarea = document.querySelector<HTMLTextAreaElement>(".monaco-editor textarea, [class*='editor'] textarea");
  if (textarea?.value && textarea.value.trim().length > 0) {
    return textarea.value;
  }

  return undefined;
}

/**
 * Watches DOM for accepted submission results via MutationObserver.
 * Returns an unsubscribe function.
 */
export function watchLeetCodeDom(onAccepted: (submissionId?: string) => void): () => void {
  if (typeof document === "undefined" || typeof MutationObserver === "undefined") {
    return () => {};
  }

  let lastAcceptedTime = 0;
  const DEBOUNCE_MS = 6000;

  function check() {
    if (Date.now() - lastAcceptedTime < DEBOUNCE_MS) return;

    if (detectLeetCodeAccepted()) {
      lastAcceptedTime = Date.now();
      const submissionId = `dom_${Date.now()}`;
      onAccepted(submissionId);
    }
  }

  const observer = new MutationObserver(() => {
    check();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  // Initial check in case page is already showing accepted result
  check();

  return () => {
    observer.disconnect();
  };
}
