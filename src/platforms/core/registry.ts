import type { CodingPlatformAdapter } from "./types";
import { LeetCodeAdapter } from "@/platforms/leetcode/adapter";
import { GFGAdapter } from "@/platforms/gfg/adapter";

/** Registration is the only place that knows which platforms exist (PRD §58). */
const ADAPTERS: readonly CodingPlatformAdapter[] = [new LeetCodeAdapter(), new GFGAdapter()];

export function resolveAdapter(url: string): CodingPlatformAdapter | null {
  return ADAPTERS.find((adapter) => adapter.canHandle(url)) ?? null;
}
