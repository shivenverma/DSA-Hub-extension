// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://leetcode.com/problems/two-sum/" }
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { INTERCEPT_SOURCE, type InterceptEvent } from "@/content/intercept-protocol";

/**
 * The interceptor's contract is negative: it must observe traffic without changing
 * anything the page sees. These tests pin that — a body the page can still read, a
 * response returned untouched, and no exception escaping into the page's promise
 * chain even when observation itself fails.
 *
 * The module installs its hooks at import time, keyed on the page host, so each test
 * imports it fresh after setting up the transport it wants to inspect.
 */
const SUBMIT_URL = "https://leetcode.com/problems/two-sum/submit/";
const CHECK_URL = "https://leetcode.com/submissions/detail/900001/check/";

const SUBMIT_RESPONSE = JSON.stringify({ submission_id: 900001 });
const SUBMIT_REQUEST = JSON.stringify({ lang: "python3", typed_code: "print(1)" });
const CHECK_RESPONSE = JSON.stringify({
  state: "SUCCESS",
  status_msg: "Accepted",
  pretty_lang: "Python3",
});

const SUBMIT_EVENT = {
  source: INTERCEPT_SOURCE,
  kind: "submit",
  submissionId: "900001",
  lang: "python3",
  code: "print(1)",
};

/**
 * The listener stays attached for the whole file. Attaching per test would let a
 * message posted by one test land in the next one's array — `postMessage` delivery
 * outlives the test that triggered it.
 */
const posted: InterceptEvent[] = [];
function listener(event: MessageEvent<unknown>): void {
  const data = event.data as InterceptEvent | undefined;
  if (data?.source === INTERCEPT_SOURCE) posted.push(data);
}

/** Lets queued `postMessage` tasks and the clone→text promise chain finish. */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

async function loadInterceptor(): Promise<void> {
  vi.resetModules();
  await import("@/content/page-interceptor");
}

beforeAll(() => window.addEventListener("message", listener));
afterAll(() => window.removeEventListener("message", listener));

beforeEach(async () => {
  await settle(); // drain anything still in flight from the previous test
  posted.length = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("fetch hook", () => {
  it("leaves the response body readable by the page", async () => {
    // The failure this guards: reading the body directly instead of a clone, which
    // makes the page's own .json() throw and breaks submission.
    vi.stubGlobal("fetch", () => Promise.resolve(new Response(SUBMIT_RESPONSE)));
    await loadInterceptor();

    const response = await window.fetch(SUBMIT_URL, { method: "POST", body: SUBMIT_REQUEST });

    expect(response.bodyUsed).toBe(false);
    await expect(response.json()).resolves.toEqual({ submission_id: 900001 });
  });

  it("forwards the page's arguments to the original untouched", async () => {
    const original = vi.fn(() => Promise.resolve(new Response(SUBMIT_RESPONSE)));
    vi.stubGlobal("fetch", original);
    await loadInterceptor();

    const init = { method: "POST", body: SUBMIT_REQUEST };
    await window.fetch(SUBMIT_URL, init);

    expect(original).toHaveBeenCalledOnce();
    expect(original).toHaveBeenCalledWith(SUBMIT_URL, init);
  });

  it("posts a submit event carrying the request's code", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(new Response(SUBMIT_RESPONSE)));
    await loadInterceptor();

    await window.fetch(SUBMIT_URL, { method: "POST", body: SUBMIT_REQUEST });
    await settle();

    expect(posted).toEqual([SUBMIT_EVENT]);
  });

  it("posts a verdict event from the check endpoint", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(new Response(CHECK_RESPONSE)));
    await loadInterceptor();

    await window.fetch(CHECK_URL);
    await settle();

    expect(posted).toEqual([
      {
        source: INTERCEPT_SOURCE,
        kind: "verdict",
        submissionId: "900001",
        statusMsg: "Accepted",
        lang: "Python3",
      },
    ]);
  });

  it("never clones or reports unrelated traffic", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(new Response("{}")));
    await loadInterceptor();

    await window.fetch("https://leetcode.com/graphql");
    await window.fetch("https://leetcode.com/problems/two-sum/interpret_solution/");
    await settle();

    expect(posted).toEqual([]);
  });

  it("still resolves when reading the body fails", async () => {
    // A body that cannot be read must cost us the observation, not the page's request.
    const unreadable = new Response(SUBMIT_RESPONSE);
    vi.spyOn(unreadable, "clone").mockImplementation(() => {
      throw new Error("clone unavailable");
    });
    vi.stubGlobal("fetch", () => Promise.resolve(unreadable));
    await loadInterceptor();

    await expect(window.fetch(SUBMIT_URL, { method: "POST", body: SUBMIT_REQUEST })).resolves.toBe(
      unreadable,
    );
    await settle();
    expect(posted).toEqual([]);
  });

  it("propagates a network failure unchanged", async () => {
    const failure = new TypeError("Failed to fetch");
    vi.stubGlobal("fetch", () => Promise.reject(failure));
    await loadInterceptor();

    await expect(window.fetch(SUBMIT_URL)).rejects.toBe(failure);
  });

  it("accepts a URL object, not just a string", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(new Response(SUBMIT_RESPONSE)));
    await loadInterceptor();

    await window.fetch(new URL(SUBMIT_URL));
    await settle();

    expect(posted).toHaveLength(1);
  });
});

