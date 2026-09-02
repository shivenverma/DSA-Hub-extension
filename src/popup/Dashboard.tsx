/**
 * PRD §41's popup dashboard, plus §43's sync history counts.
 *
 * Read-only, apart from the two things a user can only do from here: pushing what is
 * queued, and answering a re-solve question. Configuration lives in `Settings` behind
 * §41's `[Settings]` button.
 *
 * PRD §40 also lists "current platform" as a popup responsibility. It is not here: reading
 * the active tab's URL needs the `tabs` permission, and PRD §52 says not to request a
 * permission that is not required for current functionality. The footer already names the
 * platforms DSAHub watches.
 */
import type { Platform } from "@/platforms/core/types";
import { PLATFORM_LABELS } from "@/platforms/core/types";
import type { Config } from "@/storage/storage";
import { waitingReason, type Summary } from "./summary";

/** PRD §41's mock abbreviates the platform in the recent-syncs list. */
const SHORT_LABELS: Record<Platform, string> = { leetcode: "LC", gfg: "GFG" };

export function Dashboard(props: {
  busy: boolean;
  login: string;
  config: Config;
  summary: Summary;
  onSyncNow: () => void;
  onResolve: (jobId: string, update: boolean) => void;
  onOpenSettings: () => void;
}) {
  const { summary, config } = props;
  const repo = `${config.repoOwner ?? ""}/${config.repoName ?? ""}`;
  const repoUrl = `https://github.com/${repo}/tree/${config.branch ?? "main"}`;

  return (
    <div className="space-y-3 text-sm">
      <div className="rounded-md border border-slate-200 p-3">
        <div className="flex items-center gap-2">
          <span className="text-emerald-600">●</span>
          <span className="font-medium">GitHub connected</span>
          <span className="ml-auto text-xs text-slate-400">@{props.login}</span>
        </div>
        <p className="mt-1 truncate text-xs text-slate-500">
          {repo}
          {config.branch && <span className="text-slate-400"> · {config.branch}</span>}
        </p>
      </div>

      <section>
        <h2 className="mb-1 text-xs font-semibold tracking-wide text-slate-500">📊 Progress</h2>
        {summary.byPlatform.map((row) => (
          <div key={row.key} className="flex justify-between py-0.5 text-slate-700">
            <span>{PLATFORM_LABELS[row.key]}</span>
            <span className="tabular-nums">{row.count}</span>
          </div>
        ))}
        <div className="mt-1 flex justify-between border-t border-slate-200 pt-1 font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{summary.total}</span>
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-xs font-semibold tracking-wide text-slate-500">🎯 Difficulty</h2>
        <div className="space-y-0.5 text-slate-700">
          <div className="flex items-center justify-between py-0.5">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
              <span>Easy</span>
            </span>
            <span className="tabular-nums font-medium text-emerald-700">{summary.difficultyStats.easy}</span>
          </div>
          <div className="flex items-center justify-between py-0.5">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />
              <span>Medium</span>
            </span>
            <span className="tabular-nums font-medium text-amber-700">{summary.difficultyStats.medium}</span>
          </div>
          <div className="flex items-center justify-between py-0.5">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-rose-500" aria-hidden="true" />
              <span>Hard</span>
            </span>
            <span className="tabular-nums font-medium text-rose-700">{summary.difficultyStats.hard}</span>
          </div>
          {summary.difficultyStats.unknown > 0 && (
            <div className="flex items-center justify-between py-0.5">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-slate-400" aria-hidden="true" />
                <span>Unknown</span>
              </span>
              <span className="tabular-nums font-medium text-slate-500">{summary.difficultyStats.unknown}</span>
            </div>
          )}
        </div>
      </section>

      {/* PRD §43. Shown in full rather than hiding the zeros: "0 failed" is information. */}
      <p className="text-xs text-slate-500">
        {summary.total} synced · {summary.failed} failed · {summary.pending} pending
      </p>

      {summary.waiting.length > 0 && (
        <section className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-2">
          <h2 className="text-xs font-semibold text-amber-800">
            {summary.waiting.length} not synced yet
          </h2>
          {summary.waiting.map((job) => (
            <div key={job.id} className="space-y-1">
              <p className="truncate text-xs font-medium text-amber-900">{job.problem.title}</p>
              <p className="text-xs text-amber-700">{waitingReason(job)}</p>
              {job.awaitingChoice && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={props.busy}
                    onClick={() => props.onResolve(job.id, true)}
                    className="rounded bg-amber-700 px-2 py-1 text-xs font-medium text-white hover:bg-amber-800 disabled:opacity-50"
                  >
                    Update it
                  </button>
                  <button
                    type="button"
                    disabled={props.busy}
                    onClick={() => props.onResolve(job.id, false)}
                    className="rounded border border-amber-300 px-2 py-1 text-xs hover:bg-amber-100 disabled:opacity-50"
                  >
                    Keep existing
                  </button>
                </div>
              )}
            </div>
          ))}
          {summary.waiting.some((job) => !job.awaitingChoice) && (
            <button
              type="button"
              disabled={props.busy}
              onClick={props.onSyncNow}
              className="w-full rounded border border-amber-300 px-2 py-1 text-xs font-medium hover:bg-amber-100 disabled:opacity-50"
            >
              {props.busy ? "Syncing…" : "Sync now"}
            </button>
          )}
        </section>
      )}

      {summary.recent.length > 0 && (
        <section>
          <h2 className="mb-1 text-xs font-semibold tracking-wide text-slate-500">Recent syncs</h2>
          {summary.recent.map((record) => (
            <a
              key={record.githubPath}
              href={`https://github.com/${repo}/blob/${config.branch ?? "main"}/${record.githubPath}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 py-0.5 text-xs hover:underline"
            >
              <span className="text-emerald-600">✓</span>
              <span className="flex-1 truncate text-slate-700">{record.title}</span>
              <span className="shrink-0 text-slate-400">{SHORT_LABELS[record.platform]}</span>
            </a>
          ))}
        </section>
      )}

      {summary.total === 0 && summary.waiting.length === 0 && (
        <p className="rounded bg-slate-50 p-2 text-xs text-slate-600">
          Nothing synced yet. Solve a problem on {PLATFORM_LABELS.leetcode} or{" "}
          {PLATFORM_LABELS.gfg} and DSAHub will commit it.
        </p>
      )}

      <div className="space-y-2 border-t border-slate-100 pt-2">
        <a
          href={repoUrl}
          target="_blank"
          rel="noreferrer"
          className="block w-full rounded border border-slate-300 px-3 py-2 text-center text-sm font-medium hover:bg-slate-100"
        >
          Open GitHub
        </a>
        <button
          type="button"
          onClick={props.onOpenSettings}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100"
        >
          Settings
        </button>
      </div>
    </div>
  );
}
