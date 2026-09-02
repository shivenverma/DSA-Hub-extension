/**
 * GitHub Device Flow.
 *
 * Why the device flow and not the web flow: the web flow's token exchange needs a
 * `client_secret`, which in an extension is either shipped to every user or held by a
 * backend PRD §38 says we must not require. The device flow needs no secret — the user
 * types a short code on github.com and we poll for the result.
 *
 * Why the polling lives in the service worker, driven by `chrome.alarms`: authorising
 * *requires* the user to leave DSAHub for github.com, which closes the popup and
 * destroys any timer it started. The worker is also evicted while idle, so the poll
 * state is kept in storage and each alarm tick is a fresh, self-contained attempt.
 *
 * ## Security (PRD §37)
 *
 * Nothing in this file logs. Not the `device_code` (a bearer of the pending
 * authorization), not the `access_token`, not a response body that could contain
 * either — GitHub echoes the device code in some error responses. `describe()` exists
 * so callers have something safe to show, and it never touches either field. The
 * token is written straight to `chrome.storage.local` and read only by the client.
 */
import { GITHUB, GITHUB_CLIENT_ID } from "./config";
import type { AuthState } from "@/storage/storage";
import { get, set } from "@/storage/storage";
import { GitHubClient, GitHubError } from "./client";

export const AUTH_ALARM = "dsahub-auth-poll";

/** What the user needs on screen while authorising. Deliberately carries no secret. */
export interface DeviceChallenge {
  userCode: string;
  verificationUri: string;
  /** Epoch ms. */
  expiresAt: number;
}

export type AuthProgress =
  | { status: "pending"; challenge: DeviceChallenge }
  | { status: "connected"; login: string; avatarUrl?: string }
  | { status: "expired" }
  | { status: "denied" }
  | { status: "idle" };

/**
 * The in-flight authorization. Held in storage, not memory, because the worker is
 * evicted between alarm ticks.
 *
 * `deviceCode` is a credential: whoever holds it can claim the token the user is
 * about to grant. It lives here only until the flow ends, and is never logged or sent
 * anywhere but GitHub's token endpoint.
 */
interface PendingAuth extends DeviceChallenge {
  deviceCode: string;
  /** Seconds GitHub asked us to wait between polls; grows on `slow_down`. */
  intervalSeconds: number;
  /** Epoch ms of the earliest permitted next poll. */
  nextPollAt: number;
}

const PENDING_KEY = "pendingAuth";

async function readPending(): Promise<PendingAuth | null> {
  const stored = await chrome.storage.local.get<Record<string, PendingAuth>>(PENDING_KEY);
  return stored[PENDING_KEY] ?? null;
}

async function writePending(pending: PendingAuth | null): Promise<void> {
  if (pending) await chrome.storage.local.set({ [PENDING_KEY]: pending });
  else await chrome.storage.local.remove(PENDING_KEY);
}

/**
 * Step 1: ask GitHub for a device code and start the polling alarm.
 *
 * The alarm period is 30 seconds. Chrome clamps sub-minute periods on older builds,
 * and GitHub's suggested interval is 5 seconds, so this is slower than the protocol
 * allows — acceptable because the code lives 15 minutes, and because the popup calls
 * `pollOnce()` directly whenever it opens, which covers the case the user cares
 * about: coming straight back after clicking "Authorize".
 */
export async function startDeviceFlow(): Promise<DeviceChallenge> {
  if (!GITHUB_CLIENT_ID) {
    throw new GitHubError(
      "AUTH_FAILED",
      "This build of DSAHub has no GitHub OAuth client ID. Set VITE_GITHUB_CLIENT_ID " +
        "and rebuild — see docs/VERIFY-github.md.",
      false,
    );
  }

  const body = await postForm(GITHUB.deviceCodeUrl, {
    client_id: GITHUB_CLIENT_ID,
    scope: GITHUB.scope,
  });

  const deviceCode = str(body, "device_code");
  const userCode = str(body, "user_code");
  const verificationUri = str(body, "verification_uri");
  if (!deviceCode || !userCode || !verificationUri) {
    throw new GitHubError(
      "AUTH_FAILED",
      "GitHub did not start the sign-in. If this keeps happening, the OAuth app may not " +
        "have Device Flow enabled.",
      false,
    );
  }

  const intervalSeconds = num(body, "interval") ?? 5;
  const expiresAt = Date.now() + (num(body, "expires_in") ?? 900) * 1000;

  await writePending({
    deviceCode,
    userCode,
    verificationUri,
    expiresAt,
    intervalSeconds,
    nextPollAt: Date.now() + intervalSeconds * 1000,
  });
  await chrome.alarms.create(AUTH_ALARM, { periodInMinutes: 0.5 });

  return { userCode, verificationUri, expiresAt };
}

