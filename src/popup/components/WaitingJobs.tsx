import type { SyncJob } from "@/storage/storage";
import { waitingReason } from "../summary";

export function WaitingJobs({
  waiting,
  busy,
  onResolve,
  onSyncNow,
}: {
  waiting: SyncJob[];
  busy: boolean;
  onResolve: (jobId: string, update: boolean) => void;
  onSyncNow: () => void;
}) {
  if (waiting.length === 0) return null;

  return (
    <section className="space-y-2 rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] p-3 text-xs">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-amber-300">
          ⚠️ {waiting.length} pending sync{waiting.length === 1 ? "" : "s"}
        </h2>
      </div>

      <div className="space-y-2">
        {waiting.map((job) => (
          <div
            key={job.id}
            className="space-y-1.5 rounded-xl border border-amber-500/15 bg-black/20 p-2.5"
          >
            <p className="truncate font-medium text-amber-200">{job.problem.title}</p>
            <p className="text-[11px] text-amber-300/80">{waitingReason(job)}</p>

            {job.awaitingChoice && (
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onResolve(job.id, true)}
                  className="rounded-lg bg-amber-500 px-2.5 py-1 text-xs font-semibold text-black hover:bg-amber-400 disabled:opacity-50 cursor-pointer"
                >
                  Update it
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onResolve(job.id, false)}
                  className="rounded-lg border border-amber-500/30 bg-white/5 px-2.5 py-1 text-xs text-amber-200 hover:bg-white/10 disabled:opacity-50 cursor-pointer"
                >
                  Keep existing
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {waiting.some((job) => !job.awaitingChoice) && (
        <button
          type="button"
          disabled={busy}
          onClick={onSyncNow}
          className="w-full rounded-xl border border-amber-500/30 bg-amber-500/10 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 disabled:opacity-50 cursor-pointer transition-colors"
        >
          {busy ? "Syncing…" : "Sync now"}
        </button>
      )}
    </section>
  );
}
