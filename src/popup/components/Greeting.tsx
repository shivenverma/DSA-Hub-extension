import { AvatarDisplay } from "./AvatarDisplay";

export function Greeting({
  login,
  avatar,
}: {
  login: string;
  avatar?: string;
}) {
  const formatName = (username: string) => {
    if (!username) return "there";
    return username.charAt(0).toUpperCase() + username.slice(1);
  };

  const displayName = formatName(login);

  return (
    <div className="flex flex-col items-center justify-center py-2 text-center">
      <AvatarDisplay avatar={avatar} size="md" />
      <h1 className="mt-2.5 text-base font-semibold tracking-tight text-zinc-100">
        Hey {displayName}! 👋
      </h1>
      <p className="mt-0.5 text-xs text-zinc-400">
        Great to see you again.
      </p>
    </div>
  );
}
