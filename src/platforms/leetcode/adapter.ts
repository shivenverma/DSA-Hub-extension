import type {
  CodingPlatformAdapter,
  ProblemMetadata,
  Solution,
  SubmissionStatus,
} from "@/platforms/core/types";
import type { SubmitEvent, VerdictEvent } from "@/content/intercept-protocol";
import { onVerdict } from "@/content/intercept-bus";
import { safeUrl } from "@/utils/url";
import { detectLeetCodeAccepted, watchLeetCodeDom } from "./dom";
import { extractSolution } from "./extractor";
import { fetchMetadata } from "./metadata";
import { isAccepted } from "./submission";
import { LEETCODE } from "./selectors";

/**
 * The adapter is stateful by design: PRD §8 fixes `getSubmissionStatus()` and
 * `getSubmittedSolution()` as no-argument calls, so the submission they describe has
 * to be remembered between the verdict arriving and the caller asking about it.
 */
export class LeetCodeAdapter implements CodingPlatformAdapter {
  readonly platform = "leetcode" as const;

  #latest: { verdict: VerdictEvent; submit: SubmitEvent | undefined; observedAt: string } | null =
    null;

  canHandle(url: string): boolean {
    return safeUrl(url)?.host === LEETCODE.host;
  }

  isProblemPage(url: string): boolean {
    const parsed = safeUrl(url);
    return parsed?.host === LEETCODE.host && LEETCODE.problemPath.test(parsed.pathname);
  }

  async getProblemMetadata(): Promise<ProblemMetadata> {
    const metadata = await fetchMetadata(window.location);
    if (!metadata) {
      throw new Error(`Not on a LeetCode problem page: ${window.location.pathname}`);
    }
    return metadata;
  }

  getSubmissionStatus(): Promise<SubmissionStatus> {
    const latest = this.#latest;
    if (latest) {
      return Promise.resolve({
        accepted: isAccepted(latest.verdict.statusMsg),
        raw: latest.verdict.statusMsg,
        submissionId: latest.verdict.submissionId,
      });
    }

    // Resilient fallback: check the DOM directly
    if (detectLeetCodeAccepted()) {
      return Promise.resolve({
        accepted: true,
        raw: LEETCODE.acceptedVerdict,
        submissionId: `dom_${Date.now()}`,
      });
    }

    return Promise.resolve({ accepted: false });
  }

  getSubmittedSolution(): Promise<Solution> {
    const latest = this.#latest;
    return extractSolution({
      submissionId: latest?.verdict.submissionId ?? `dom_${Date.now()}`,
      interceptedCode: latest?.submit?.code,
      interceptedLang: latest?.submit?.lang ?? latest?.verdict.lang,
      submittedAt: latest?.observedAt ?? new Date().toISOString(),
    });
  }

  /**
   * Dual-mode watcher: listens to network interception (postMessage) AND DOM MutationObserver.
   */
  watchSubmissions(onAccepted: (submissionId?: string) => void): () => void {
    const unsubs: Array<() => void> = [];

    // 1. Network interceptor bus
    unsubs.push(
      onVerdict((verdict, submit) => {
        this.#latest = { verdict, submit, observedAt: new Date().toISOString() };
        if (isAccepted(verdict.statusMsg)) onAccepted(verdict.submissionId);
      }),
    );

    // 2. DOM MutationObserver watcher (catches submissions if network intercept misses)
    unsubs.push(
      watchLeetCodeDom((submissionId) => {
        if (!this.#latest || !isAccepted(this.#latest.verdict.statusMsg)) {
          this.#latest = {
            verdict: {
              source: "dsahub/intercept",
              kind: "verdict",
              submissionId: submissionId ?? `dom_${Date.now()}`,
              statusMsg: LEETCODE.acceptedVerdict,
            },
            submit: undefined,
            observedAt: new Date().toISOString(),
          };
        }
        onAccepted(submissionId);
      }),
    );

    return () => {
      unsubs.forEach((fn) => fn());
    };
  }
}

