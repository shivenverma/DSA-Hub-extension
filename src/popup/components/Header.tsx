export function Header({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const logoUrl =
    typeof chrome !== "undefined" && chrome.runtime?.getURL
      ? chrome.runtime.getURL("logo.png")
      : "/logo.png";

  return (
    <header className="flex items-center justify-between pb-1.5">
      <div className="flex items-center gap-2.5">
        <img
          src={logoUrl}
          alt="DSAHub Logo"
          className="h-7 w-7 rounded-lg object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)] transition-transform hover:scale-105"
        />
        <span className="text-xl font-bold tracking-tight text-white select-none">
          DSAHub
        </span>
      </div>
      {onOpenSettings && (
        <button
          type="button"
          onClick={onOpenSettings}
          title="Settings"
          aria-label="Settings"
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-xl text-zinc-400 transition hover:bg-white/[0.08] hover:text-zinc-200 active:scale-95"
        >
          <span className="text-base tracking-widest leading-none">•••</span>
        </button>
      )}
    </header>
  );
}
