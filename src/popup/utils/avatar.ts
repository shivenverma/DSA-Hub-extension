import { DEFAULT_AVATAR } from "@/storage/storage";

export function getAvatarUrl(avatarName?: string): string {
  let filename = avatarName || DEFAULT_AVATAR;
  if (!filename.endsWith(".png")) {
    filename = DEFAULT_AVATAR;
  }
  if (typeof chrome !== "undefined" && chrome.runtime?.getURL) {
    return chrome.runtime.getURL(`memoji/${filename}`);
  }
  return `/memoji/${filename}`;
}
