import { describe, expect, it, vi } from "vitest";
import {
  ASK_UPDATE,
  askAboutResolve,
  notifyFailed,
  notifyQueued,
  notifySynced,
  parkedJobId,
} from "@/background/notify";
import { patchConfig } from "@/storage/storage";
import type { Problem } from "@/platforms/core/types";

const PROBLEM: Problem = {
  platform: "leetcode",
  problemId: "1",
  slug: "two-sum",
  title: "Two Sum",
  url: "https://leetcode.com/problems/two-sum/",
  difficulty: "Easy",
  topics: ["Array"],
  primaryCategory: "Arrays",
  language: "C++",
  code: "int main() {}",
  solvedAt: "2026-01-01T12:00:00.000Z",
};

/** The single notification created by the call under test. */
function created(): { id: string; options: chrome.notifications.NotificationCreateOptions } {
  const create = vi.mocked(chrome.notifications.create);
  expect(create).toHaveBeenCalledTimes(1);
  // The overload set makes `mock.calls` a union; every call here passes (id, options).
  const [id, options] = create.mock.calls[0] as unknown as [
    string,
    chrome.notifications.NotificationCreateOptions,
  ];
  return { id, options };
}

/** Everything the user reads, as one string. */
function text(): string {
  const { options } = created();
  return [options.title, options.message, ...(options.buttons ?? []).map((b) => b.title)].join(" ");
}

describe("notifySynced", () => {
  it("says synced, and where it went", async () => {
    await notifySynced(PROBLEM, "Arrays/0001-Two-Sum/solution.cpp");

    expect(created().options).toMatchObject({
      title: "Synced Two Sum",
      message: "Committed to Arrays/0001-Two-Sum/solution.cpp",
      type: "basic",
    });
  });

  it("carries an icon, which chrome.notifications requires to create a basic one", async () => {
    await notifySynced(PROBLEM, "path");

    expect(created().options.iconUrl).toBeTruthy();
  });
});

describe("notifyQueued", () => {
  it("never reads as if the solution reached GitHub (Rule 14)", async () => {
    await notifyQueued(PROBLEM, "GitHub is unreachable.");

    const { title, message } = created().options;
    expect(title).toBe("Two Sum is queued, not synced yet");
    // The word "synced" only ever appears here negated, so a glanced title cannot mislead.
    expect(title).not.toMatch(/(?<!not )\bsynced\b/);
    expect(message).toMatch(/GitHub is unreachable\./);
  });

  it("promises the retry that is actually coming", async () => {
    await notifyQueued(PROBLEM, "offline");

    expect(created().options.message).toMatch(/keep trying/i);
  });
});

describe("notifyFailed", () => {
  it("says it could not sync, and does not promise a retry", async () => {
    await notifyFailed(PROBLEM, "Your GitHub token no longer works.");

    const { title, message } = created().options;
    expect(title).toBe("Could not sync Two Sum");
    expect(message).toMatch(/Your GitHub token no longer works\./);
    // No retry is scheduled, so nothing may suggest one is.
    expect(message).not.toMatch(/retry|retrying|keep trying|will try/i);
  });

  it("points at the one thing the user can do", async () => {
    await notifyFailed(PROBLEM, "reason");

    expect(created().options.message).toMatch(/Open DSAHub/);
  });
});

describe("askAboutResolve", () => {
  it("offers exactly the two answers, update first", async () => {
    await askAboutResolve(PROBLEM);

    const { options } = created();
    expect(options.buttons).toEqual([{ title: "Update it" }, { title: "Keep existing" }]);
    expect(options.buttons?.[ASK_UPDATE]?.title).toBe("Update it");
  });

  it("stays on screen, because the submission stays held until it is answered", async () => {
    await askAboutResolve(PROBLEM);

    expect(created().options.requireInteraction).toBe(true);
  });

  it("carries the parked job's id, the only state the button listener gets back", async () => {
    await askAboutResolve(PROBLEM);

    expect(parkedJobId(created().id)).toBe("leetcode:1");
  });
});

describe("routing by notification id", () => {
  it("recognises the re-solve question", () => {
    expect(parkedJobId("dsahub:ask:gfg:two-sum")).toBe("gfg:two-sum");
  });

  it("ignores a plain outcome notification", async () => {
    await notifySynced(PROBLEM, "path");

    // Otherwise "Synced Two Sum" being clicked would replace a solution.
    expect(parkedJobId(created().id)).toBeNull();
  });

  it("ignores notifications from anything that is not DSAHub", () => {
    expect(parkedJobId("some-other-extension:1")).toBeNull();
    expect(parkedJobId("")).toBeNull();
  });
});

describe("the notifications setting (PRD §42)", () => {
  it("creates nothing at all when it is off", async () => {
    await patchConfig({ notifications: false });

    await notifySynced(PROBLEM, "path");
    await notifyQueued(PROBLEM, "offline");
    await notifyFailed(PROBLEM, "gone");
    await askAboutResolve(PROBLEM);

    expect(chrome.notifications.create).not.toHaveBeenCalled();
  });
});

describe("Rule 13 — nothing a notification says may leak a credential", () => {
  it("does not repeat a token that reached it inside a failure reason", async () => {
    // describeFailure writes these sentences, but this is the surface the OS renders and
    // caches, so it gets its own guard.
    await notifyFailed(
      { ...PROBLEM, code: "const token = 'ghp_realtokenrealtokenrealtoken1234';" },
      "GitHub rejected the request.",
    );

    expect(text()).not.toMatch(/gh[pousr]_|github_pat_/);
  });

  it("never includes the solution code, whatever the outcome", async () => {
    await notifySynced(PROBLEM, "Arrays/0001-Two-Sum/solution.cpp");

    expect(text()).not.toContain(PROBLEM.code);
  });
});
