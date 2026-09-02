import { useState } from "react";
import { getAvatarUrl } from "../utils/avatar";

export function AvatarDisplay({
  avatar,
  size = "md",
  className = "",
  interactive = true,
}: {
  avatar?: string;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
  interactive?: boolean;
}) {
  const [isWaving, setIsWaving] = useState(false);

  const sizeClasses = {
    xs: "h-6 w-6",
    sm: "h-9 w-9",
    md: "h-20 w-20",
    lg: "h-24 w-24",
  };

  const url = getAvatarUrl(avatar);

  return (
    <div
      onMouseEnter={() => {
        if (interactive) setIsWaving(true);
      }}
      className={`animate-avatar-entrance relative flex shrink-0 items-center justify-center select-none ${sizeClasses[size]} ${
        interactive
          ? "cursor-pointer transition-transform duration-300 ease-out hover:scale-110 active:scale-95"
          : ""
      } ${className}`}
      aria-label="User Memoji Avatar"
      role="img"
    >
      <img
        src={url}
        alt="Avatar Memoji"
        onAnimationEnd={() => setIsWaving(false)}
        className={`h-full w-full object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.4)] transition-all duration-300 ${
          isWaving ? "animate-memoji-tilt" : ""
        }`}
        loading="eager"
      />
    </div>
  );
}
