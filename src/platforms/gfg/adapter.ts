import type {
  CodingPlatformAdapter,
  ProblemMetadata,
  Solution,
  SubmissionStatus,
} from "@/platforms/core/types";
import type { SubmitEvent, VerdictEvent } from "@/content/intercept-protocol";
import { onVerdict } from "@/content/intercept-bus";
import { safeUrl } from "@/utils/url";
import { detectGfgAccepted, watchGfgDom } from "./dom";
import { extractSolutionAsync } from "./extractor";
import { readMetadata } from "./metadata";
import { isAccepted } from "./submission";
import { GFG } from "./selectors";

/**
 * Same shape as the LeetCode adapter and no shared platform code between them
 * (PRD §8) — only the core interface. Stateful for the same reason: PRD §8 fixes
 * `getSubmissionStatus()` and `getSubmittedSolution()` as no-argument calls, so the
 * submission they describe has to be remembered between verdict and question.
 */
export class GFGAdapter implements CodingPlatformAdapter {
  readonly platform = "gfg" as const;

  #latest: { verdict: VerdictEvent; submit: SubmitEvent | undefined; observedAt: string } | null =
    null;

  canHandle(url: string): boolean {
    return safeUrl(url)?.host === GFG.host;
  }

  isProblemPage(url: string): boolean {
    const parsed = safeUrl(url);
    return parsed?.host === GFG.host && GFG.problemPath.test(parsed.pathname);
  }

  getProblemMetadata(): Promise<ProblemMetadata> {
    const metadata = readMetadata(window.location);
    if (!metadata) {
      return Promise.reject(
        new Error(`Not on a GeeksforGeeks problem page: ${window.location.pathname}`),
      );
    }
    return Promise.resolve(metadata);
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

    // Fallback: check the DOM directly
    if (detectGfgAccepted()) {
      return Promise.resolve({
        accepted: true,
        raw: "Problem Solved Successfully",
        submissionId: `gfg_dom_${Date.now()}`,
      });
    }

    return Promise.resolve({ accepted: false });
  }

  getSubmittedSolution(): Promise<Solution> {
    const latest = this.#latest;
    if (!latest && !detectGfgAccepted()) {
      return Promise.reject(new Error("No GeeksforGeeks submission has been observed yet"));
    }
    return extractSolutionAsync({
      interceptedCode: latest?.submit?.code,
      interceptedLang: latest?.submit?.lang ?? latest?.verdict.lang,
      submittedAt: latest?.observedAt ?? new Date().toISOString(),
    });
  }

  /** Dual-mode watcher: network interceptor + DOM MutationObserver */
  watchSubmissions(onAccepted: (submissionId?: string) => void): () => void {
    const unsubs: Array<() => void> = [];

    // 1. Network bus
    unsubs.push(
      onVerdict((verdict, submit) => {
        this.#latest = { verdict, submit, observedAt: new Date().toISOString() };
        if (isAccepted(verdict.statusMsg)) onAccepted(verdict.submissionId);
      }),
    );

    // 2. DOM MutationObserver
    unsubs.push(
      watchGfgDom((submissionId) => {
        if (!this.#latest || !isAccepted(this.#latest.verdict.statusMsg)) {
          this.#latest = {
            verdict: {
              source: "dsahub/intercept",
              kind: "verdict",
              submissionId: submissionId ?? `gfg_dom_${Date.now()}`,
              statusMsg: "Problem Solved Successfully",
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

