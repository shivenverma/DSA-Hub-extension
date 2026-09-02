/**
 * DOM-based detection and extraction for GeeksforGeeks.
 */

import { GFG } from "./selectors";

export function detectGfgAccepted(): boolean {
  if (typeof document === "undefined") return false;

  const text = (document.body?.textContent ?? "").toLowerCase();
  return GFG.acceptedVerdicts.some((verdict) => text.includes(verdict));
}

export function extractGfgCodeFromDom(): string | undefined {
  if (typeof document === "undefined") return undefined;

  // Ace editor lines in DOM
  const lines = Array.from(document.querySelectorAll(".ace_line, .ace_content"));
  if (lines.length > 0) {
    const code = lines.map((l) => l.textContent ?? "").join("\n");
    if (code.trim().length > 0) return code;
  }

  const textarea = document.querySelector<HTMLTextAreaElement>("textarea.ace_text-input, textarea");
  if (textarea?.value && textarea.value.trim().length > 0) {
    return textarea.value;
  }

  return undefined;
}

export function watchGfgDom(onAccepted: (submissionId?: string) => void): () => void {
  if (typeof document === "undefined" || typeof MutationObserver === "undefined") {
    return () => {};
  }

  let lastAcceptedTime = 0;
  const DEBOUNCE_MS = 6000;

  function check() {
    if (Date.now() - lastAcceptedTime < DEBOUNCE_MS) return;

    if (detectGfgAccepted()) {
      lastAcceptedTime = Date.now();
      const submissionId = `gfg_dom_${Date.now()}`;
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

  check();

  return () => {
    observer.disconnect();
  };
}
