export function SyncStatus({
  total,
  failed,
  pending,
}: {
  total: number;
  failed: number;
  pending: number;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-[#141416] px-3 py-2 text-[11px]">
      <div className="flex items-center gap-1.5 text-zinc-300">
        <span className="text-emerald-400">✓</span>
        <span>
          <strong className="font-semibold text-zinc-100">{total}</strong> synced
        </span>
      </div>

      <div className="flex items-center gap-2 font-mono text-zinc-400">
        <span className={failed > 0 ? "text-rose-400 font-medium" : "text-zinc-500"}>
          {failed} failed
        </span>
        <span className="text-zinc-700">·</span>
        <span className={pending > 0 ? "text-amber-400 font-medium" : "text-zinc-500"}>
          {pending} pending
        </span>
      </div>
    </div>
  );
}
