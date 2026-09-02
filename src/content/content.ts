import { resolveAdapter } from "@/platforms/core/registry";
import { sendToBackground } from "@/messaging";
import { log } from "@/utils/logger";

/**
 * Inject the MAIN-world interceptor early, before the page's own scripts run.
 *
 * `crxjs` cannot produce a working loader for MAIN-world content scripts: it emits a
 * relative `import()` path, but `chrome.runtime` is unavailable in the MAIN world, so
 * the path resolves against the page origin (leetcode.com/…) and 404s silently.
 *
 * Instead we inject a `<script type="module">` from here — the ISOLATED world — where
 * `chrome.runtime.getURL()` works. The script element is appended synchronously during
 * module evaluation, which is early enough because `content.ts` runs at `document_idle`
 * but the injected script tag starts loading immediately and patches `fetch`/XHR before
 * the user can submit.
 *
 * `use_dynamic_url: false` in the manifest keeps the URL stable across extension reloads,
 * so a hard-refresh on LeetCode doesn't leave an un-patched session.
 */
(function injectMainWorldInterceptor() {
  if (typeof document === "undefined" || typeof chrome === "undefined" || !chrome.runtime?.getURL) {
    return;
  }
  const script = document.createElement("script");
  script.type = "module";
  script.src = chrome.runtime.getURL("assets/page-interceptor.js");
  (document.head ?? document.documentElement)?.appendChild(script);
  // The element can be removed after the module has started executing;
  // the module itself stays alive inside the MAIN realm.
  script.addEventListener("load", () => script.remove(), { once: true });
})();

/**
 * ISOLATED-world content script: watch for accepted submissions and hand them to
 * the service worker. It never touches GitHub or credentials — that is the
 * worker's job (PRD §40).
 *
 * There is deliberately no SPA route tracking. Submissions are detected from
 * intercepted network traffic rather than from page state, so one subscription
 * covers the whole session, and the problem's identity is read from the live URL
 * at report time. (Patching `history.pushState` from here would not work anyway:
 * the ISOLATED world has its own realm, so the page's own calls never hit it.)
 */
const adapter = resolveAdapter(location.href);

async function report(submissionId?: string): Promise<void> {
  if (!adapter) return;
  try {
    const status = await adapter.getSubmissionStatus();
    if (!status.accepted) {
      log.info(`submission ${submissionId ?? "?"} not accepted (${status.raw ?? "?"}) — skipping`);
      return; // PRD §14: accepted submissions only
    }
    if (!adapter.isProblemPage(location.href)) {
      log.warn("accepted verdict arrived away from a problem page — skipping");
      return;
    }

    const [metadata, solution] = await Promise.all([
      adapter.getProblemMetadata(),
      adapter.getSubmittedSolution(),
    ]);
    // The full normalized problem, so a live check can confirm every field the
    // sync will commit. The code body is summarised by length, not printed.
    log.info("accepted:", {
      ...metadata,
      language: solution.language,
      codeChars: solution.code.length,
      submittedAt: solution.submittedAt,
    });

    const result = await sendToBackground({ t: "SUBMISSION_ACCEPTED", metadata, solution });
    if (!result.ok) log.warn("sync rejected:", result.message);
    // `synced`, `unchanged` and `skipped` are three different things, and the page
    // console is where a live verification reads which one happened (Rule 14).
    else log.info(`sync ${result.value.status}: ${result.value.path}`);
  } catch (cause) {
    // Detection failures stay silent to the page — never break someone's submission.
    log.error(`could not report submission ${submissionId ?? "(unknown)"}:`, cause);
  }
}

if (adapter) {
  adapter.watchSubmissions((submissionId) => void report(submissionId));
  log.info(`watching ${adapter.platform} submissions`);
}
