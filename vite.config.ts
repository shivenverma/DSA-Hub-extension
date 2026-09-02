import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.json" with { type: "json" };

/**
 * crxjs always writes `"use_dynamic_url": false` into every `web_accessible_resources`
 * entry. Chrome (≥116) rejects the manifest with "Invalid match pattern" when this field
 * is present and set to `false` on a static WAR entry. Stripping it is safe — the field
 * defaults to false, so omitting it keeps the same semantics.
 */
function fixManifestPlugin(): Plugin {
  return {
    name: "dsahub:fix-manifest",
    apply: "build",
    enforce: "post",
    // crxjs writes manifest.json to disk after generateBundle, so we patch the file
    // directly in writeBundle (which runs after all assets have been written).
    async writeBundle(opts) {
      const { readFile, writeFile } = await import("node:fs/promises");
      const outDir = opts.dir ?? "dist";
      const manifestPath = `${outDir}/manifest.json`;
      try {
        const raw = await readFile(manifestPath, "utf-8");
        const parsed = JSON.parse(raw) as {
          web_accessible_resources?: Array<Record<string, unknown>>;
        };
        parsed.web_accessible_resources?.forEach((entry) => {
          delete entry["use_dynamic_url"];
        });
        await writeFile(manifestPath, JSON.stringify(parsed, null, 2) + "\n", "utf-8");
      } catch {
        // Leave the manifest untouched if anything fails.
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), crx({ manifest }), fixManifestPlugin()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  build: {
    target: "esnext",
    // Off deliberately. crxjs lists every content-script chunk in
    // `web_accessible_resources`, and its `.map` siblings go with them — which would publish
    // DSAHub's full source to leetcode.com and geeksforgeeks.org, and inflate the store
    // package. Turn it back on for one build if you need to debug `dist/`.
    sourcemap: false,
    emptyOutDir: true,
    rollupOptions: {
      // Explicitly include page-interceptor as a named entry so it is built and emitted
      // to a stable path that chrome.runtime.getURL() can reference from content.ts.
      // crxjs cannot generate a working MAIN-world loader (chrome.runtime is unavailable
      // there), so we removed it from content_scripts and inject it ourselves.
      input: {
        "assets/page-interceptor": fileURLToPath(
          new URL("./src/content/page-interceptor.ts", import.meta.url),
        ),
      },
      output: {
        entryFileNames: (chunk) => {
          // Keep the stable name for our manually-added entry; let crxjs chunks hash freely.
          if (chunk.name === "assets/page-interceptor") return "assets/page-interceptor.js";
          return "assets/[name]-[hash].js";
        },
        chunkFileNames: "assets/[name]-[hash].js",
      },
    },
  },
});
