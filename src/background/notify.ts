/**
 * What DSAHub tells the user after a sync (PRD §42).
 *
 * OS notifications, rather than the seven-step progress feed PRD §42 sketches or a toast
 * injected into the page. A progress feed would have no viewer: the popup is shut while a
 * sync runs, and the whole operation finishes inside 5 s (PRD §55). A toast would have to
 * be built into LeetCode's and GeeksforGeeks' own result UI, which PRD §55 says not to
 * disturb. A notification reaches the user wherever they went next, which is the actual
 * problem — they have already navigated away by the time the commit lands.
 *
 * The wording here is where Rule 14 is enforced for the user-facing surface. "Synced" is
 * only ever said about a commit that landed; a queued sync says queued and promises a
 * retry; a sync that has run out of attempts says so and stops promising anything.
 */
import type { Problem } from "@/platforms/core/types";
import { problemKey } from "@/platforms/core/types";
import { getConfig } from "@/storage/storage";

/** `chrome.notifications` refuses to create a basic notification without one. */
const ICON = "icon-128.png";

/** Prefixes the re-solve question so its buttons can be routed back to the parked job. */
const ASK_PREFIX = "dsahub:ask:";

/** Button order in {@link askAboutResolve}, by the index Chrome reports. */
export const ASK_UPDATE = 0;

/**
 * The parked job a notification button belongs to, or `null` for any other notification.
 *
 * The job id travels in the notification id because that is the one piece of state Chrome
 * hands back to the button listener. Nothing else has to be remembered across the eviction
 * that almost certainly happens while the question is on screen.
 */
export function parkedJobId(notificationId: string): string | null {
  return notificationId.startsWith(ASK_PREFIX) ? notificationId.slice(ASK_PREFIX.length) : null;
}

/** Said only about a commit that landed. */
export function notifySynced(problem: Problem, path: string): Promise<void> {
  return showStatus(problem, {
    title: `Synced ${problem.title}`,
    message: `Committed to ${path}`,
  });
}

/** Rule 14: queued is not synced, so the title says the part that matters first. */
export function notifyQueued(problem: Problem, reason: string): Promise<void> {
  return showStatus(problem, {
    title: `${problem.title} is queued, not synced yet`,
    message: `${reason} DSAHub will keep trying for the next few minutes.`,
  });
}

/** No retry is coming. The message must not imply one. */
export function notifyFailed(problem: Problem, reason: string): Promise<void> {
  return showStatus(problem, {
    title: `Could not sync ${problem.title}`,
    message: `${reason} Open DSAHub to try again.`,
  });
}

/**
 * Asks what to do about a re-solved problem (PRD §33's `"ask"`).
 *
 * `requireInteraction` keeps it on screen: the submission is being held until it is
 * answered, so a question that auto-dismisses after a few seconds would leave the user
 * with a queue entry and no idea why.
 */
export function askAboutResolve(problem: Problem): Promise<void> {
  return show(`${ASK_PREFIX}${problemKey(problem)}`, {
    title: `${problem.title} is already saved`,
    message: "You asked to be consulted before DSAHub replaces a saved solution.",
    buttons: [{ title: "Update it" }, { title: "Keep existing" }],
    requireInteraction: true,
  });
}

type Content = Omit<chrome.notifications.NotificationCreateOptions, "type" | "iconUrl">;

/**
 * One id per problem, so a later outcome replaces an earlier one rather than leaving
 * "queued" and "synced" sitting in the notification centre contradicting each other.
 *
 * Deliberately a different namespace from {@link ASK_PREFIX}: the button listener routes
 * on the id, and it must not start guessing which notifications carry buttons.
 */
function showStatus(problem: Problem, content: Content): Promise<void> {
  return show(`dsahub:sync:${problemKey(problem)}`, content);
}

async function show(id: string, content: Content): Promise<void> {
  // PRD §42: the user can switch these off. Switching them off does not lose anything —
  // an unanswered re-solve stays in the queue, where the popup lists it with the same two
  // buttons, and every sync's outcome is on the dashboard either way.
  if (!(await getConfig()).notifications) return;

  await chrome.notifications.create(id, { type: "basic", iconUrl: ICON, ...content });
}
