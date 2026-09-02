// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  parseMetadata,
  readMetadata,
  slugFromPath,
  titleFromSlug,
  toDifficulty,
} from "@/platforms/gfg/metadata";
import { extractSolution } from "@/platforms/gfg/extractor";
import { GFGAdapter } from "@/platforms/gfg/adapter";

/**
 * ⚠ The HTML below is a *guess* at GFG's markup, same status as tests/fixtures/gfg.json.
 * These tests pin the degradation behaviour (PRD §18) — what happens when a selector
 * misses — which is the part that stays true even after the real markup replaces this.
 */
const PROBLEM_HTML = `
  <div class="problems_header_content__xyz">
    <h3>Reverse a String</h3>
  </div>
  <div class="problems_header_description__abc">
    Difficulty: <strong>Basic</strong>
  </div>
  <div class="problems_tag_container__def">
    <a href="/tag/strings">Strings</a>
    <a href="/tag/two-pointer">Two Pointer Algorithm</a>
    <a href="/tag/strings">Strings</a>
  </div>
`;

function render(html: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = html;
  return root;
}

describe("slugFromPath", () => {
  it.each([
    ["/problems/reverse-a-string/1", "reverse-a-string"],
    ["/problems/reverse-a-string", "reverse-a-string"],
    ["/problems/kth-smallest-element5545/1", "kth-smallest-element5545"],
  ])("%s → %s", (pathname, expected) => {
    expect(slugFromPath(pathname)).toBe(expected);
  });

  it("returns null off the practice portal", () => {
    for (const pathname of ["/", "/problems/", "/courses/dsa", "/reverse-a-string"]) {
      expect(slugFromPath(pathname), pathname).toBeNull();
    }
  });
});

describe("titleFromSlug", () => {
  it("title-cases a slug", () => {
    expect(titleFromSlug("reverse-a-string")).toBe("Reverse A String");
  });

  it("tolerates repeated and trailing separators", () => {
    expect(titleFromSlug("kth--smallest-")).toBe("Kth Smallest");
  });
});

describe("toDifficulty", () => {
  it("folds GFG's sub-Easy tiers into Easy", () => {
    // School and Basic are genuinely easier problems, not unknown ones.
    for (const raw of ["School", "basic", " Easy "]) {
      expect(toDifficulty(raw), raw).toBe("Easy");
    }
  });

  it("passes Medium and Hard through", () => {
    expect(toDifficulty("Medium")).toBe("Medium");
    expect(toDifficulty("HARD")).toBe("Hard");
  });

  it("never invents a difficulty (PRD §30)", () => {
    for (const raw of [null, undefined, "", "Expert", "Difficulty: ???"]) {
      expect(toDifficulty(raw), String(raw)).toBe("Unknown");
    }
  });
});

describe("parseMetadata", () => {
  const url = "https://www.geeksforgeeks.org/problems/reverse-a-string/1";

  it("reads title, difficulty and deduped topics", () => {
    const metadata = parseMetadata(render(PROBLEM_HTML), "reverse-a-string", url);

    expect(metadata).toEqual({
      platform: "gfg",
      slug: "reverse-a-string",
      title: "Reverse a String",
      url,
      difficulty: "Easy",
      topics: ["Strings", "Two Pointer Algorithm"],
    });
  });

  it("carries no problemId, so identity is platform:slug (PRD §32)", () => {
    const metadata = parseMetadata(render(PROBLEM_HTML), "reverse-a-string", url);
    expect(metadata.problemId).toBeUndefined();
  });

  it("degrades field by field when the markup changes", () => {
    // The whole point of PRD §18: a stale selector must cost one field, not the sync.
    const metadata = parseMetadata(render("<main>redesigned</main>"), "reverse-a-string", url);

    expect(metadata.title).toBe("Reverse A String"); // fell back to the slug
    expect(metadata.difficulty).toBe("Unknown");
    expect(metadata.topics).toEqual([]);
  });

  it("ignores whitespace-only nodes rather than emitting empty topics", () => {
    const metadata = parseMetadata(
      render(`<div class="problems_tag_container__x"><a> </a><a>Arrays</a></div>`),
      "x",
      url,
    );
    expect(metadata.topics).toEqual(["Arrays"]);
  });
});

describe("readMetadata", () => {
  it("builds the URL from the path, not from whatever the SPA left in the bar", () => {
    const location = { pathname: "/problems/reverse-a-string/1" } as Location;
    expect(readMetadata(location, render(PROBLEM_HTML))?.url).toBe(
      "https://www.geeksforgeeks.org/problems/reverse-a-string/1",
    );
  });

  it("returns null off a problem page", () => {
    expect(readMetadata({ pathname: "/courses" } as Location, render(PROBLEM_HTML))).toBeNull();
  });
});

describe("extractSolution", () => {
  const submittedAt = "2026-08-25T10:00:00.000Z";

  it("returns the intercepted code with its language canonicalised", () => {
    const solution = extractSolution({
      interceptedCode: "class Solution {}",
      interceptedLang: "cpp",
      submittedAt,
    });
    expect(solution).toEqual({ language: "C++", code: "class Solution {}", submittedAt });
  });

  it("throws rather than committing when no code was captured", () => {
    // GFG has no read-back API, so there is nothing to recover from — and guessing
    // from the editor could commit a buffer the judge never saw (Rule 14).
    for (const interceptedCode of [undefined, "", "   \n  "]) {
      expect(() => extractSolution({ interceptedCode, submittedAt })).toThrow(
        /never captured the submitted code/,
      );
    }
  });

  it("still returns the code when the language is unknown", () => {
    const solution = extractSolution({ interceptedCode: "x = 1", submittedAt });
    expect(solution.code).toBe("x = 1");
    expect(solution.language).toBe("Unknown");
  });
});

describe("GFGAdapter", () => {
  it("handles only the practice portal", () => {
    const adapter = new GFGAdapter();
    expect(adapter.canHandle("https://www.geeksforgeeks.org/problems/reverse-a-string/1")).toBe(
      true,
    );
    expect(adapter.canHandle("https://www.geeksforgeeks.org/courses/dsa")).toBe(true);
    expect(adapter.canHandle("https://practice.geeksforgeeks.org/problems/x/1")).toBe(false);
    expect(adapter.canHandle("https://leetcode.com/problems/two-sum/")).toBe(false);
    expect(adapter.canHandle("not a url")).toBe(false);
  });

  it("distinguishes a problem page from the rest of the site", () => {
    const adapter = new GFGAdapter();
    expect(adapter.isProblemPage("https://www.geeksforgeeks.org/problems/reverse-a-string/1")).toBe(
      true,
    );
    expect(adapter.isProblemPage("https://www.geeksforgeeks.org/courses/dsa")).toBe(false);
  });

  it("reports not-accepted before any submission is seen", async () => {
    // Never "accepted" by default — the absence of a verdict is not a pass.
    await expect(new GFGAdapter().getSubmissionStatus()).resolves.toEqual({ accepted: false });
  });

  it("rejects a solution request before any submission is seen", async () => {
    await expect(new GFGAdapter().getSubmittedSolution()).rejects.toThrow(
      /No GeeksforGeeks submission/,
    );
  });
});
