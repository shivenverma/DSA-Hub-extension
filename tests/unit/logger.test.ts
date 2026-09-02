import { describe, expect, it } from "vitest";
import { redact } from "@/utils/logger";

// PRD Rule 13 / §37: credentials must never reach a log sink.
describe("redact", () => {
  it("strips classic personal access tokens", () => {
    const out = redact(`Authorization: Bearer ghp_${"A".repeat(36)}`);
    expect(out).not.toContain("AAAA");
    expect(out).toContain("[redacted]");
  });

  it("strips OAuth user tokens found inside objects", () => {
    expect(redact({ note: `gho_${"B".repeat(36)}` })).toContain("[redacted]");
  });

  it("strips fine-grained tokens", () => {
    expect(redact(`github_pat_${"C".repeat(40)}`)).toBe("[redacted]");
  });

  it("redacts credential fields even when the token shape is unfamiliar", () => {
    const out = redact({ accessToken: "some-unfamiliar-format-xyz" });
    expect(out).not.toContain("some-unfamiliar-format-xyz");
    expect(out).toContain("[redacted]");
  });

  it("redacts the device_code used during the OAuth device flow", () => {
    expect(redact({ device_code: "abc123secret" })).not.toContain("abc123secret");
  });

  it("leaves ordinary log text untouched", () => {
    const message = "synced Two Sum to Arrays/0001-Two-Sum";
    expect(redact(message)).toBe(message);
  });

  it("survives circular structures rather than throwing inside a logger", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(redact(circular)).toBe("[unserializable]");
  });
});