/**
 * One polling attempt. Safe to call from the alarm and from the popup; the
 * `nextPollAt` floor keeps the two from together exceeding GitHub's rate limit, which
 * answers `slow_down` and then refuses.
 */
export async function pollOnce(): Promise<AuthProgress> {
  const pending = await readPending();
  if (!pending) return currentProgress();

  if (Date.now() > pending.expiresAt) {
    await endFlow();
    return { status: "expired" };
  }
  if (Date.now() < pending.nextPollAt) {
    return { status: "pending", challenge: challengeOf(pending) };
  }

  const body = await postForm(GITHUB.tokenUrl, {
    client_id: GITHUB_CLIENT_ID,
    device_code: pending.deviceCode,
    grant_type: GITHUB.deviceGrantType,
  });

  const token = str(body, "access_token");
  if (token) {
    const auth = await identify(token, str(body, "scope") ?? GITHUB.scope);
    await set("auth", auth);
    await endFlow();
    return { status: "connected", login: auth.login, avatarUrl: auth.avatarUrl };
  }

  // Only these four are defined by the spec; anything else is treated as fatal rather
  // than retried forever against a code that will never be granted.
  switch (str(body, "error")) {
    case "authorization_pending":
      await writePending({ ...pending, nextPollAt: Date.now() + pending.intervalSeconds * 1000 });
      return { status: "pending", challenge: challengeOf(pending) };

    case "slow_down": {
      // GitHub's own guidance: add 5s to the interval, not a multiplier.
      const intervalSeconds = pending.intervalSeconds + 5;
      await writePending({
        ...pending,
        intervalSeconds,
        nextPollAt: Date.now() + intervalSeconds * 1000,
      });
      return { status: "pending", challenge: challengeOf(pending) };
    }

    case "access_denied":
      await endFlow();
      return { status: "denied" };

    case "expired_token":
    default:
      await endFlow();
      return { status: "expired" };
  }
}

/** What the popup shows when it opens: connected, mid-flow, or nothing yet. */
export async function currentProgress(): Promise<AuthProgress> {
  const auth = await get("auth");
  if (auth) return { status: "connected", login: auth.login, avatarUrl: auth.avatarUrl };

  const pending = await readPending();
  if (!pending) return { status: "idle" };
  if (Date.now() > pending.expiresAt) {
    await endFlow();
    return { status: "expired" };
  }
  return { status: "pending", challenge: challengeOf(pending) };
}

/**
 * Forgets the token locally. It is *not* revoked at GitHub: revocation needs the
 * client secret we deliberately do not have. The UI must therefore point the user at
 * their GitHub settings, rather than implying the grant is gone.
 */
export async function disconnect(): Promise<void> {
  await endFlow();
  await chrome.storage.local.remove("auth");
}

/** Stops the flow: drops the device code and the alarm together. */
async function endFlow(): Promise<void> {
  await writePending(null);
  await chrome.alarms.clear(AUTH_ALARM);
}

/**
 * Confirms the token works and captures who it belongs to, before it is stored. A
 * token that cannot read `/user` is not a connection, and storing it would leave the
 * UI claiming a connection that fails on the first sync (Rule 14).
 */
async function identify(token: string, scope: string): Promise<AuthState> {
  const user = await new GitHubClient(token).getUser();
  return {
    accessToken: token,
    scope,
    login: user.login,
    avatarUrl: user.avatar_url,
    connectedAt: new Date().toISOString(),
  };
}

function challengeOf(pending: PendingAuth): DeviceChallenge {
  return {
    userCode: pending.userCode,
    verificationUri: pending.verificationUri,
    expiresAt: pending.expiresAt,
  };
}

/**
 * Both device-flow endpoints take form bodies and answer JSON when asked. They also
 * answer HTTP 200 for protocol errors like `authorization_pending`, so the body is
 * what matters, not the status.
 */
async function postForm(url: string, fields: Record<string, string>): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields).toString(),
    });
  } catch {
    throw new GitHubError(
      "NETWORK_ERROR",
      "Could not reach GitHub to sign in. Check your connection and try again.",
      true,
    );
  }

  if (!response.ok && response.status >= 500) {
    throw new GitHubError(
      "AUTH_FAILED",
      "GitHub is having trouble signing you in right now. Try again in a minute.",
      true,
      response.status,
    );
  }

  try {
    return await response.json();
  } catch {
    // Never include the body: GitHub echoes the device code in some error responses.
    throw new GitHubError(
      "AUTH_FAILED",
      "GitHub's sign-in response could not be read. Try connecting again.",
      false,
      response.status,
    );
  }
}

function str(value: unknown, key: string): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const raw = (value as Record<string, unknown>)[key];
  return typeof raw === "string" && raw.length > 0 ? raw : undefined;
}

function num(value: unknown, key: string): number | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const raw = (value as Record<string, unknown>)[key];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
}
