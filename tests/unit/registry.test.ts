import { describe, expect, it } from "vitest";
import { resolveAdapter } from "@/platforms/core/registry";

describe("adapter registry", () => {
  it("routes LeetCode URLs to the LeetCode adapter", () => {
    expect(resolveAdapter("https://leetcode.com/problems/two-sum/")?.platform).toBe("leetcode");
  });

  it("routes GFG practice URLs to the GFG adapter", () => {
    expect(resolveAdapter("https://www.geeksforgeeks.org/problems/two-sum/1")?.platform).toBe("gfg");
  });

  it("returns null for unrelated sites", () => {
    expect(resolveAdapter("https://example.com/problems/two-sum")).toBeNull();
  });

  it("returns null for a malformed URL instead of throwing", () => {
    expect(resolveAdapter("not a url")).toBeNull();
  });

  it("separates problem pages from other pages on the same platform", () => {
    const adapter = resolveAdapter("https://leetcode.com/problemset/all/");
    expect(adapter?.platform).toBe("leetcode");
    expect(adapter?.isProblemPage("https://leetcode.com/problemset/all/")).toBe(false);
    expect(adapter?.isProblemPage("https://leetcode.com/problems/two-sum/")).toBe(true);
  });

  it("does not treat GFG article pages as problem pages", () => {
    const adapter = resolveAdapter("https://www.geeksforgeeks.org/problems/two-sum/1");
    expect(adapter?.isProblemPage("https://www.geeksforgeeks.org/dsa-tutorial/")).toBe(false);
    expect(adapter?.isProblemPage("https://www.geeksforgeeks.org/problems/two-sum/1")).toBe(true);
  });
});
