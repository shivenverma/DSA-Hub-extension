import { getAvatarUrl } from "../utils/avatar";

export function AvatarDisplay({
  avatar,
  size = "md",
  className = "",
}: {
  avatar?: string;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}) {
  const sizeClasses = {
    xs: "h-6 w-6",
    sm: "h-9 w-9",
    md: "h-20 w-20",
    lg: "h-24 w-24",
  };

  const url = getAvatarUrl(avatar);

  return (
    <div
      className={`animate-avatar-entrance relative flex shrink-0 items-center justify-center select-none ${sizeClasses[size]} ${className}`}
      aria-label="User Memoji Avatar"
      role="img"
    >
      <img
        src={url}
        alt="Avatar Memoji"
        className="h-full w-full object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.4)]"
        loading="eager"
      />
    </div>
  );
}
