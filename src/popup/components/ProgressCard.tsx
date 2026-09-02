import type { Platform } from "@/platforms/core/types";
import { PLATFORM_LABELS } from "@/platforms/core/types";
import type { Count } from "@/readme/statistics";
import { PlatformLogo } from "./PlatformLogo";

export function ProgressCard({
  byPlatform,
  total,
}: {
  byPlatform: Count<Platform>[];
  total: number;
}) {
  return (
    <div className="flex flex-col justify-between rounded-2xl border border-white/[0.08] bg-[#161618] p-3 shadow-sm">
      <div>
        <h2 className="mb-2 text-[11px] font-semibold tracking-wider uppercase text-zinc-400">
          📊 Progress
        </h2>
        <div className="space-y-1.5 text-xs">
          {byPlatform.map((row) => (
            <div
              key={row.key}
              className="flex items-center justify-between text-zinc-300"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <PlatformLogo platform={row.key} className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{PLATFORM_LABELS[row.key]}</span>
              </div>
              <span className="font-mono font-medium text-zinc-200 tabular-nums ml-1.5">
                {row.count}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-white/[0.06] pt-2 text-xs font-semibold text-zinc-100">
        <span>Total</span>
        <span className="font-mono text-sm font-bold text-white tabular-nums">
          {total}
        </span>
      </div>
    </div>
  );
}
