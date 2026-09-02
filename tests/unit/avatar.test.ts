import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AVATAR_OPTIONS,
  DEFAULT_AVATAR,
  getAvatar,
  setAvatar,
} from "@/storage/storage";
import { getAvatarUrl } from "@/popup/utils/avatar";

describe("Avatar Personalization & Storage (Memoji)", () => {
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
      runtime: {
        getURL: vi.fn((path: string) => `chrome-extension://fake-id/${path}`),
      },
    });
  });

  it("provides the complete set of 26 curated Memoji avatar choices", () => {
    expect(AVATAR_OPTIONS.length).toBe(26);
    for (const opt of AVATAR_OPTIONS) {
      expect(opt.id).toBeDefined();
      expect(opt.filename).toMatch(/^Memoji-\d{2}\.png$/);
      expect(opt.label).toBeDefined();
    }
  });

  it("returns the default Memoji avatar when no avatar has been selected yet", async () => {
    const avatar = await getAvatar();
    expect(avatar).toBe(DEFAULT_AVATAR);
    expect(avatar).toBe("Memoji-01.png");
  });

  it("generates valid URL for Memoji assets", () => {
    const url = getAvatarUrl("Memoji-05.png");
    expect(url).toBe("chrome-extension://fake-id/memoji/Memoji-05.png");
  });

  it("falls back to default Memoji on invalid or malformed avatar names", () => {
    const url = getAvatarUrl("invalid-emoji");
    expect(url).toBe("chrome-extension://fake-id/memoji/Memoji-01.png");
  });

  it("persists a newly selected Memoji avatar and retrieves it accurately", async () => {
    await setAvatar("Memoji-04.png");
    const retrieved = await getAvatar();
    expect(retrieved).toBe("Memoji-04.png");
    expect(fakeStorage["selectedAvatar"]).toBe("Memoji-04.png");
  });

  it("persists avatar choice across multiple updates", async () => {
    await setAvatar("Memoji-02.png");
    expect(await getAvatar()).toBe("Memoji-02.png");

    await setAvatar("Memoji-26.png");
    expect(await getAvatar()).toBe("Memoji-26.png");
  });
});
