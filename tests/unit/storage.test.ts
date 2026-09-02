import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONFIG,
  get,
  getConfig,
  patchConfig,
  set,
  type Config,
} from "@/storage/storage";

describe("storage", () => {
  it("returns defaults before anything is written", async () => {
    expect(await getConfig()).toEqual(DEFAULT_CONFIG);
    expect(await get("syncIndex")).toEqual({});
    expect(await get("queue")).toEqual([]);
    expect(await get("cache")).toEqual({ branches: {} });
    expect(await get("auth")).toBeUndefined();
  });

  it("defaults new repositories to private and duplicates to update", () => {
    // PRD §11 (safe onboarding) and §33 (re-solving behaviour).
    expect(DEFAULT_CONFIG.newRepoVisibility).toBe("private");
    expect(DEFAULT_CONFIG.duplicateHandling).toBe("update");
  });

  it("round-trips a written value", async () => {
    await set("syncIndex", {});
    await patchConfig({ repoOwner: "octocat", repoName: "DSA-Solutions" });
    expect(await getConfig()).toMatchObject({ repoOwner: "octocat", repoName: "DSA-Solutions" });
  });

  it("merges patches instead of replacing the config", async () => {
    await patchConfig({ repoOwner: "octocat", repoName: "DSA-Solutions" });
    const config = await patchConfig({ branch: "main" });
    expect(config).toMatchObject({
      repoOwner: "octocat",
      repoName: "DSA-Solutions",
      branch: "main",
      autoSync: true,
    });
  });

  it("supplies defaults for fields absent from a config written by an older version", async () => {
    await set("config", { repoOwner: "octocat" } as unknown as Config);
    const config = await getConfig();
    expect(config.repoOwner).toBe("octocat");
    expect(config.fileNaming).toBe("solution");
    expect(config.notifications).toBe(true);
  });
});
