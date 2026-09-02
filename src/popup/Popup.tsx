import { useCallback, useEffect, useState } from "react";
import { sendToBackground, type RepoSummary } from "@/messaging";
import type { AuthProgress } from "@/github/auth";
import { get, getConfig, patchConfig, type Config } from "@/storage/storage";
import { PLATFORM_LABELS } from "@/platforms/core/types";
import { Dashboard } from "./Dashboard";
import { Settings } from "./Settings";
import { summarize, type Summary } from "./summary";

/**
 * Onboarding is three steps — connect, choose a repository, confirm it can be written
 * to — and the UI shows the one the stored state says you are on, not a step counter
 * it tracks itself. Reopening the popup mid-flow therefore resumes rather than
 * restarts, which matters because authorizing *requires* leaving for github.com.
 */
type Screen = "loading" | "connect" | "authorizing" | "repo" | "dashboard" | "settings";

export function Popup() {
  const [auth, setAuth] = useState<AuthProgress>({ status: "idle" });
  const [config, setConfig] = useState<Config | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    // AUTH_POLL rather than AUTH_STATUS: opening the popup is the moment the user has
    // just come back from authorizing, so this is when a poll is most likely to
    // succeed — the 30s alarm is the fallback, not the main path.
    const [progress, stored, index, queue] = await Promise.all([
      sendToBackground({ t: "AUTH_POLL" }),
      getConfig(),
      get("syncIndex"),
      get("queue"),
    ]);
    setConfig(stored);
    setSummary(summarize(index, queue));
    if (progress.ok) setAuth(progress.value);
    else setError(progress.message);
  }, []);

  useEffect(() => void refresh(), [refresh]);

  /** Keeps a pending flow moving while the popup happens to be open. */
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

  const disconnect = () =>
    void run(async () => {
      const result = await sendToBackground({ t: "AUTH_DISCONNECT" });
      await refresh();
      return result;
    });

  return (
    <div className="w-80 space-y-3 bg-white p-4 text-slate-900">
      <header className="flex items-baseline justify-between">
        <h1 className="text-lg font-semibold">DSAHub</h1>
        {/* Only on the repository step — every later screen reaches this from Settings. */}
        {screen === "repo" && (
          <button
            type="button"
            className="text-xs text-slate-400 underline hover:text-slate-600"
            onClick={disconnect}
          >
            Disconnect
          </button>
        )}
      </header>

      {screen === "loading" && <p className="text-sm text-slate-500">Loading…</p>}

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
        />
      )}

      {screen === "dashboard" && auth.status === "connected" && config && summary && (
        <Dashboard
          busy={busy}
          login={auth.login}
          config={config}
          summary={summary}
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
        <p className="rounded border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">
          {error}
        </p>
      )}

      <footer className="border-t border-slate-100 pt-2 text-xs text-slate-400">
        Supported: {PLATFORM_LABELS.leetcode} · {PLATFORM_LABELS.gfg}
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
    <div className="space-y-2 text-sm">
      <p className="text-slate-600">
        Connect a GitHub account and DSAHub will commit every accepted solution for you.
      </p>
      {props.expired && (
        <p className="text-xs text-amber-700">
          The last sign-in code expired before it was used. Start again.
        </p>
      )}
      {props.denied && (
        <p className="text-xs text-amber-700">
          That sign-in was cancelled on GitHub. Start again when you are ready.
        </p>
      )}
      <button
        type="button"
        disabled={props.busy}
        onClick={props.onConnect}
        className="w-full rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {props.busy ? "Starting…" : "Connect GitHub"}
      </button>
      <p className="text-xs text-slate-400">
        DSAHub asks for the <code>repo</code> scope — the least that can create a private
        repository and push to it.
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
    <div className="space-y-2 text-sm">
      <p className="text-slate-600">
        Enter this code on GitHub — it expires in about {minutes} minute
        {minutes === 1 ? "" : "s"}.
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 rounded border border-slate-300 bg-slate-50 py-2 text-center text-lg font-semibold tracking-[0.3em]">
          {props.challenge.userCode}
        </code>
        <button
          type="button"
          title="Copy code"
          onClick={() => void navigator.clipboard.writeText(props.challenge.userCode)}
          className="rounded border border-slate-300 px-2 py-2 text-xs hover:bg-slate-100"
        >
          Copy
        </button>
      </div>
      <a
        href={props.challenge.verificationUri}
        target="_blank"
        rel="noreferrer"
        className="block text-center text-xs text-blue-600 underline"
      >
        Open {props.challenge.verificationUri}
      </a>
      <button
        type="button"
        onClick={props.onRecheck}
        className="w-full rounded border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100"
      >
        I have authorized — check now
      </button>
      <p className="text-xs text-slate-400">
        You can close this popup; DSAHub keeps checking in the background.
      </p>
    </div>
  );
}

function RepoStep(props: { busy: boolean; login: string; onSelect: (name: string) => void }) {
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
    <div className="space-y-2 text-sm">
      <p className="text-slate-600">
        Connected as <span className="font-medium">@{props.login}</span>. Where should
        solutions go?
      </p>

      <label className="block text-xs font-medium text-slate-500" htmlFor="repo-name">
        New or existing repository
      </label>
      <div className="flex gap-2">
        <input
          id="repo-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm"
          placeholder="dsa-solutions"
        />
        <button
          type="button"
          disabled={props.busy || name.trim().length === 0}
          onClick={() => props.onSelect(name.trim())}
          className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          Use
        </button>
      </div>
      <p className="text-xs text-slate-400">
        Created private if it does not exist yet. An existing repository keeps its current
        visibility.
      </p>

      {listError && <p className="text-xs text-amber-700">{listError}</p>}
      {repos && repos.length > 0 && (
        <div className="max-h-32 space-y-1 overflow-y-auto border-t border-slate-100 pt-2">
          {repos.map((repo) => (
            <button
              key={repo.fullName}
              type="button"
              disabled={props.busy}
              onClick={() => props.onSelect(repo.name)}
              className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs hover:bg-slate-100 disabled:opacity-50"
            >
              <span className="truncate">{repo.name}</span>
              <span className="ml-2 shrink-0 text-slate-400">
                {repo.private ? "private" : "public"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
