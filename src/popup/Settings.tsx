/**
 * Settings view for DSAHub.
 *
 * Configures Appearance (Avatar personalization, Theme), GitHub account & repo,
 * Sync behavior, Solution organization, and README generation.
 */

import { useEffect, useState } from "react";
import { sendToBackground } from "@/messaging";
import type { Config } from "@/storage/storage";
import { AvatarPicker } from "./components/AvatarPicker";

export function Settings(props: {
  busy: boolean;
  login: string;
  config: Config;
  avatar: string;
  onAvatarChange: (avatar: string) => void;
  onPatch: (patch: Partial<Config>) => void;
  onChangeRepo: () => void;
  onDisconnect: () => void;
  onVerify: () => Promise<{ path: string; branch: string } | null>;
  onBack: () => void;
}) {
  const { config, avatar, onAvatarChange } = props;
  const [branches, setBranches] = useState<string[] | null>(null);
  const [verified, setVerified] = useState<string | null>(null);
  const [pickingAvatar, setPickingAvatar] = useState(false);

  useEffect(() => {
    void (async () => {
      const result = await sendToBackground({ t: "BRANCH_LIST" });
      if (result.ok) setBranches(result.value.branches);
    })();
  }, [config.repoName]);

  return (
    <div className="space-y-4 text-sm">
      {/* Navigation header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
        <button
          type="button"
          onClick={props.onBack}
          className="flex cursor-pointer items-center gap-1 text-xs font-medium text-zinc-400 transition hover:text-zinc-200"
        >
          <span>‹</span>
          <span>Back</span>
        </button>
        <span className="text-xs font-semibold tracking-tight text-zinc-300">Settings</span>
        <div className="w-8" />
      </div>

      {/* Appearance Section */}
      <section className="space-y-2">
        <h2 className="text-[11px] font-semibold tracking-wider uppercase text-zinc-400">
          Appearance
        </h2>

        <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#161618] divide-y divide-white/[0.04]">
          {/* Avatar Row */}
          <div className="p-3">
            <button
              type="button"
              onClick={() => setPickingAvatar(!pickingAvatar)}
              className="flex w-full cursor-pointer items-center justify-between text-xs text-zinc-200 transition"
            >
              <div className="flex items-center gap-2">
                <span>Avatar</span>
                <span className="text-base leading-none">{avatar}</span>
              </div>
              <span className="text-xs text-zinc-500 font-medium flex items-center gap-1">
                <span>{pickingAvatar ? "Close" : "Change"}</span>
                <span className="text-zinc-600">›</span>
              </span>
            </button>

            {pickingAvatar && (
              <div className="mt-3 border-t border-white/[0.06] pt-3">
                <AvatarPicker
                  selected={avatar}
                  onSelect={(newAvatar) => {
                    onAvatarChange(newAvatar);
                    setPickingAvatar(false);
                  }}
                />
              </div>
            )}
          </div>

          {/* Theme Row */}
          <div className="flex items-center justify-between p-3 text-xs text-zinc-200">
            <span>Theme</span>
            <div className="flex items-center gap-1.5 text-zinc-400">
              <span className="flex h-2 w-2 rounded-full bg-zinc-400" />
              <span>Dark</span>
            </div>
          </div>
        </div>
      </section>

      {/* GitHub Account Section */}
      <section className="space-y-2">
        <h2 className="text-[11px] font-semibold tracking-wider uppercase text-zinc-400">
          GitHub
        </h2>

        <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#161618] divide-y divide-white/[0.04]">
          <div className="flex items-center justify-between p-3 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-zinc-400 font-mono truncate">@{props.login}</span>
            </div>
            <button
              type="button"
              onClick={props.onDisconnect}
              className="text-xs text-rose-400 hover:text-rose-300 font-medium cursor-pointer"
            >
              Disconnect
            </button>
          </div>

          <div className="p-3 space-y-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-zinc-400">Repository</span>
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-mono text-zinc-200 truncate">
                  {config.repoOwner}/{config.repoName}
                </span>
                <button
                  type="button"
                  onClick={props.onChangeRepo}
                  className="shrink-0 text-zinc-400 hover:text-zinc-200 font-medium cursor-pointer"
                >
                  Change
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <label htmlFor="branch-select" className="text-zinc-400">
                Branch
              </label>
              <select
                id="branch-select"
                value={config.branch ?? ""}
                onChange={(event) => props.onPatch({ branch: event.target.value })}
                className="rounded-lg border border-white/[0.1] bg-[#1a1a1d] px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-white/20 cursor-pointer font-mono"
              >
                {(branches ?? [config.branch ?? "main"]).map((branch) => (
                  <option key={branch} value={branch}>
                    {branch}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* Syncing Options */}
      <section className="space-y-2">
        <h2 className="text-[11px] font-semibold tracking-wider uppercase text-zinc-400">
          Sync & Automation
        </h2>

        <div className="rounded-2xl border border-white/[0.08] bg-[#161618] p-3 space-y-3">
          <Toggle
            label="Sync automatically"
            hint="When off, solutions are queued until you press Sync now."
            checked={config.autoSync}
            onChange={(autoSync) => props.onPatch({ autoSync })}
          />
          <Toggle
            label="Notifications"
            hint="Notify when solutions are committed or fail."
            checked={config.notifications}
            onChange={(notifications) => props.onPatch({ notifications })}
          />
          <Toggle
            label="Update main README"
            hint="Keeps dashboard progress statistics up to date in repository."
            checked={config.updateReadme}
            onChange={(updateReadme) => props.onPatch({ updateReadme })}
          />
          <Toggle
            label="Problem README"
            hint="Writes a dedicated markdown description beside each solution."
            checked={config.problemReadmes}
            onChange={(problemReadmes) => props.onPatch({ problemReadmes })}
          />

          <Choice
            id="file-naming"
            label="Solution file naming"
            value={config.fileNaming}
            options={[
              { value: "solution", label: "solution.cpp" },
              { value: "problem-name", label: "two-sum.cpp" },
              { value: "main", label: "main.cpp" },
            ]}
            onChange={(fileNaming) => props.onPatch({ fileNaming })}
          />

          <Choice
            id="duplicates"
            label="On duplicate submission"
            value={config.duplicateHandling}
            options={[
              { value: "update", label: "Replace existing solution" },
              { value: "ignore", label: "Keep existing solution" },
              { value: "ask", label: "Ask me each time" },
            ]}
            onChange={(duplicateHandling) => props.onPatch({ duplicateHandling })}
          />
        </div>
      </section>

      {/* Verification */}
      <section className="space-y-2 pt-1">
        <button
          type="button"
          disabled={props.busy}
          onClick={() =>
            void props.onVerify().then((result) => {
              if (result) setVerified(`Committed ${result.path} to ${result.branch}.`);
            })
          }
          className="flex w-full cursor-pointer items-center justify-center rounded-xl border border-white/[0.1] bg-[#1a1a1d] px-3 py-2 text-xs font-medium text-zinc-300 transition hover:bg-white/[0.08] hover:text-white disabled:opacity-50"
        >
          {props.busy ? "Verifying…" : "Verify GitHub Write Access"}
        </button>
        {verified && (
          <p className="text-[11px] text-emerald-400 font-mono text-center">
            {verified}
          </p>
        )}
      </section>
    </div>
  );
}

function Toggle(props: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 text-xs">
      <div>
        <span className="block font-medium text-zinc-200">{props.label}</span>
        <span className="block text-[11px] text-zinc-500 leading-tight mt-0.5">
          {props.hint}
        </span>
      </div>
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(event) => props.onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
      />
    </label>
  );
}

function Choice<T extends string>(props: {
  id: string;
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="pt-1 text-xs">
      <label className="block text-[11px] font-medium text-zinc-400 mb-1" htmlFor={props.id}>
        {props.label}
      </label>
      <select
        id={props.id}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value as T)}
        className="w-full rounded-xl border border-white/[0.08] bg-[#1a1a1d] px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-white/20 cursor-pointer"
      >
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
