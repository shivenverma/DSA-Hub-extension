import { useCallback, useEffect, useState } from "react";
import { sendToBackground, type RepoSummary } from "@/messaging";
import type { AuthProgress } from "@/github/auth";
import {
  DEFAULT_AVATAR,
  get,
  getAvatar,
  getConfig,
  patchConfig,
  setAvatar,
  type Config,
} from "@/storage/storage";
import { PLATFORM_LABELS } from "@/platforms/core/types";
import { Header } from "./components/Header";
import { PlatformLogo } from "./components/PlatformLogo";
import { Dashboard } from "./Dashboard";
import { Settings } from "./Settings";
import { summarize, type Summary } from "./summary";

type Screen = "loading" | "connect" | "authorizing" | "repo" | "dashboard" | "settings";

export function Popup() {
  const [auth, setAuth] = useState<AuthProgress>({ status: "idle" });
  const [config, setConfig] = useState<Config | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [avatar, setAvatarState] = useState<string>(DEFAULT_AVATAR);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [progress, stored, index, queue, storedAvatar] = await Promise.all([
      sendToBackground({ t: "AUTH_POLL" }),
      getConfig(),
      get("syncIndex"),
      get("queue"),
      getAvatar(),
    ]);
    setConfig(stored);
    setSummary(summarize(index, queue));
    setAvatarState(storedAvatar);
    if (progress.ok) setAuth(progress.value);
    else setError(progress.message);
  }, []);

  useEffect(() => void refresh(), [refresh]);

  useEffect(() => {
    if (auth.status !== "pending") return;
    const timer = setInterval(() => void refresh(), 5000);
    return () => clearInterval(timer);
  }, [auth.status, refresh]);

  async function run<T>(action: () => Promise<{ ok: true; value: T } | { ok: false; message: string }>) {
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      if (!result.ok) {
        setError(result.message);
        return null;
      }
      return result.value;
    } finally {
      setBusy(false);
    }
  }

  const screen = decideScreen(auth, config, summary, settingsOpen);

  // Fix: Reset scroll position to top whenever navigating between screens (e.g. Dashboard <-> Settings)
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    document.documentElement.scrollTo({ top: 0, left: 0, behavior: "instant" });
    document.body.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [screen]);

  const disconnect = () =>
    void run(async () => {
      const result = await sendToBackground({ t: "AUTH_DISCONNECT" });
      await refresh();
      return result;
    });

  const handleAvatarChange = (newAvatar: string) => {
    setAvatarState(newAvatar);
    void setAvatar(newAvatar);
  };

  return (
    <div className="w-[360px] min-h-[440px] bg-[#0f0f11] text-zinc-100 p-4 space-y-3.5 select-none">
      {/* Header bar */}
      <Header
        onOpenSettings={
          screen === "dashboard" ? () => setSettingsOpen(true) : undefined
        }
      />

      <main className="animate-screen-entrance">
        {screen === "loading" && (
          <div className="flex h-64 items-center justify-center">
            <p className="text-xs text-zinc-500 font-medium animate-pulse">Loading DSAHub…</p>
          </div>
        )}

        {screen === "connect" && (
          <ConnectStep
            busy={busy}
            expired={auth.status === "expired"}
            denied={auth.status === "denied"}
            onConnect={() =>
              void run(async () => {
                const result = await sendToBackground({ t: "AUTH_START" });
                if (result.ok) {
                  setAuth({ status: "pending", challenge: result.value });
                  await chrome.tabs.create({ url: result.value.verificationUri });
                }
                return result;
              })
            }
          />
        )}

        {screen === "authorizing" && auth.status === "pending" && (
          <AuthorizingStep challenge={auth.challenge} onRecheck={() => void refresh()} />
        )}

        {screen === "repo" && auth.status === "connected" && (
          <RepoStep
            busy={busy}
            login={auth.login}
            onSelect={(name) =>
              void run(async () => {
                const result = await sendToBackground({ t: "REPO_SELECT", name });
                if (result.ok) setConfig(await getConfig());
                return result;
              })
            }
            onDisconnect={disconnect}
          />
        )}

        {screen === "dashboard" && auth.status === "connected" && config && summary && (
          <Dashboard
            busy={busy}
            login={auth.login}
            config={config}
            summary={summary}
            avatar={avatar}
            onSyncNow={() =>
              void run(async () => {
                const result = await sendToBackground({ t: "SYNC_NOW" });
                await refresh();
                return result;
              })
            }
            onResolve={(jobId, update) =>
              void run(async () => {
                const result = await sendToBackground({ t: "RESOLVE_CHOICE", jobId, update });
                await refresh();
                return result;
              })
            }
            onOpenSettings={() => setSettingsOpen(true)}
          />
        )}

        {screen === "settings" && auth.status === "connected" && config && (
          <Settings
            busy={busy}
            login={auth.login}
            config={config}
            avatar={avatar}
            onAvatarChange={handleAvatarChange}
            onPatch={(patch) => void patchConfig(patch).then(setConfig)}
            onChangeRepo={() =>
              void patchConfig({ repoOwner: undefined, repoName: undefined }).then((next) => {
                setConfig(next);
                setSettingsOpen(false);
              })
            }
            onDisconnect={disconnect}
            onVerify={() => run(() => sendToBackground({ t: "VERIFY_SETUP" }))}
            onBack={() => setSettingsOpen(false)}
          />
        )}

        {error && (
          <div className="mt-3 rounded-xl border border-rose-500/20 bg-rose-500/10 p-2.5 text-xs text-rose-300">
            ⚠️ {error}
          </div>
        )}
      </main>

      {/* Tertiary Supported Platforms footer */}
      <footer className="flex items-center justify-center gap-3 border-t border-white/[0.06] pt-2.5 text-[11px] text-zinc-500">
        <span>Supported</span>
        <div className="flex items-center gap-1.5 text-zinc-400">
          <PlatformLogo platform="leetcode" className="h-3 w-3" />
          <span>{PLATFORM_LABELS.leetcode}</span>
        </div>
        <span className="text-zinc-700">·</span>
        <div className="flex items-center gap-1.5 text-zinc-400">
          <PlatformLogo platform="gfg" className="h-3 w-3" />
          <span>{PLATFORM_LABELS.gfg}</span>
        </div>
      </footer>
    </div>
  );
}

