import { describe, expect, it } from "vitest";
import { parseMetadata, slugFromPath, titleFromSlug } from "@/platforms/leetcode/metadata";
import fixtures from "../fixtures/leetcode.json";

const URL_TWO_SUM = "https://leetcode.com/problems/two-sum/";

describe("slugFromPath", () => {
  it.each([
    ["/problems/two-sum/", "two-sum"],
    ["/problems/two-sum", "two-sum"],
    ["/problems/trapping-rain-water/description/", "trapping-rain-water"],
    ["/problems/two-sum/submissions/", "two-sum"],
  ])("extracts the slug from %s", (path, slug) => {
    expect(slugFromPath(path)).toBe(slug);
  });

  it.each(["/problemset/all/", "/contest/weekly-123/", "/", "/problems/"])(
    "returns null off a problem page: %s",
    (path) => {
      expect(slugFromPath(path)).toBeNull();
    },
  );
});

describe("titleFromSlug", () => {
  it("produces a readable title when the API gave us nothing", () => {
    expect(titleFromSlug("two-sum")).toBe("Two Sum");
    expect(titleFromSlug("trapping-rain-water")).toBe("Trapping Rain Water");
  });

  it("tolerates repeated and trailing separators", () => {
    expect(titleFromSlug("a--b-")).toBe("A B");
  });
});

describe("parseMetadata", () => {
  it("normalises a full GraphQL response (PRD §18)", () => {
    expect(parseMetadata("two-sum", URL_TWO_SUM, fixtures.question)).toEqual({
      platform: "leetcode",
      problemId: "1",
      slug: "two-sum",
      title: "Two Sum",
      url: URL_TWO_SUM,
      difficulty: "Easy",
      topics: ["Array", "Hash Table"],
    });
  });

  it("degrades field by field instead of failing the sync (PRD §18)", () => {
    const metadata = parseMetadata("two-sum", URL_TWO_SUM, fixtures.questionMissingFields);
    expect(metadata).toEqual({
      platform: "leetcode",
      problemId: undefined,
      slug: "two-sum",
      title: "Two Sum", // recovered from the slug
      url: URL_TWO_SUM,
      difficulty: "Unknown", // "Insane" is not a difficulty we invent a mapping for
      topics: [],
    });
  });

  it.each([["questionError"], ["submissionDetailsEmpty"]] as const)(
    "still yields a syncable identity when the query failed (%s)",
    (key) => {
      const metadata = parseMetadata("two-sum", URL_TWO_SUM, fixtures[key]);
      expect(metadata.title).toBe("Two Sum");
      expect(metadata.difficulty).toBe("Unknown");
      expect(metadata.slug).toBe("two-sum");
    },
  );

  it("never invents a difficulty (PRD §30)", () => {
    for (const difficulty of ["easy", "EASY", "Beginner", "", null, 3, undefined]) {
      const payload = { data: { question: { title: "X", difficulty } } };
      expect(parseMetadata("x", URL_TWO_SUM, payload).difficulty, String(difficulty)).toBe(
        "Unknown",
      );
    }
  });

  it.each([
    ["Easy", "Easy"],
    ["Medium", "Medium"],
    ["Hard", "Hard"],
  ])("maps the exact platform difficulty %s", (raw, expected) => {
    const payload = { data: { question: { title: "X", difficulty: raw } } };
    expect(parseMetadata("x", URL_TWO_SUM, payload).difficulty).toBe(expected);
  });

  it("drops malformed topic tags rather than emitting empty strings", () => {
    const payload = {
      data: { question: { title: "X", topicTags: [{ name: "Array" }, {}, null, { name: "" }, 7] } },
    };
    expect(parseMetadata("x", URL_TWO_SUM, payload).topics).toEqual(["Array"]);
  });
});
