// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { onVerdict, resetBus } from "@/content/intercept-bus";
import {
  INTERCEPT_SOURCE,
  type SubmitEvent,
  type VerdictEvent,
} from "@/content/intercept-protocol";

function submit(submissionId: string, code: string, lang = "cpp"): SubmitEvent {
  return { source: INTERCEPT_SOURCE, kind: "submit", submissionId, code, lang };
}

function verdict(submissionId: string, statusMsg = "Accepted"): VerdictEvent {
  return { source: INTERCEPT_SOURCE, kind: "verdict", submissionId, statusMsg };
}

/** Mimics the MAIN world posting into the page. */
function post(payload: unknown): void {
  window.dispatchEvent(
    new MessageEvent("message", { data: payload, origin: window.location.origin }),
  );
}

afterEach(() => {
  resetBus();
});

describe("intercept bus", () => {
  it("pairs a verdict with the submit that produced it", () => {
    const seen = vi.fn();
    onVerdict(seen);

    post(submit("100", "int a;"));
    post(verdict("100"));

    expect(seen).toHaveBeenCalledOnce();
    expect(seen.mock.calls[0]?.[1]).toMatchObject({ code: "int a;" });
  });

  it("pairs by id, not by recency, when two submissions overlap", () => {
    // The failure this prevents: user submits A then B, A's verdict lands second,
    // and a recency-based pairing commits B's code under A's Accepted verdict.
    const seen = vi.fn();
    onVerdict(seen);

    post(submit("100", "first"));
    post(submit("200", "second"));
    post(verdict("200"));
    post(verdict("100"));

    expect(seen.mock.calls[0]?.[1]).toMatchObject({ submissionId: "200", code: "second" });
    expect(seen.mock.calls[1]?.[1]).toMatchObject({ submissionId: "100", code: "first" });
  });

  it("still delivers a verdict whose submit was never seen", () => {
    // The extractor recovers the code from the API in this case.
    const seen = vi.fn();
    onVerdict(seen);

    post(verdict("999"));

    expect(seen).toHaveBeenCalledOnce();
    expect(seen.mock.calls[0]?.[1]).toBeUndefined();
  });

  it("delivers non-accepted verdicts too, so callers can explain the skip", () => {
    const seen = vi.fn();
    onVerdict(seen);

    post(submit("100", "int a;"));
    post(verdict("100", "Wrong Answer"));

    expect(seen.mock.calls[0]?.[0]).toMatchObject({ statusMsg: "Wrong Answer" });
  });

  it("consumes a submit so a replayed verdict cannot re-fire with stale code", () => {
    const seen = vi.fn();
    onVerdict(seen);

    post(submit("100", "int a;"));
    post(verdict("100"));
    post(verdict("100"));

    expect(seen).toHaveBeenCalledTimes(2);
    expect(seen.mock.calls[1]?.[1]).toBeUndefined();
  });

  it("bounds pending submits over a long session", () => {
    const seen = vi.fn();
    onVerdict(seen);

    for (let i = 0; i < 30; i += 1) post(submit(String(i), `code ${i}`));

    // The oldest were evicted; the newest are still pairable.
    post(verdict("0"));
    expect(seen.mock.calls[0]?.[1]).toBeUndefined();
    post(verdict("29"));
    expect(seen.mock.calls[1]?.[1]).toMatchObject({ code: "code 29" });
  });

  it("ignores foreign and malformed messages", () => {
    const seen = vi.fn();
    onVerdict(seen);

    post({ source: "some-other-extension", kind: "verdict", submissionId: "1" });
    post({ source: INTERCEPT_SOURCE, kind: "nonsense" });
    post("a string");
    post(null);

    expect(seen).not.toHaveBeenCalled();
  });

  it("ignores messages from a different origin", () => {
    const seen = vi.fn();
    onVerdict(seen);

    window.dispatchEvent(
      new MessageEvent("message", { data: verdict("1"), origin: "https://evil.example" }),
    );

    expect(seen).not.toHaveBeenCalled();
  });

  it("stops delivering after unsubscribe", () => {
    const seen = vi.fn();
    const stop = onVerdict(seen);
    stop();

    post(verdict("100"));

    expect(seen).not.toHaveBeenCalled();
  });
});
