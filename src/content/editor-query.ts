/**
 * Helper to query code and language directly from the page's editor (Monaco or Ace)
 * via postMessage communication with the MAIN world script.
 */

export interface EditorCodeResult {
  code?: string;
  lang?: string;
}

export function queryEditorCode(timeoutMs = 1500): Promise<EditorCodeResult> {
  if (typeof window === "undefined") {
    return Promise.resolve({});
  }

  return new Promise((resolve) => {
    const reqId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    let resolved = false;

    function handleMessage(event: MessageEvent<{ source?: string; reqId?: string; code?: string; lang?: string }>) {
      if (
        event.origin === window.location.origin &&
        event.data?.source === "dsahub/editor_code_response" &&
        event.data?.reqId === reqId
      ) {
        resolved = true;
        window.removeEventListener("message", handleMessage);
        resolve({ code: event.data.code, lang: event.data.lang });
      }
    }

    window.addEventListener("message", handleMessage);
    window.postMessage({ source: "dsahub/get_editor_code", reqId }, window.location.origin);

    setTimeout(() => {
      if (!resolved) {
        window.removeEventListener("message", handleMessage);
        resolve({});
      }
    }, timeoutMs);
  });
}