function decideScreen(
  auth: AuthProgress,
  config: Config | null,
  summary: Summary | null,
  settingsOpen: boolean,
): Screen {
  if (!config || !summary) return "loading";
  if (auth.status === "pending") return "authorizing";
  if (auth.status !== "connected") return "connect";
  if (!config.repoOwner || !config.repoName) return "repo";
  return settingsOpen ? "settings" : "dashboard";
}

function ConnectStep(props: {
  busy: boolean;
  expired: boolean;
  denied: boolean;
  onConnect: () => void;
}) {
  return (
    <div className="space-y-3.5 text-xs">
      <div className="rounded-2xl border border-white/[0.08] bg-[#161618] p-4 text-center space-y-2">
        <span className="text-3xl" role="img" aria-label="GitHub">
          ⚡
        </span>
        <h2 className="text-sm font-semibold text-zinc-100">Connect to GitHub</h2>
        <p className="text-zinc-400 leading-relaxed text-xs">
          Connect your GitHub account and DSAHub will automatically sync every accepted solution from LeetCode and GeeksforGeeks.
        </p>
      </div>

      {props.expired && (
        <p className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-2 text-amber-300 text-center">
          The sign-in code expired. Please start again.
        </p>
      )}
      {props.denied && (
        <p className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-2 text-amber-300 text-center">
          Sign-in was cancelled on GitHub. Start again when ready.
        </p>
      )}

      <button
        type="button"
        disabled={props.busy}
        onClick={props.onConnect}
        className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-white px-3.5 py-2.5 text-sm font-semibold text-zinc-950 shadow-sm transition hover:bg-zinc-200 active:scale-[0.98] disabled:opacity-50"
      >
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
          />
        </svg>
        <span>{props.busy ? "Starting…" : "Connect GitHub"}</span>
      </button>

      <p className="text-[11px] text-zinc-500 text-center leading-tight">
        DSAHub requests minimal repository write access to sync solutions to your private repository.
      </p>
    </div>
  );
}

