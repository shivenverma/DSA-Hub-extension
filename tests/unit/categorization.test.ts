import { describe, expect, it } from "vitest";
import { CATEGORIES, FALLBACK_CATEGORY, classify } from "@/categorization";

/**
 * The classifier decides which folder a problem lands in, so its output is effectively
 * permanent — changing it later strands solutions in the old category. These tests pin
 * the PRD's own worked examples, which are the only externally-specified answers.
 */
describe("classify — PRD worked examples", () => {
  it("files 'Longest Substring Without Repeating Characters' under Strings (PRD §21)", () => {
    // The tags include Hashing and Sliding Window; the PRD says the primary is Strings.
    expect(classify(["Hash Table", "String", "Sliding Window"])).toBe("Strings");
  });

  it("keeps a Dynamic Programming problem under Dynamic Programming (PRD §20)", () => {
    expect(classify(["Dynamic Programming", "Arrays"])).toBe("Dynamic Programming");
  });

  it("files an array problem tagged Sliding Window under Arrays (PRD §20)", () => {
    expect(classify(["Array", "Sliding Window"])).toBe("Arrays");
  });
});

describe("classify — platform tag vocabularies", () => {
  it("reads LeetCode's tag spellings", () => {
    expect(classify(["Heap (Priority Queue)"])).toBe("Heap");
    expect(classify(["Binary Indexed Tree"])).toBe("Trees");
    expect(classify(["Depth-First Search"])).toBe("Graphs");
    expect(classify(["Bit Manipulation"])).toBe("Bit Manipulation");
  });

  it("reads GFG's tag spellings for the same concepts", () => {
    // GFG's own slugs and labels differ from LeetCode's for identical topics; one table
    // handles both, which is the point of normalizing before lookup.
    expect(classify(["two-pointer-algorithm"])).toBe("Two Pointers");
    expect(classify(["Bit Magic"])).toBe("Bit Manipulation");
    expect(classify(["Hash"])).toBe("Hashing");
    expect(classify(["Mathematical"])).toBe("Math");
  });

  it("ignores case, punctuation and spacing differences", () => {
    for (const tag of ["linked list", "Linked-List", "LINKED  LIST", " Linked_List "]) {
      expect(classify([tag])).toBe("Linked List");
    }
  });
});

describe("classify — priority between tags", () => {
  it("prefers the tree over the traversal that walks it", () => {
    // Tagged with both Tree and DFS, this is a tree problem, not a graph problem.
    expect(classify(["Tree", "Depth-First Search", "Binary Tree"])).toBe("Trees");
  });

  it("still recognises a graph problem that uses the same traversal", () => {
    expect(classify(["Graph", "Breadth-First Search"])).toBe("Graphs");
  });

  it("folds the three tree names onto one shelf", () => {
    // Otherwise a user's tree problems scatter across three directories.
    for (const tag of ["Tree", "Binary Tree", "Binary Search Tree"]) {
      expect(classify([tag])).toBe("Trees");
    }
  });

  it("folds Priority Queue onto Heap", () => {
    expect(classify(["Priority Queue"])).toBe("Heap");
    expect(classify(["Heap"])).toBe("Heap");
  });
});

describe("classify — degraded input", () => {
  it("falls back to the title when the platform gave no tags", () => {
    // GFG frequently returns none; a title is the last thing we still have (PRD §20).
    expect(classify([], "Reverse a Linked List")).toBe("Linked List");
    expect(classify([], "Binary Tree Inorder Traversal")).toBe("Trees");
    expect(classify([], "Implement Trie (Prefix Tree)")).toBe("Trie");
  });

  it("matches title words on boundaries, not substrings", () => {
    // "Two Pointers" must not be read out of "Sum of Two Integers".
    expect(classify([], "Sum of Two Integers")).toBe(FALLBACK_CATEGORY);
  });

  it("prefers a real tag over the title", () => {
    expect(classify(["Dynamic Programming"], "Longest Common Subarray")).toBe(
      "Dynamic Programming",
    );
  });

  it("returns the fallback rather than failing the sync", () => {
    // PRD §18: imperfect metadata must never stop a solution reaching GitHub.
    expect(classify([])).toBe(FALLBACK_CATEGORY);
    expect(classify(["Interactive", "Shell"])).toBe(FALLBACK_CATEGORY);
    expect(classify(["", "   "], "")).toBe(FALLBACK_CATEGORY);
  });
});

describe("CATEGORIES", () => {
  it("lists every category once, with the fallback last", () => {
    expect(new Set(CATEGORIES).size).toBe(CATEGORIES.length);
    expect(CATEGORIES.at(-1)).toBe(FALLBACK_CATEGORY);
  });

  it("only contains categories classify can actually produce", () => {
    // A category nothing maps to is an empty folder promised in the README.
    const reachable = new Set(CATEGORIES.map((category) => classify([category])));
    expect([...CATEGORIES].filter((category) => !reachable.has(category))).toEqual([]);
  });
});
