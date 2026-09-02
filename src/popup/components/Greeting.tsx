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
    <div className="flex items-center gap-3.5 py-1">
      <AvatarDisplay avatar={avatar} size="md" />

      <div className="flex flex-col justify-center min-w-0 flex-1">
        <h1 className="flex items-center gap-1.5 text-xl font-bold tracking-tight text-white">
          <span className="truncate">Hey {displayName}!</span>
          <span className="shrink-0 text-lg">👋</span>
        </h1>
        <p className="text-xs text-zinc-400 mt-1 font-normal">
          Great to see you again.
        </p>
      </div>
    </div>
  );
}
