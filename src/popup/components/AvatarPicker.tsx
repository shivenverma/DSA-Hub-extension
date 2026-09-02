import { AVATAR_OPTIONS, DEFAULT_AVATAR } from "@/storage/storage";

export function AvatarPicker({
  selected = DEFAULT_AVATAR,
  onSelect,
}: {
  selected?: string;
  onSelect: (emoji: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold tracking-wider uppercase text-zinc-400">
          Choose your avatar
        </h3>
        <span className="text-xs text-zinc-500">Pick a face for your greeting</span>
      </div>

      <div className="grid grid-cols-4 gap-2.5">
        {AVATAR_OPTIONS.map((item) => {
          const isSelected = selected === item.emoji;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.emoji)}
              title={item.label}
              aria-label={item.label}
              aria-pressed={isSelected}
              className={`group relative flex h-14 w-full cursor-pointer items-center justify-center rounded-2xl border text-2xl transition-all active:scale-95 ${
                isSelected
                  ? "border-emerald-500/60 bg-emerald-500/10 shadow-sm shadow-emerald-500/10 ring-2 ring-emerald-500/40"
                  : "border-white/[0.08] bg-[#161618] hover:border-white/[0.2] hover:bg-white/[0.06]"
              }`}
            >
              <span className="transition-transform duration-200 group-hover:scale-110">
                {item.emoji}
              </span>
              {isSelected && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[9px] font-bold text-black shadow">
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
