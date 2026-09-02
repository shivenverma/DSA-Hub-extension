/**
 * GitHub OAuth identity and API endpoints.
 *
 * The **Device Flow** is used rather than the web application flow. The web flow
 * requires exchanging a `client_secret` for a token, which would mean shipping the
 * secret in the extension (extractable by anyone) or running a backend — and PRD §38
 * says MVP must not require one. Device Flow needs no secret, so the only identifier
 * here is the public client ID.
 *
 * It still comes from the build environment rather than being written into source, so
 * that a fork ships its own OAuth app without editing code (PRD §37 — nothing
 * credential-shaped is hardcoded). Set it in `.env.local`:
 *
 *     VITE_GITHUB_CLIENT_ID=Iv1.xxxxxxxxxxxxxxxx
 *
 * The OAuth app must have "Enable Device Flow" ticked in its settings, or the device
 * endpoint answers 404.
 */
export const GITHUB_CLIENT_ID: string = import.meta.env.VITE_GITHUB_CLIENT_ID ?? "";

export const GITHUB = {
  api: "https://api.github.com",
  deviceCodeUrl: "https://github.com/login/device/code",
  tokenUrl: "https://github.com/login/oauth/access_token",
  deviceGrantType: "urn:ietf:params:oauth:grant-type:device_code",

  /**
   * PRD §36 — minimum permissions.
   *
   * | Permission | Purpose | Data accessed | Reason required |
   * | --- | --- | --- | --- |
   * | `repo` | create the solutions repo and push commits to it | contents and metadata of the user's repositories | the default repo visibility is **private** (PRD §11), and `public_repo` cannot write to a private repository |
   *
   * Deliberately not requested: `user` (the `/user` endpoint returns login and
   * avatar with no scope at all), `gist`, `workflow`, `delete_repo`,
   * `read:org`.
   */
  scope: "repo",

  /** Sent on every request; GitHub pins response shapes to this version. */
  apiVersion: "2022-11-28",
} as const;
