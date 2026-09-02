import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_ALARM,
  currentProgress,
  disconnect,
  pollOnce,
  startDeviceFlow,
} from "@/github/auth";
import { GitHubError } from "@/github/client";

/**
 * The device flow's failure modes are all invisible: a code that expires, a user who
 * cancels, a poll that runs too fast and gets throttled. Each one has to leave the
 * extension in a state the popup can explain, and none of them may leak the
 * `device_code` or `access_token` (PRD §37).
 */
const DEVICE_CODE = "3584d83530557fdd1f46af8289938c8ef79f9dc5";
const USER_CODE = "WDJB-MJHT";
const TOKEN = "gho_16C7e42F292c6912E7710c838347Ae178B4a";

/** Minimal in-memory chrome.storage.local + alarms, since neither exists in node. */
function fakeChrome() {
  const store = new Map<string, unknown>();
  const alarms = new Set<string>();

  const local = {
    get: (keys: string | string[]) => {
      const wanted = typeof keys === "string" ? [keys] : keys;
      const out: Record<string, unknown> = {};
      for (const key of wanted) if (store.has(key)) out[key] = store.get(key);
      return Promise.resolve(out);
    },
    set: (items: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(items)) store.set(key, value);
      return Promise.resolve();
    },
    remove: (key: string) => {
      store.delete(key);
      return Promise.resolve();
    },
  };

  vi.stubGlobal("chrome", {
    storage: { local },
    alarms: {
      create: (name: string) => {
        alarms.add(name);
        return Promise.resolve();
      },
      clear: (name: string) => {
        alarms.delete(name);
        return Promise.resolve(true);
      },
    },
  });

  return { store, alarms };
}

/** Queues responses in the order the flow will consume them. */
function queueResponses(...bodies: Array<Record<string, unknown> | Response>) {
  const spy = vi.fn(() => {
    const body = bodies.shift() ?? { error: "authorization_pending" };
    if (body instanceof Response) return Promise.resolve(body);
    return Promise.resolve(
      new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } }),
    );
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

/** A response the flow cannot parse — e.g. the `/user` call rejecting the new token. */
const httpStatus = (status: number) => new Response("nope", { status });

const deviceCodeBody = {
  device_code: DEVICE_CODE,
  user_code: USER_CODE,
  verification_uri: "https://github.com/login/device",
  expires_in: 900,
  interval: 5,
};

let chromeState: ReturnType<typeof fakeChrome>;

