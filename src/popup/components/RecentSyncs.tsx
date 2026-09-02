import type { SyncRecord } from "@/storage/storage";
import { PlatformLogo } from "./PlatformLogo";

function formatRelativeTime(isoString: string): string {
  try {
    const diffMs = Date.now() - new Date(isoString).getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return "Just now";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  } catch {
    return "";
  }
}

export function RecentSyncs({
  recent,
  repo,
  branch = "main",
}: {
  recent: SyncRecord[];
  repo: string;
  branch?: string;
}) {
  if (recent.length === 0) {
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-[#161618]/60 p-4 text-center">
        <span className="text-2xl select-none" role="img" aria-label="Rocket">
          🚀
        </span>
        <h3 className="mt-1 text-xs font-semibold text-zinc-200">
          Start your DSA journey
        </h3>
        <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">
          Solve a problem on LeetCode or GeeksforGeeks. Once accepted, DSAHub will automatically sync it to GitHub.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h2 className="text-[11px] font-semibold tracking-wider uppercase text-zinc-400">
        Recent syncs
      </h2>

      <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#161618] divide-y divide-white/[0.04]">
        {recent.map((record) => {
          const fileUrl = `https://github.com/${repo}/blob/${branch}/${record.githubPath}`;
          return (
            <a
              key={record.githubPath}
              href={fileUrl}
              target="_blank"
              rel="noreferrer"
              title={`View ${record.title} on GitHub`}
              className="group flex items-center justify-between gap-2.5 px-3 py-2 text-xs transition-colors hover:bg-white/[0.04]"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="text-emerald-400 shrink-0 text-[11px]">✓</span>
                <span className="truncate font-medium text-zinc-200 group-hover:text-white">
                  {record.title}
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <PlatformLogo platform={record.platform} className="h-3 w-3" />
                <span className="text-[10px] text-zinc-500 font-mono">
                  {formatRelativeTime(record.solvedAt)}
                </span>
                <span className="text-[10px] text-zinc-600 group-hover:text-zinc-400">
                  ↗
                </span>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
