/**
 * Runs in the MAIN world so it can see the page's own `fetch`/XHR traffic —
 * an ISOLATED content script gets a separate copy of those globals and would
 * observe nothing (PRD §14 priority 2).
 *
 * Two rules govern this file:
 *  1. Never change what the page observes. Every hook returns the untouched
 *     original result, reads clones only, and swallows its own errors — a bug in
 *     DSAHub must not break someone's submission.
 *  2. No `chrome.*` and no imports beyond the protocol/parsers. This realm has no
 *     extension APIs, and findings leave only via `window.postMessage`.
 *
 * `unbound-method` is disabled file-wide: capturing the original unbound and
 * re-applying it to each caller's `this` is the whole point of a monkey patch.
 * Binding would pin every call to one XHR instance.
 */
/* eslint-disable @typescript-eslint/unbound-method */
import * as leetcode from "@/platforms/leetcode/submission";
import * as gfg from "@/platforms/gfg/submission";
import { LEETCODE } from "@/platforms/leetcode/selectors";
import { GFG } from "@/platforms/gfg/selectors";

/**
 * Exactly one interpreter is chosen, by page host. Gating on the *page* rather than
 * the request URL matters: GFG's practice portal posts to a different host, while a
 * relative GFG path could otherwise satisfy LeetCode's pattern and be misattributed.
 * An unrecognised host installs no hooks at all.
 */
const active = [
  { host: LEETCODE.host, matches: leetcode.matches, interpret: leetcode.interpret },
  { host: GFG.host, matches: gfg.matches, interpret: gfg.interpret },
].find((platform) => platform.host === window.location.host);

/** Turns one observed request/response pair into zero or more events. */
function observe(url: string, requestBody: string | null, responseText: string): void {
  if (!active) return;
  for (const event of active.interpret(url, requestBody, responseText)) {
    window.postMessage(event, window.location.origin);
  }
}

function urlOf(resource: Request | string | URL): string {
  if (typeof resource === "string") return resource;
  if (resource instanceof URL) return resource.href;
  return resource.url;
}

/**
 * `open` is overloaded (2-arg and 5-arg forms), so `Parameters<>` would collapse to
 * the longer one and reject a 2-arg call. Spelling the tuple out lets us forward
 * exactly what the page passed instead of re-deriving the spec's defaults.
 */
type OpenArgs = [
  method: string,
  url: string | URL,
  async?: boolean,
  username?: string | null,
  password?: string | null,
];

/** Both transports are hooked because which one a platform uses is not guaranteed. */
type TaggedXhr = XMLHttpRequest & { __dsahubUrl?: string };

function installHooks(matches: (url: string) => boolean): void {
  const originalFetch = window.fetch;

  window.fetch = async function patchedFetch(...args: Parameters<typeof fetch>) {
    const response = await originalFetch.apply(this, args);
    try {
      const [resource, init] = args;
      if (matches(urlOf(resource))) {
        // Read a clone so the page still receives an unconsumed body.
        void response
          .clone()
          .text()
          .then((text) => {
            observe(urlOf(resource), typeof init?.body === "string" ? init.body : null, text);
          })
          .catch(() => undefined);
      }
    } catch {
      // Observation is best-effort; the page's response is already on its way back.
    }
    return response;
  };

  const originalOpen: (this: XMLHttpRequest, ...args: OpenArgs) => void =
    XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function patchedOpen(this: TaggedXhr, ...args: OpenArgs) {
    try {
      const [, url] = args;
      this.__dsahubUrl = typeof url === "string" ? url : url.href;
    } catch {
      // fall through to the original
    }
    return originalOpen.apply(this, args);
  };

  XMLHttpRequest.prototype.send = function patchedSend(
    this: TaggedXhr,
    ...args: Parameters<typeof originalSend>
  ) {
    try {
      const url = this.__dsahubUrl;
      if (url && matches(url)) {
        const [body] = args;
        const requestBody = typeof body === "string" ? body : null;
        this.addEventListener(
          "load",
          () => {
            try {
              // responseText throws for non-text responseTypes; both are guarded.
              observe(url, requestBody, this.responseText);
            } catch {
              // never let our observation surface to the page
            }
          },
          { once: true },
        );
      }
    } catch {
      // fall through to the original
    }
    return originalSend.apply(this, args);
  };
}

if (active) installHooks(active.matches);

// Allows ISOLATED world content script to ask for the current live Monaco or Ace editor text
window.addEventListener("message", (event: MessageEvent<{ source?: string; reqId?: string }>) => {
  if (event.origin !== window.location.origin) return;
  if (event.data?.source === "dsahub/get_editor_code") {
    let code: string | undefined;
    let lang: string | undefined;

    try {
      // Monaco Editor (used on LeetCode)
      const win = window as unknown as {
        monaco?: {
          editor?: {
            getModels?(): Array<{ getValue(): string; getLanguageId?(): string }>;
            getEditors?(): Array<{ getValue?(): string; getModel?(): { getValue(): string; getLanguageId?(): string } }>;
          };
        };
        ace?: {
          edit?(id: string): { getValue(): string; session?: { getMode?(): { $id?: string } } };
        };
      };

      if (win.monaco?.editor) {
        const models = win.monaco.editor.getModels?.();
        if (models && models.length > 0 && models[0]) {
          code = models[0].getValue();
          lang = models[0].getLanguageId?.();
        }
        if (!code) {
          const editors = win.monaco.editor.getEditors?.();
          if (editors && editors.length > 0 && editors[0]) {
            const ed = editors[0];
            code = ed.getValue?.() ?? ed.getModel?.()?.getValue();
            lang = ed.getModel?.()?.getLanguageId?.();
          }
        }
      }

      // Ace Editor (used on GeeksforGeeks)
      if (!code && win.ace) {
        try {
          const editor = win.ace.edit?.("ace-editor") ?? win.ace.edit?.("editor");
          if (editor?.getValue) {
            code = editor.getValue();
            lang = editor.session?.getMode?.()?.$id;
          }
        } catch {
          // Editor retrieval is best-effort
        }
      }
    } catch {
      // Editor query is best-effort
    }

    window.postMessage(
      {
        source: "dsahub/editor_code_response",
        reqId: event.data.reqId,
        code,
        lang,
      },
      window.location.origin,
    );
  }
});
