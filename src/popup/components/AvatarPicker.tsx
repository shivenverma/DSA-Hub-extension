import { AVATAR_OPTIONS, DEFAULT_AVATAR } from "@/storage/storage";
import { getAvatarUrl } from "../utils/avatar";

export function AvatarPicker({
  selected = DEFAULT_AVATAR,
  onSelect,
}: {
  selected?: string;
  onSelect: (filename: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold tracking-wider uppercase text-zinc-400">
          Choose your Memoji
        </h3>
        <span className="text-[11px] text-zinc-500">26 Apple characters</span>
      </div>

      <div className="max-h-60 overflow-y-auto pr-1">
        <div className="grid grid-cols-4 gap-2.5">
          {AVATAR_OPTIONS.map((item) => {
            const isSelected = selected === item.filename;
            const imgUrl = getAvatarUrl(item.filename);

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.filename)}
                title={item.label}
                aria-label={item.label}
                aria-pressed={isSelected}
                className={`group relative flex h-16 w-full cursor-pointer items-center justify-center rounded-2xl border p-1 transition-all active:scale-95 ${
                  isSelected
                    ? "border-emerald-500/70 bg-emerald-500/15 shadow-sm shadow-emerald-500/20 ring-2 ring-emerald-500/50"
                    : "border-white/[0.08] bg-[#161618] hover:border-white/[0.2] hover:bg-[#1c1c20]"
                }`}
              >
                <img
                  src={imgUrl}
                  alt={item.label}
                  className="h-full w-full object-contain drop-shadow transition-transform duration-200 group-hover:scale-110"
                  loading="lazy"
                />
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
    </div>
  );
}
