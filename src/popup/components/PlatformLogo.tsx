import type { Platform } from "@/platforms/core/types";

export function LeetCodeLogo({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-label="LeetCode logo"
      role="img"
    >
      <path
        d="M16.102 17.93l-2.697 2.607c-.466.467-1.111.755-1.797.755s-1.332-.288-1.797-.755L3.92 14.646C3.453 14.18 3.165 13.535 3.165 12.85s.288-1.331.755-1.798l5.892-5.892c.466-.466 1.111-.754 1.797-.754s1.332.288 1.797.754l2.697 2.607a1.05 1.05 0 001.485-1.485l-2.697-2.607A4.654 4.654 0 0011.609 3c-1.242 0-2.411.484-3.29 1.363L2.427 10.255A4.647 4.647 0 001.065 13.545c0 1.29.502 2.502 1.362 3.363l5.892 5.891A4.647 4.647 0 0011.609 24.16c1.242 0 2.411-.484 3.29-1.363l2.697-2.607a1.05 1.05 0 00-1.494-1.26z"
        fill="#FFA116"
      />
      <path
        d="M12.5 13.5h8.4c.58 0 1.05-.47 1.05-1.05s-.47-1.05-1.05-1.05h-8.4c-.58 0-1.05.47-1.05 1.05s.47 1.05 1.05 1.05z"
        fill="#E7A41E"
      />
    </svg>
  );
}

export function GFGLogo({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-label="GeeksforGeeks logo"
      role="img"
    >
      <path
        d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 14.5c-2.49 0-4.5-2.01-4.5-4.5S10.51 7.5 13 7.5c1.47 0 2.77.71 3.59 1.81l-1.63 1.2c-.44-.61-1.16-1.01-1.96-1.01-1.38 0-2.5 1.12-2.5 2.5s1.12 2.5 2.5 2.5c.98 0 1.82-.57 2.22-1.39H13v-2h4.5v4.5A4.48 4.48 0 0113 16.5z"
        fill="#2F8D46"
      />
      <path
        d="M19.5 9.5c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5.67 1.5 1.5 1.5 1.5-.67 1.5-1.5z"
        fill="#00B050"
      />
    </svg>
  );
}

export function PlatformLogo({
  platform,
  className = "h-4 w-4 shrink-0",
}: {
  platform: Platform;
  className?: string;
}) {
  if (platform === "leetcode") {
    return <LeetCodeLogo className={className} />;
  }
  return <GFGLogo className={className} />;
}
