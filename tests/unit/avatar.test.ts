import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AVATAR_OPTIONS,
  DEFAULT_AVATAR,
  getAvatar,
  setAvatar,
} from "@/storage/storage";

describe("Avatar Personalization & Storage", () => {
  let fakeStorage: Record<string, unknown> = {};

  beforeEach(() => {
    fakeStorage = {};
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn((keys?: string | string[] | Record<string, unknown>) => {
            if (typeof keys === "string") {
              return Promise.resolve({ [keys]: fakeStorage[keys] });
            }
            if (Array.isArray(keys)) {
              const res: Record<string, unknown> = {};
              for (const k of keys) res[k] = fakeStorage[k];
              return Promise.resolve(res);
            }
            return Promise.resolve({ ...fakeStorage });
          }),
          set: vi.fn((items: Record<string, unknown>) => {
            Object.assign(fakeStorage, items);
            return Promise.resolve();
          }),
        },
      },
    });
  });

  it("provides a curated set of 8-16 avatar choices", () => {
    expect(AVATAR_OPTIONS.length).toBeGreaterThanOrEqual(8);
    expect(AVATAR_OPTIONS.length).toBeLessThanOrEqual(16);
    for (const opt of AVATAR_OPTIONS) {
      expect(opt.id).toBeDefined();
      expect(opt.emoji).toBeDefined();
      expect(opt.label).toBeDefined();
    }
  });

  it("returns the default avatar when no avatar has been selected yet", async () => {
    const avatar = await getAvatar();
    expect(avatar).toBe(DEFAULT_AVATAR);
    expect(avatar).toBe("😊");
  });

  it("persists a newly selected avatar and retrieves it accurately", async () => {
    await setAvatar("🧑‍💻");
    const retrieved = await getAvatar();
    expect(retrieved).toBe("🧑‍💻");
    expect(fakeStorage["selectedAvatar"]).toBe("🧑‍💻");
  });

  it("persists avatar choice across multiple updates", async () => {
    await setAvatar("😎");
    expect(await getAvatar()).toBe("😎");

    await setAvatar("🦊");
    expect(await getAvatar()).toBe("🦊");
  });
});
