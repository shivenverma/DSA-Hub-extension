import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "eslint.config.js"] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // PRD Rule 2 / §8, enforced mechanically: the GitHub, sync, README and
    // categorization layers operate on the normalized model only. If this rule ever
    // fires, platform-specific logic is leaking out of its adapter.
    files: ["src/github/**", "src/sync/**", "src/readme/**", "src/categorization/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/platforms/leetcode/**", "**/platforms/gfg/**"],
              message:
                "Platform-specific code must not leak into the GitHub/sync/readme/categorization layers (PRD Rule 2). Depend on platforms/core types instead.",
            },
          ],
        },
      ],
    },
  },
  {
    // The two build-time Node scripts. Linted — `validate-dist.mjs` gates every build, so a
    // typo in it would quietly pass the package — but not type-checked: they are not in
    // tsconfig, and adding them would put Node globals in the extension's type environment.
    files: ["scripts/**/*.mjs"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: { Buffer: "readonly", console: "readonly", process: "readonly", URL: "readonly" },
    },
  },
);