beforeEach(() => {
  chromeState = fakeChrome();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("startDeviceFlow", () => {
  it("returns the code to display and schedules the background poll", async () => {
    queueResponses(deviceCodeBody);

    const challenge = await startDeviceFlow();

    expect(challenge.userCode).toBe(USER_CODE);
    expect(challenge.verificationUri).toBe("https://github.com/login/device");
    expect(challenge.expiresAt).toBeGreaterThan(Date.now());
    // The alarm, not a popup timer: authorizing means leaving for github.com.
    expect(chromeState.alarms.has(AUTH_ALARM)).toBe(true);
  });

  it("does not hand the device code to the caller", async () => {
    // The challenge crosses into the popup and is rendered; a bearer of the pending
    // authorization has no business there.
    queueResponses(deviceCodeBody);
    const challenge = await startDeviceFlow();
    expect(JSON.stringify(challenge)).not.toContain(DEVICE_CODE);
  });

  it("posts a form body with the client id and the repo scope only", async () => {
    const spy = queueResponses(deviceCodeBody);
    await startDeviceFlow();

    const [url, init] = spy.mock.calls[0] as unknown as [string, { body: string }];
    expect(url).toBe("https://github.com/login/device/code");
    expect(init.body).toBe("client_id=Iv1.testclientid&scope=repo");
  });

  it("explains a build with no client id instead of calling GitHub", async () => {
    vi.stubEnv("VITE_GITHUB_CLIENT_ID", "");
    vi.resetModules();
    const spy = queueResponses(deviceCodeBody);
    const fresh = await import("@/github/auth");

    await expect(fresh.startDeviceFlow()).rejects.toMatchObject({ code: "AUTH_FAILED" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("reports a device endpoint that answers without a code", async () => {
    // What an OAuth app without "Enable Device Flow" ticked actually looks like.
    queueResponses({ error: "Not Found" });
    await expect(startDeviceFlow()).rejects.toBeInstanceOf(GitHubError);
  });
});

describe("pollOnce", () => {
  /** Starts a flow and lets its first poll interval elapse. */
  async function armedFlow(): Promise<void> {
    queueResponses(deviceCodeBody);
    await startDeviceFlow();
    vi.setSystemTime(Date.now() + 6000);
  }

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  it("stays pending while the user has not authorized yet", async () => {
    await armedFlow();
    queueResponses({ error: "authorization_pending" });

    const progress = await pollOnce();

    expect(progress).toEqual({
      status: "pending",
      challenge: {
        userCode: USER_CODE,
        verificationUri: "https://github.com/login/device",
        expiresAt: expect.any(Number) as number,
      },
    });
  });

  it("stores the connection once GitHub grants the token", async () => {
    await armedFlow();
    // Token response, then the /user call that confirms who it belongs to.
    queueResponses({ access_token: TOKEN, scope: "repo" }, { login: "octocat", avatar_url: "a.png" });

    const progress = await pollOnce();

    expect(progress).toEqual({ status: "connected", login: "octocat", avatarUrl: "a.png" });
    expect(chromeState.store.get("auth")).toMatchObject({
      accessToken: TOKEN,
      scope: "repo",
      login: "octocat",
    });
  });

  it("ends the flow on success, so a replayed device code cannot re-authorize", async () => {
    await armedFlow();
    queueResponses({ access_token: TOKEN, scope: "repo" }, { login: "octocat" });
    await pollOnce();

    expect(chromeState.store.has("pendingAuth")).toBe(false);
    expect(chromeState.alarms.has(AUTH_ALARM)).toBe(false);
  });

  it("refuses to store a token that cannot identify itself", async () => {
    // Storing it would leave the UI claiming a connection that fails on first sync
    // — reporting partial success as success (Rule 14).
    await armedFlow();
    queueResponses({ access_token: TOKEN, scope: "repo" }, httpStatus(401));

    await expect(pollOnce()).rejects.toBeInstanceOf(GitHubError);
    expect(chromeState.store.has("auth")).toBe(false);
  });

  it("backs off by five seconds on slow_down", async () => {
    await armedFlow();
    queueResponses({ error: "slow_down" });
    await pollOnce();

    // The next attempt is refused locally rather than sent — that is the back-off.
    const spy = queueResponses({ error: "authorization_pending" });
    await pollOnce();
    expect(spy).not.toHaveBeenCalled();

    vi.setSystemTime(Date.now() + 11_000);
    await pollOnce();
    expect(spy).toHaveBeenCalledOnce();
  });

  it("honours the interval between polls", async () => {
    queueResponses(deviceCodeBody);
    await startDeviceFlow();

    const spy = queueResponses({ error: "authorization_pending" });
    await expect(pollOnce()).resolves.toMatchObject({ status: "pending" });
    expect(spy).not.toHaveBeenCalled(); // 5s has not passed
  });

  it("reports a cancelled authorization as denied and stops", async () => {
    await armedFlow();
    queueResponses({ error: "access_denied" });

    await expect(pollOnce()).resolves.toEqual({ status: "denied" });
    expect(chromeState.alarms.has(AUTH_ALARM)).toBe(false);
  });

  it("reports an expired code and stops polling", async () => {
    await armedFlow();
    queueResponses({ error: "expired_token" });

    await expect(pollOnce()).resolves.toEqual({ status: "expired" });
    expect(chromeState.store.has("pendingAuth")).toBe(false);
  });

  it("gives up locally once the code's lifetime has passed", async () => {
    await armedFlow();
    vi.setSystemTime(Date.now() + 901_000);
    const spy = queueResponses({ error: "expired_token" });

    await expect(pollOnce()).resolves.toEqual({ status: "expired" });
    // No request: the code is known-dead, so spending a poll on it is pointless.
    expect(spy).not.toHaveBeenCalled();
  });

  it("treats an unrecognised error as expired rather than polling forever", async () => {
    await armedFlow();
    queueResponses({ error: "incorrect_device_code" });

    await expect(pollOnce()).resolves.toEqual({ status: "expired" });
    expect(chromeState.alarms.has(AUTH_ALARM)).toBe(false);
  });

  it("is a no-op when no flow is in progress", async () => {
    const spy = queueResponses({ error: "authorization_pending" });
    await expect(pollOnce()).resolves.toEqual({ status: "idle" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("logs neither the device code nor the token", async () => {
    const sinks = (["log", "info", "warn", "error", "debug"] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => undefined),
    );
    await armedFlow();
    queueResponses({ access_token: TOKEN, scope: "repo" }, { login: "octocat" });
    await pollOnce();

    const written = sinks
      .flatMap((sink) => sink.mock.calls.flat() as unknown[])
      .map((arg) => JSON.stringify(arg) ?? "")
      .join(" ");
    expect(written).not.toContain(TOKEN);
    expect(written).not.toContain(DEVICE_CODE);
  });
});

describe("currentProgress", () => {
  it("reports a stored connection", async () => {
    await chrome.storage.local.set({
      auth: { accessToken: TOKEN, scope: "repo", login: "octocat", connectedAt: "now" },
    });
    await expect(currentProgress()).resolves.toEqual({
      status: "connected",
      login: "octocat",
      avatarUrl: undefined,
    });
  });

  it("resumes a flow that is still alive, so reopening the popup does not restart it", async () => {
    queueResponses(deviceCodeBody);
    await startDeviceFlow();

    await expect(currentProgress()).resolves.toMatchObject({
      status: "pending",
      challenge: { userCode: USER_CODE },
    });
  });

  it("cleans up a flow that died while the popup was closed", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    queueResponses(deviceCodeBody);
    await startDeviceFlow();
    vi.setSystemTime(Date.now() + 901_000);

    await expect(currentProgress()).resolves.toEqual({ status: "expired" });
    expect(chromeState.alarms.has(AUTH_ALARM)).toBe(false);
  });

  it("reports idle on a fresh install", async () => {
    await expect(currentProgress()).resolves.toEqual({ status: "idle" });
  });
});

describe("disconnect", () => {
  it("forgets the token and any flow in progress", async () => {
    queueResponses(deviceCodeBody);
    await startDeviceFlow();
    await chrome.storage.local.set({ auth: { accessToken: TOKEN } });

    await disconnect();

    expect(chromeState.store.has("auth")).toBe(false);
    expect(chromeState.store.has("pendingAuth")).toBe(false);
    expect(chromeState.alarms.has(AUTH_ALARM)).toBe(false);
  });
});
