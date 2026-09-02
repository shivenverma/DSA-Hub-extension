/**
 * ISOLATED-world half of the interceptor. Listens for the MAIN world's
 * postMessages, pairs each verdict with the submit that produced it, and hands the
 * pair to whichever adapter is watching.
 *
 * Pairing is by submission id rather than "most recent submit": a user who submits
 * twice in quick succession would otherwise get the wrong code committed under an
 * Accepted verdict, which is exactly the silent-corruption failure Rule 14 forbids.
 */
import { isInterceptEvent, type SubmitEvent, type VerdictEvent } from "./intercept-protocol";

export type VerdictListener = (verdict: VerdictEvent, submit: SubmitEvent | undefined) => void;

/** Submits seen but not yet judged. Capped so a long session cannot grow it without bound. */
const MAX_PENDING = 8;
const pending = new Map<string, SubmitEvent>();
const listeners = new Set<VerdictListener>();
let listening = false;

function handleMessage(event: MessageEvent<unknown>): void {
  // Same-origin only. The page shares this origin, so this is not a trust boundary
  // against a compromised LeetCode — it only rejects other frames.
  if (event.origin !== window.location.origin) return;
  if (!isInterceptEvent(event.data)) return;

  if (event.data.kind === "submit") {
    pending.set(event.data.submissionId, event.data);
    while (pending.size > MAX_PENDING) {
      const oldest = pending.keys().next();
      if (oldest.done) break;
      pending.delete(oldest.value);
    }
    return;
  }

  const verdict = event.data;
  const submit = pending.get(verdict.submissionId);
  pending.delete(verdict.submissionId);
  for (const listener of listeners) listener(verdict, submit);
}

/** Subscribes to finished verdicts. Returns an unsubscribe function. */
export function onVerdict(listener: VerdictListener): () => void {
  if (!listening) {
    window.addEventListener("message", handleMessage);
    listening = true;
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test seam: drops all subscribers and pending submits. */
export function resetBus(): void {
  listeners.clear();
  pending.clear();
  if (listening) {
    window.removeEventListener("message", handleMessage);
    listening = false;
  }
}
