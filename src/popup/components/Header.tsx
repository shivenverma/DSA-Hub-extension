export function Header({ onOpenSettings }: { onOpenSettings?: () => void }) {
  return (
    <header className="flex items-center justify-between pb-1">
      <div className="flex items-center gap-2">
        <span className="font-scotch text-lg font-bold tracking-tight text-white/95">
          DSAHub
        </span>
      </div>
      {onOpenSettings && (
        <button
          type="button"
          onClick={onOpenSettings}
          title="Settings"
          aria-label="Settings"
          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-zinc-400 transition hover:bg-white/[0.08] hover:text-zinc-200 active:scale-95"
        >
          <span className="text-sm tracking-widest leading-none">•••</span>
        </button>
      )}
    </header>
  );
}