function AuthorizingStep(props: {
  challenge: { userCode: string; verificationUri: string; expiresAt: number };
  onRecheck: () => void;
}) {
  const minutes = Math.max(0, Math.round((props.challenge.expiresAt - Date.now()) / 60_000));
  return (
    <div className="space-y-3.5 text-xs">
      <div className="rounded-2xl border border-white/[0.08] bg-[#161618] p-4 text-center space-y-2">
        <h2 className="text-sm font-semibold text-zinc-100">Authorize DSAHub</h2>
        <p className="text-zinc-400">
          Enter this verification code on GitHub (expires in ~{minutes} min):
        </p>
        <div className="my-2 flex items-center justify-center gap-2">
          <code className="rounded-xl border border-white/[0.15] bg-[#1a1a1d] px-4 py-2 font-mono text-xl font-bold tracking-[0.25em] text-emerald-400">
            {props.challenge.userCode}
          </code>
          <button
            type="button"
            title="Copy code"
            onClick={() => void navigator.clipboard.writeText(props.challenge.userCode)}
            className="rounded-xl border border-white/[0.1] bg-[#1a1a1d] px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-white/[0.08] cursor-pointer"
          >
            Copy
          </button>
        </div>
      </div>

      <a
        href={props.challenge.verificationUri}
        target="_blank"
        rel="noreferrer"
        className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-white px-3.5 py-2.5 text-sm font-semibold text-zinc-950 shadow-sm transition hover:bg-zinc-200"
      >
        <span>Open GitHub Verification</span>
        <span>↗</span>
      </a>

      <button
        type="button"
        onClick={props.onRecheck}
        className="flex w-full cursor-pointer items-center justify-center rounded-xl border border-white/[0.1] bg-[#161618] px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-white/[0.06]"
      >
        I have authorized — check status
      </button>

      <p className="text-[11px] text-zinc-500 text-center">
        You can close this popup; DSAHub continues verifying in the background.
      </p>
    </div>
  );
}

function RepoStep(props: {
  busy: boolean;
  login: string;
  onSelect: (name: string) => void;
  onDisconnect: () => void;
}) {
  const [repos, setRepos] = useState<RepoSummary[] | null>(null);
  const [name, setName] = useState("dsa-solutions");
  const [listError, setListError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const result = await sendToBackground({ t: "REPO_LIST" });
      if (result.ok) setRepos(result.value);
      else setListError(result.message);
    })();
  }, []);

  return (
    <div className="space-y-3.5 text-xs">
      <div className="flex items-center justify-between">
        <p className="text-zinc-300">
          Connected as <span className="font-semibold text-white font-mono">@{props.login}</span>
        </p>
        <button
          type="button"
          onClick={props.onDisconnect}
          className="text-[11px] text-rose-400 hover:text-rose-300"
        >
          Disconnect
        </button>
      </div>

      <div className="rounded-2xl border border-white/[0.08] bg-[#161618] p-3.5 space-y-2.5">
        <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400" htmlFor="repo-name">
          Repository for solutions
        </label>
        <div className="flex gap-2">
          <input
            id="repo-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="flex-1 rounded-xl border border-white/[0.1] bg-[#1a1a1d] px-3 py-1.5 text-xs text-zinc-100 font-mono focus:outline-none focus:ring-1 focus:ring-white/20"
            placeholder="dsa-solutions"
          />
          <button
            type="button"
            disabled={props.busy || name.trim().length === 0}
            onClick={() => props.onSelect(name.trim())}
            className="rounded-xl bg-white px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-zinc-200 disabled:opacity-50 cursor-pointer"
          >
            Use
          </button>
        </div>
        <p className="text-[11px] text-zinc-500">
          Created as private if it does not exist yet.
        </p>
      </div>

      {listError && <p className="text-xs text-amber-400">{listError}</p>}

      {repos && repos.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Or choose an existing repository
          </span>
          <div className="max-h-36 space-y-1 overflow-y-auto rounded-2xl border border-white/[0.08] bg-[#161618] p-1.5">
            {repos.map((repo) => (
              <button
                key={repo.fullName}
                type="button"
                disabled={props.busy}
                onClick={() => props.onSelect(repo.name)}
                className="flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-left text-xs text-zinc-300 hover:bg-white/[0.06] hover:text-white disabled:opacity-50 cursor-pointer"
              >
                <span className="truncate font-mono">{repo.name}</span>
                <span className="ml-2 shrink-0 text-[10px] text-zinc-500 uppercase">
                  {repo.private ? "private" : "public"}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
