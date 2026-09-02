/**
 * PRD §40's settings list, inside the popup rather than a separate options page.
 *
 * A second HTML entry point and a second React root would duplicate the whole popup shell
 * for ten fields, and PRD §41's mock already has a `[Settings]` button to reach them from.
 *
 * "Folder Naming" is the one item on §40's list that is not here: PRD §22 and §23 fix the
 * repository layout — category folder, then `NNNN-Title` or the platform's slug — so there
 * is nothing for the user to choose. A dropdown with one option is worse than no dropdown.
 */
import { useEffect, useState } from "react";
import { sendToBackground } from "@/messaging";
import type { Config } from "@/storage/storage";

export function Settings(props: {
  busy: boolean;
  login: string;
  config: Config;
  onPatch: (patch: Partial<Config>) => void;
  onChangeRepo: () => void;
  onDisconnect: () => void;
  onVerify: () => Promise<{ path: string; branch: string } | null>;
  onBack: () => void;
}) {
  const { config } = props;
  const [branches, setBranches] = useState<string[] | null>(null);
  const [verified, setVerified] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const result = await sendToBackground({ t: "BRANCH_LIST" });
      if (result.ok) setBranches(result.value.branches);
    })();
  }, [config.repoName]);

  return (
    <div className="space-y-3 text-sm">
      <button
        type="button"
        onClick={props.onBack}
        className="text-xs text-slate-400 underline hover:text-slate-600"
      >
        ← Back to dashboard
      </button>

      <section className="space-y-1">
        <h2 className="text-xs font-semibold tracking-wide text-slate-500">GitHub account</h2>
        <div className="flex items-baseline justify-between">
          <span className="text-slate-700">@{props.login}</span>
          <button
            type="button"
            onClick={props.onDisconnect}
            className="text-xs text-slate-400 underline hover:text-slate-600"
          >
            Disconnect
          </button>
        </div>
      </section>

      <section className="space-y-1">
        <h2 className="text-xs font-semibold tracking-wide text-slate-500">Repository</h2>
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-slate-700">
            {config.repoOwner}/{config.repoName}
          </span>
          <button
            type="button"
            onClick={props.onChangeRepo}
            className="shrink-0 text-xs text-slate-400 underline hover:text-slate-600"
          >
            Change
          </button>
        </div>

        <label className="block pt-1 text-xs font-medium text-slate-500" htmlFor="branch">
          Branch
        </label>
        <select
          id="branch"
          value={config.branch ?? ""}
          onChange={(event) => props.onPatch({ branch: event.target.value })}
          className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
        >
          {(branches ?? [config.branch ?? "main"]).map((branch) => (
            <option key={branch} value={branch}>
              {branch}
            </option>
          ))}
        </select>
      </section>

      <section className="space-y-1 border-t border-slate-100 pt-2">
        <h2 className="text-xs font-semibold tracking-wide text-slate-500">Syncing</h2>

        <Toggle
          label="Sync automatically"
          hint="Off: accepted solutions are held on the dashboard until you press Sync now."
          checked={config.autoSync}
          onChange={(autoSync) => props.onPatch({ autoSync })}
        />
        <Toggle
          label="Notifications"
          hint="A line when a solution lands, or when one could not be pushed."
          checked={config.notifications}
          onChange={(notifications) => props.onPatch({ notifications })}
        />
        <Toggle
          label="Update the main README"
          hint="Keeps the dashboard between DSAHub's markers up to date. Your own text is left alone."
          checked={config.updateReadme}
          onChange={(updateReadme) => props.onPatch({ updateReadme })}
        />
        <Toggle
          label="Write a README per problem"
          hint="A short page beside each solution with the difficulty, topics and a link back."
          checked={config.problemReadmes}
          onChange={(problemReadmes) => props.onPatch({ problemReadmes })}
        />

        <Choice
          id="file-naming"
          label="Solution file name"
          value={config.fileNaming}
          options={[
            { value: "solution", label: "solution.cpp" },
            { value: "problem-name", label: "two-sum.cpp — the problem's name" },
            { value: "main", label: "main.cpp" },
          ]}
          onChange={(fileNaming) => props.onPatch({ fileNaming })}
        />

        <Choice
          id="duplicates"
          label="When you re-solve a problem"
          value={config.duplicateHandling}
          options={[
            { value: "update", label: "Replace the saved solution" },
            { value: "ignore", label: "Keep the saved solution" },
            { value: "ask", label: "Ask me each time" },
          ]}
          onChange={(duplicateHandling) => props.onPatch({ duplicateHandling })}
        />
      </section>

      <section className="space-y-1 border-t border-slate-100 pt-2">
        <button
          type="button"
          disabled={props.busy}
          onClick={() =>
            void props.onVerify().then((result) => {
              if (result) setVerified(`Committed ${result.path} to ${result.branch}.`);
            })
          }
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-50"
        >
          {props.busy ? "Checking…" : "Verify write access"}
        </button>
        {verified && <p className="text-xs text-emerald-700">{verified}</p>}
        <p className="text-xs text-slate-400">
          Writes one small file so you know a real sync will work — reading permissions
          cannot prove that.
        </p>
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
    <label className="flex cursor-pointer items-start gap-2 py-1">
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(event) => props.onChange(event.target.checked)}
        className="mt-1"
      />
      <span>
        <span className="block text-slate-700">{props.label}</span>
        <span className="block text-xs text-slate-400">{props.hint}</span>
      </span>
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
    <div className="pt-1">
      <label className="block text-xs font-medium text-slate-500" htmlFor={props.id}>
        {props.label}
      </label>
      <select
        id={props.id}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value as T)}
        className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
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
