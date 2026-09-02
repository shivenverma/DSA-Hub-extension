import { describe, expect, it } from "vitest";
import { resolveLanguage } from "@/languages";

// PRD acceptance Test 9: each language must produce the right file extension.
describe("resolveLanguage", () => {
  it.each([
    ["cpp", "C++", "cpp"],
    ["C++", "C++", "cpp"],
    ["cpp20", "C++", "cpp"],
    ["Java", "Java", "java"],
    ["python3", "Python", "py"],
    ["pypy3", "Python", "py"],
    ["javascript", "JavaScript", "js"],
    ["nodejs", "JavaScript", "js"],
  ])("maps %s to %s with extension .%s", (raw, canonical, ext) => {
    const language = resolveLanguage(raw);
    expect(language.canonical).toBe(canonical);
    expect(language.ext).toBe(ext);
  });

  it("keeps an unrecognised language rather than blocking the sync", () => {
    expect(resolveLanguage("Rust")).toMatchObject({ canonical: "Rust", ext: "txt" });
  });

  it("falls back to Unknown for blank input", () => {
    expect(resolveLanguage("   ")).toMatchObject({ canonical: "Unknown", ext: "txt" });
  });
});
