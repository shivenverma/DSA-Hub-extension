import { describe, expect, it } from "vitest";
import {
  MARKER_END,
  MARKER_START,
  hasManagedSection,
  readManagedSection,
  spliceManagedSection,
} from "@/readme/parser";

/**
 * Acceptance Test 7 lives here: a user's README must survive a DSAHub update unchanged
 * outside the markers. This is the one place where getting it wrong destroys work the
 * user cannot recover from the extension.
 */
const USER_README = `# My Interview Prep

[![build](https://img.shields.io/badge/build-passing-green)](https://example.com)

I am working through NeetCode 150. Notes to myself:

- revisit binary search on answers
- \`git log --oneline\` for a quick recap

## Setup

Clone and open in VS Code.

${MARKER_START}

## 📊 Progress

old content that should be replaced

${MARKER_END}

## Licence

MIT — see [LICENCE](./LICENCE).
`;

describe("hasManagedSection", () => {
  it("finds a well-formed section", () => {
    expect(hasManagedSection(USER_README)).toBe(true);
  });

  it("reports none when a marker is missing", () => {
    expect(hasManagedSection("# Just my notes")).toBe(false);
    expect(hasManagedSection(`# Notes\n${MARKER_START}\nunclosed`)).toBe(false);
    expect(hasManagedSection(`# Notes\n${MARKER_END}\n`)).toBe(false);
  });

  it("refuses a section whose markers are inverted", () => {
    // Splicing on these would swallow whatever sits between them.
    expect(hasManagedSection(`${MARKER_END}\nuser text\n${MARKER_START}`)).toBe(false);
  });
});

describe("spliceManagedSection — preserving user content (Acceptance Test 7)", () => {
  it("changes nothing outside the markers, byte for byte", () => {
    const result = spliceManagedSection(USER_README, "## 📊 Progress\n\nnew content");

    const before = USER_README.slice(0, USER_README.indexOf(MARKER_START));
    const after = USER_README.slice(USER_README.indexOf(MARKER_END) + MARKER_END.length);
    expect(result.startsWith(before)).toBe(true);
    expect(result.endsWith(after)).toBe(true);

    // And the specific things a careless implementation would eat:
    expect(result).toContain("[![build](https://img.shields.io/badge/build-passing-green)]");
    expect(result).toContain("- `git log --oneline` for a quick recap");
    expect(result).toContain("MIT — see [LICENCE](./LICENCE).");
  });

  it("replaces the old managed body", () => {
    const result = spliceManagedSection(USER_README, "new content");

    expect(result).not.toContain("old content that should be replaced");
    expect(readManagedSection(result)).toBe("new content");
  });

  it("leaves exactly one managed section behind", () => {
    const once = spliceManagedSection(USER_README, "a");
    const twice = spliceManagedSection(once, "b");

    expect(twice.split(MARKER_START)).toHaveLength(2);
    expect(twice.split(MARKER_END)).toHaveLength(2);
  });

  it("is idempotent for the same body", () => {
    const once = spliceManagedSection(USER_README, "same");
    expect(spliceManagedSection(once, "same")).toBe(once);
  });
});

describe("spliceManagedSection — no section yet", () => {
  it("appends to a README that has none, keeping the user's text first", () => {
    const result = spliceManagedSection("# My Notes\n\nSome prose.\n", "body");

    expect(result.startsWith("# My Notes\n\nSome prose.")).toBe(true);
    expect(result).toContain(MARKER_START);
    expect(readManagedSection(result)).toBe("body");
  });

  it("does not accumulate blank lines when appending twice", () => {
    // The second call finds the markers, so it splices rather than appends.
    const once = spliceManagedSection("# Notes\n\n\n\n", "body");
    expect(spliceManagedSection(once, "body")).toBe(once);
    expect(once).not.toMatch(/\n{3}/);
  });

  it("writes a heading of its own only when there is no README at all", () => {
    const fresh = spliceManagedSection(null, "body");

    expect(fresh.startsWith("# 🚀 DSA Solutions\n\nAutomatically synced using DSAHub.")).toBe(true);
    expect(spliceManagedSection("", "body")).toBe(fresh);
    expect(spliceManagedSection("   \n\n", "body")).toBe(fresh);
    // A README that exists keeps its own title.
    expect(spliceManagedSection("# Mine\n", "body")).not.toContain("🚀 DSA Solutions");
  });
});

describe("readManagedSection", () => {
  it("returns null when there is nothing managed", () => {
    expect(readManagedSection("# Notes")).toBeNull();
  });

  it("round-trips a body so callers can skip an unchanged commit", () => {
    const body = "## 📊 Progress\n\n| Platform | Solved |\n|----------|-------:|\n| LeetCode | 1 |";
    expect(readManagedSection(spliceManagedSection(null, body))).toBe(body);
  });
});
