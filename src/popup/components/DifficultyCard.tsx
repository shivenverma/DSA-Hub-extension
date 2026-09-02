import type { DifficultyStats } from "@/readme/statistics";

export function DifficultyCard({ stats }: { stats: DifficultyStats }) {
  return (
    <div className="flex flex-col justify-between rounded-2xl border border-white/[0.08] bg-[#161618] p-3 shadow-sm">
      <div>
        <h2 className="mb-2 text-[11px] font-semibold tracking-wider uppercase text-zinc-400">
          🎯 Difficulty
        </h2>
        <div className="space-y-1.5 text-xs text-zinc-300">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]" />
              <span>Easy</span>
            </span>
            <span className="font-mono font-medium text-emerald-400 tabular-nums">
              {stats.easy}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.5)]" />
              <span>Medium</span>
            </span>
            <span className="font-mono font-medium text-amber-400 tabular-nums">
              {stats.medium}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-400 shadow-[0_0_6px_rgba(251,113,133,0.5)]" />
              <span>Hard</span>
            </span>
            <span className="font-mono font-medium text-rose-400 tabular-nums">
              {stats.hard}
            </span>
          </div>

          {stats.unknown > 0 && (
            <div className="flex items-center justify-between text-zinc-400">
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" />
                <span>Unknown</span>
              </span>
              <span className="font-mono font-medium text-zinc-400 tabular-nums">
                {stats.unknown}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-white/[0.06] pt-2 text-xs text-zinc-400">
        <span>Solved</span>
        <span className="font-mono text-sm font-bold text-zinc-200 tabular-nums">
          {stats.total}
        </span>
      </div>
    </div>
  );
}
