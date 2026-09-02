/**
 * Unified DSA categorization (PRD §19–§21).
 *
 * One ordered table, one function — the same shape as `languages.ts`, and for the same
 * reason: the taxonomy, the tag mappings and the classifier have exactly one consumer
 * each, so splitting them across three modules would buy nothing but imports.
 *
 * PRD §20 describes a four-level chain (platform tags → known mappings → local rules →
 * fallback). Levels 1 and 2 are the same lookup here: a platform tag *is* only useful
 * once mapped, so `TAXONOMY` is the mapping and matching against it is the first step.
 *
 * ## Order is the priority
 *
 * A problem carries several tags and needs one folder. The array order decides which
 * tag wins, and it is tuned to the PRD's own examples:
 *
 * - `[Hash Table, String, Sliding Window]` → **Strings** (PRD §21)
 * - `[Dynamic Programming, Arrays]` → **Dynamic Programming** (PRD §20)
 * - `[Array, Sliding Window]` → **Arrays** (PRD §20)
 *
 * The last one is why `Arrays` sits immediately above `Sliding Window`, and the first
 * is why `Strings` sits above `Hashing`. Reordering these breaks those examples.
 *
 * ## Why fewer categories than PRD §19 lists
 *
 * Categories become folders. `Heap` and `Priority Queue` are one concept, and
 * `Trees` / `Binary Trees` / `Binary Search Tree` are three names for one shelf —
 * shipping them as separate categories would scatter a user's tree problems across
 * three directories. They are kept as *aliases* instead, so every §19 name still
 * resolves; it just resolves to one folder. PRD §22's own example tree shows a single
 * `Trees/`.
 */

interface CategoryDef {
  /** Display name, and the folder name once hyphenated. */
  name: string;
  /**
   * Normalized platform tag spellings that resolve here — see `normalize()`. The
   * category's own name always matches and is not repeated in this list.
   */
  aliases: string[];
}

/** Most distinctive category first; see the header. */
const TAXONOMY: CategoryDef[] = [
  { name: "Dynamic Programming", aliases: ["dp", "memoization", "tabulation"] },
  { name: "Backtracking", aliases: ["backtrack"] },
  { name: "Trie", aliases: ["prefix tree"] },
  {
    // Ahead of Graphs so a tree problem tagged with a traversal still files as a tree.
    name: "Trees",
    aliases: [
      "tree",
      "binary tree",
      "binary trees",
      "binary search tree",
      "bst",
      "n ary tree",
      "segment tree",
      "binary indexed tree",
      "fenwick tree",
      "lowest common ancestor",
    ],
  },
  {
    name: "Graphs",
    aliases: [
      "graph",
      "depth first search",
      "dfs",
      "breadth first search",
      "bfs",
      "topological sort",
      "union find",
      "disjoint set",
      "shortest path",
      "minimum spanning tree",
      "strongly connected component",
      "eulerian circuit",
      "biconnected component",
    ],
  },
  { name: "Linked List", aliases: ["doubly linked list"] },
  { name: "Stack", aliases: ["monotonic stack"] },
  { name: "Queue", aliases: ["deque", "monotonic queue"] },
  // LeetCode's tag is literally "Heap (Priority Queue)".
  { name: "Heap", aliases: ["priority queue", "heap priority queue"] },
  { name: "Matrix", aliases: ["grid", "2d array"] },
  { name: "Strings", aliases: ["string", "rolling hash", "suffix array"] },
  { name: "Arrays", aliases: ["array", "prefix sum"] },
  { name: "Sliding Window", aliases: ["window sliding technique"] },
  { name: "Two Pointers", aliases: ["two pointer", "two pointer algorithm"] },
  { name: "Binary Search", aliases: ["searching", "binary search on answer"] },
  { name: "Recursion", aliases: ["divide and conquer"] },
  { name: "Greedy", aliases: [] },
  { name: "Bit Manipulation", aliases: ["bit magic", "bitmask", "bitwise"] },
  {
    name: "Hashing",
    aliases: ["hash", "hash table", "hash map", "hash function", "counting", "ordered set"],
  },
  {
    name: "Sorting",
    aliases: ["merge sort", "bucket sort", "counting sort", "radix sort", "quickselect"],
  },
  {
    name: "Math",
    aliases: [
      "mathematical",
      "number theory",
      "combinatorics",
      "geometry",
      "probability and statistics",
      "game theory",
    ],
  },
];

/** Where a problem lands when nothing matches. Never guessed at, always this. */
export const FALLBACK_CATEGORY = "Miscellaneous";

/** Every category that can own a folder, in priority order, fallback last. */
export const CATEGORIES: readonly string[] = [
  ...TAXONOMY.map((category) => category.name),
  FALLBACK_CATEGORY,
];

/**
 * Lowercase, and collapse every run of non-alphanumerics to a single space. Both
 * `two-pointer-algorithm` (GFG) and `Two Pointers` (LeetCode) reduce to something the
 * same table can match, without needing per-platform tag lists.
 */
function normalize(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function matches(category: CategoryDef, tag: string): boolean {
  return normalize(category.name) === tag || category.aliases.includes(tag);
}

/**
 * Picks the one category a problem is filed under. Never throws and never returns an
 * empty string: an unrecognized problem is `Miscellaneous`, which is a real answer
 * rather than a failed sync (PRD §18).
 *
 * `title` is the third level of PRD §20's chain — for GFG problems that arrive with no
 * tags at all, the same alias table is matched against words in the title.
 */
export function classify(topics: readonly string[], title = ""): string {
  const tags = topics.map(normalize).filter((tag) => tag.length > 0);
  const byTag = TAXONOMY.find((category) => tags.some((tag) => matches(category, tag)));
  if (byTag) return byTag.name;

  // Padded so an alias only matches on word boundaries: "Sum of Two Integers" must not
  // become Two Pointers, but "Reverse Linked List" must become Linked List.
  const words = ` ${normalize(title)} `;
  const byTitle = TAXONOMY.find((category) =>
    [normalize(category.name), ...category.aliases].some((alias) => words.includes(` ${alias} `)),
  );
  return byTitle?.name ?? FALLBACK_CATEGORY;
}
