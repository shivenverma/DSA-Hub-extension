/// <reference types="vite/client" />

/**
 * Declaring the variable makes it a typed `string | undefined` instead of the `any`
 * that `ImportMetaEnv`'s index signature hands back. See src/github/config.ts for why
 * the client ID comes from the environment at all.
 */
interface ImportMetaEnv {
  readonly VITE_GITHUB_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
