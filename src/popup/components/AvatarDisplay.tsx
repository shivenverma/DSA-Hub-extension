import { DEFAULT_AVATAR } from "@/storage/storage";

export function AvatarDisplay({
  avatar = DEFAULT_AVATAR,
  size = "md",
}: {
  avatar?: string;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClasses = {
    sm: "h-8 w-8 text-base",
    md: "h-14 w-14 text-3xl",
    lg: "h-16 w-16 text-4xl",
  };

  return (
    <div
      className={`animate-avatar-entrance relative flex items-center justify-center rounded-2xl border border-white/[0.12] bg-gradient-to-b from-white/[0.08] to-white/[0.02] shadow-inner backdrop-blur-md select-none ${sizeClasses[size]}`}
      aria-label="User Avatar"
      role="img"
    >
      <span className="drop-shadow-sm">{avatar}</span>
    </div>
  );
}
