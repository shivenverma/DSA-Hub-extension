/**
 * Checks the built extension before it is loaded or packaged.
 *
 * `vite build` proves the code compiles. It does not prove the manifest still points at
 * files that exist, that a permission did not creep in, or that nothing credential-shaped
 * ended up in a bundle — and all three of those are only visible after the build, which is
 * why this is a postbuild step rather than a test.
 *
 * Runs automatically as part of `npm run build`.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
import { loadEnv } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const dist = join(root, "dist");
const problems = [];
const fail = (message) => problems.push(message);

if (!existsSync(join(dist, "manifest.json"))) {
  console.error("dist/manifest.json is missing. Run `npm run build` first.");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(join(dist, "manifest.json"), "utf8"));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

// --------------------------------------------------------------------------- the manifest

if (manifest.manifest_version !== 3) fail(`manifest_version is ${manifest.manifest_version}, not 3`);
if (!/^\d+(\.\d+){0,3}$/.test(manifest.version ?? "")) fail(`version "${manifest.version}" is not 1-4 dot-separated integers`);
// The store reads the manifest and humans read package.json. Bumping one and not the other
// leaves "which version is this" with two answers.
if (manifest.version !== pkg.version) fail(`manifest version ${manifest.version} != package.json ${pkg.version}`);
if (!manifest.icons?.["128"]) fail("no 128px icon — the Web Store requires one");

/**
 * PRD §52: only what current functionality needs. Kept as an exact set rather than a
 * maximum, so *removing* a feature without removing its permission also fails here.
 */
const EXPECTED_PERMISSIONS = ["alarms", "notifications", "storage"];
const EXPECTED_HOSTS = ["https://api.github.com/*", "https://github.com/*"];

const asSet = (values) => [...(values ?? [])].sort().join(", ");
if (asSet(manifest.permissions) !== EXPECTED_PERMISSIONS.join(", ")) {
  fail(`permissions are [${asSet(manifest.permissions)}], expected [${EXPECTED_PERMISSIONS.join(", ")}]`);
}
if (asSet(manifest.host_permissions) !== EXPECTED_HOSTS.join(", ")) {
  fail(`host_permissions are [${asSet(manifest.host_permissions)}], expected [${EXPECTED_HOSTS.join(", ")}]`);
}
// No separate `<all_urls>` check: an exact-set comparison already rejects anything that is
// not one of the two hosts above, wildcards included.

// Every path the manifest names has to be in the package. A renamed chunk that the manifest
// still references installs fine and then does nothing, with no error anywhere.
const referenced = [
  manifest.background?.service_worker,
  manifest.action?.default_popup,
  ...Object.values(manifest.icons ?? {}),
  ...(manifest.content_scripts ?? []).flatMap((script) => [...(script.js ?? []), ...(script.css ?? [])]),
  ...(manifest.web_accessible_resources ?? []).flatMap((entry) => entry.resources ?? []),
].filter(Boolean);

for (const path of referenced) {
  if (!existsSync(join(dist, path))) fail(`manifest references ${path}, which is not in dist/`);
}

// ------------------------------------------------------------------------------- the files

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else yield path;
  }
}

/**
 * PRD §37 and Rule 13. The same shapes `logger.ts` redacts, looked for in the shipped
 * bytes — a token that got hardcoded, or a fixture that carried a real one into a bundle.
 */
const TOKEN_SHAPE = /\b(?:gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{16,})/;

/** MV3 forbids remotely-hosted code: no bundle may load a script from off-package. */
const REMOTE_CODE = /(?:import\s*\(\s*|src\s*=\s*)["'`]https?:\/\//;

for (const file of files(dist)) {
  const name = relative(dist, file).replaceAll("\\", "/");
  if (name.endsWith(".map")) {
    fail(`${name} is a sourcemap; a production build should not ship one`);
    continue;
  }
  if (!/\.(js|json|html|css)$/.test(name)) continue;

  const text = readFileSync(file, "utf8");
  if (TOKEN_SHAPE.test(text)) fail(`${name} contains something token-shaped`);
  if (REMOTE_CODE.test(text)) fail(`${name} loads code from a URL, which MV3 forbids`);
}

// --------------------------------------------------------------- the build environment

/**
 * A package with no client ID installs, loads, and intercepts submissions — and then
 * refuses at the one step that makes it useful, with the failure only visible in the
 * popup after Connect (`auth.ts` → `startDeviceFlow`). Calling that build "ok" is
 * exactly the partial-success-as-success Rule 14 forbids, so it is said out loud here.
 *
 * `loadEnv` rather than reading `.env.local` by hand: it resolves the same file
 * precedence Vite used for the build, including a prefixed variable passed in the shell.
 * Only presence is reported — the value is public by design, but printing it is no use
 * to anyone.
 */
const clientId = loadEnv("production", root, "VITE_").VITE_GITHUB_CLIENT_ID ?? "";
const warnings = clientId
  ? []
  : [
      "no VITE_GITHUB_CLIENT_ID in the build environment — this package cannot connect a " +
        "GitHub account. Copy .env.example to .env.local, set it, and rebuild.",
    ];

// ----------------------------------------------------------------------------------- report

if (problems.length > 0) {
  console.error(`dist/ failed validation:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}

const total = [...files(dist)].reduce((bytes, file) => bytes + statSync(file).size, 0);
console.log(`dist/ ok — MV3, ${String(referenced.length)} referenced files present, ${(total / 1024).toFixed(0)} kB`);
for (const warning of warnings) console.warn(`warning: ${warning}`);
