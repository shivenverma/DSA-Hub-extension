import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Deliberately separate from vite.config.ts: the crx() plugin builds the extension
// (manifest rewriting, content-script bundling) and has no business running under tests.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/unit/**/*.test.ts"],
    // src/github/config.ts reads the OAuth client ID at module load, so it has to be
    // present before the first import. A test that needs it *absent* overrides this
    // with vi.stubEnv + vi.resetModules.
    env: { VITE_GITHUB_CLIENT_ID: "Iv1.testclientid" },
  },
});
