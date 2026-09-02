import { beforeEach, vi } from "vitest";

/**
 * Minimal chrome.storage.local stand-in. Tests exercise real storage logic
 * (defaults, merging) against an in-memory Map rather than mocking our own module.
 */
const store = new Map<string, unknown>();

function pick(keys: string | string[] | null): Record<string, unknown> {
  if (keys === null) return Object.fromEntries(store);
  const list = typeof keys === "string" ? [keys] : keys;
  const out: Record<string, unknown> = {};
  for (const key of list) if (store.has(key)) out[key] = store.get(key);
  return out;
}

const local = {
  get: vi.fn((keys: string | string[] | null) => Promise.resolve(pick(keys))),
  set: vi.fn((items: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(items)) store.set(key, value);
    return Promise.resolve();
  }),
  remove: vi.fn((keys: string | string[]) => {
    for (const key of typeof keys === "string" ? [keys] : keys) store.delete(key);
    return Promise.resolve();
  }),
  clear: vi.fn(() => {
    store.clear();
    return Promise.resolve();
  }),
};

globalThis.chrome = {
  storage: { local },
  runtime: {
    sendMessage: vi.fn(),
    onMessage: { addListener: vi.fn() },
    onInstalled: { addListener: vi.fn() },
    onStartup: { addListener: vi.fn() },
  },
  // Enough for the service worker to load and for assertions on what it scheduled or
  // said. Alarm names are kept in a set rather than counted, because "is the retry alarm
  // armed" is the question every test actually asks.
  alarms: {
    create: vi.fn((name: string) => {
      alarms.add(name);
      return Promise.resolve();
    }),
    clear: vi.fn((name: string) => Promise.resolve(alarms.delete(name))),
    getAll: vi.fn(() => Promise.resolve([...alarms].map((name) => ({ name })))),
    onAlarm: { addListener: vi.fn() },
  },
  notifications: {
    create: vi.fn(() => Promise.resolve("id")),
    clear: vi.fn(() => Promise.resolve(true)),
    onButtonClicked: { addListener: vi.fn() },
  },
} as unknown as typeof chrome;

/** Alarm names currently armed. Exported through the chrome stub above, not directly. */
const alarms = new Set<string>();

beforeEach(() => {
  store.clear();
  alarms.clear();
  vi.clearAllMocks();
});