describe("XHR hook", () => {
  /**
   * Minimal stand-in — jsdom's real XHR would need a live server. Built fresh per
   * test so each one patches a virgin prototype; a shared class would accumulate a
   * patch per import and report every submission twice.
   */
  function fakeXhrClass() {
    const opened: unknown[][] = [];
    const sent: unknown[][] = [];

    class FakeXhr extends EventTarget {
      responseText = "";

      open(...args: unknown[]): void {
        opened.push(args);
      }
      send(...args: unknown[]): void {
        sent.push(args);
      }
      /** Simulates the browser finishing the request. */
      finish(responseText: string): void {
        this.responseText = responseText;
        this.dispatchEvent(new Event("load"));
      }
    }

    return { FakeXhr, opened, sent };
  }

  async function loadWithFakeXhr() {
    const fake = fakeXhrClass();
    vi.stubGlobal("XMLHttpRequest", fake.FakeXhr);
    vi.stubGlobal("fetch", () => Promise.resolve(new Response("{}")));
    await loadInterceptor();
    return { ...fake, xhr: new fake.FakeXhr() };
  }

  it("reports a submit sent over XHR", async () => {
    const { xhr } = await loadWithFakeXhr();

    xhr.open("POST", SUBMIT_URL);
    xhr.send(SUBMIT_REQUEST);
    xhr.finish(SUBMIT_RESPONSE);
    await settle();

    expect(posted).toEqual([SUBMIT_EVENT]);
  });

  it("forwards open and send arguments to the originals", async () => {
    const { xhr, opened, sent } = await loadWithFakeXhr();

    xhr.open("POST", SUBMIT_URL, true);
    xhr.send(SUBMIT_REQUEST);

    expect(opened).toEqual([["POST", SUBMIT_URL, true]]);
    expect(sent).toEqual([[SUBMIT_REQUEST]]);
  });

  it("stays quiet for unrelated XHR traffic", async () => {
    const { xhr } = await loadWithFakeXhr();

    xhr.open("GET", "https://leetcode.com/graphql");
    xhr.send(null);
    xhr.finish(SUBMIT_RESPONSE);
    await settle();

    expect(posted).toEqual([]);
  });

  it("survives a responseText that throws", async () => {
    // Happens for binary responseTypes; must not surface as a page error.
    const { xhr } = await loadWithFakeXhr();
    Object.defineProperty(xhr, "responseText", {
      get() {
        throw new Error("InvalidStateError");
      },
    });

    xhr.open("POST", SUBMIT_URL);
    xhr.send(SUBMIT_REQUEST);
    expect(() => xhr.dispatchEvent(new Event("load"))).not.toThrow();
    await settle();

    expect(posted).toEqual([]);
  });
});
