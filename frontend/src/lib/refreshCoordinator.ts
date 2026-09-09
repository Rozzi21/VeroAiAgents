// Cross-tab coordination for the single-use refresh-token rotation (F-02).
//
// Why: the backend refresh rotation is SINGLE-USE with reuse detection that
// revokes ALL of the user's sessions. Two tabs refreshing concurrently with
// the same HttpOnly cookie means one loses — and the loser's retry can trip
// reuse detection and force-logout every tab. This module serializes the
// refresh across tabs and lets waiting tabs REUSE the winner's result instead
// of rotating again.
//
// Mechanism:
// - Primary: Web Locks API (navigator.locks.request) — serializes across
//   tabs and auto-releases when a tab crashes or closes mid-refresh.
// - Fallback (no Web Locks): a localStorage mutex with a stale TTL (longer
//   than the 35s apiFetch timeout) so a crashed tab never locks refresh
//   forever, plus a `storage`-event wait (event-driven, NOT refresh polling).
//
// Result propagation: the refreshing tab writes a result marker
// (active/anonymous + timestamp) to localStorage. A 401 or an explicit logout
// writes "anonymous", so every other tab converges to the logged-out state on
// its next read. A logout that happens DURING an in-flight refresh wins: the
// refreshed token is discarded instead of resurrecting the session.
//
// The refresh token itself NEVER touches localStorage — it stays in the
// HttpOnly cookie. Only the lock entry and the outcome marker are stored.
//
// Dependency-free beyond ./authToken so it is unit-testable with the Node
// runner (storage stubbed, locks injected).

import {
  clearCustomerAccessToken,
  getCustomerAccessToken,
  setCustomerAccessToken,
} from "./authToken.ts";

export type RefreshOutcome = "active" | "anonymous";

// What the HTTP attempt produced. Mapped by the caller (api.ts) so this module
// never imports APIError (no import cycle).
export type RefreshAttempt =
  // Backend returned a new access token.
  | { kind: "success"; accessToken: string; expiresIn?: number }
  // 401: the refresh session is gone (revoked/expired/reuse-detected).
  | { kind: "unauthorized" }
  // Network/parse failure: the session may still be valid — keep any stored
  // token, do NOT mark anything, retry later.
  | { kind: "failed" };

const LOCK_NAME = "vero-customer-refresh";
const LOCK_KEY = "vero_customer_refresh_lock";
const RESULT_KEY = "vero_customer_refresh_result";

// Lock TTL must exceed the 35s apiFetch request timeout so a slow-but-alive
// refresh is never stolen mid-flight, while a crashed tab's lock expires.
export const REFRESH_LOCK_TTL_MS = 40_000;
// How long a waiter sleeps before re-checking (wakes early on storage events).
const LOCK_WAIT_MS = 40_000;
// Give up coordinating after this and do one direct refresh: by then any
// holder is long dead, so a rotation race is not realistic — hanging or
// fake-logging-out the user is worse.
const MAX_COORDINATION_WAIT_MS = 90_000;
// A fresh "anonymous" marker suppresses an immediate duplicate refresh from
// waiting tabs (they would just 401 again). Short: a real re-login in another
// tab sets a token directly and bypasses this marker.
const ANONYMOUS_RESULT_FRESH_MS = 10_000;

// Stable per-tab id (module instance === tab). Used for lock ownership.
const TAB_ID =
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `tab-${Math.random().toString(36).slice(2)}`;

type LockEntry = { tabId: string; since: number };
export type RefreshResultMarker = { status: RefreshOutcome; at: number };

type LockManagerLike = {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
};

export type CoordinatorDeps = {
  store?: Storage | null;
  locks?: LockManagerLike;
  // Timing overrides for tests.
  lockTtlMs?: number;
  lockWaitMs?: number;
  maxWaitMs?: number;
  anonFreshMs?: number;
};

function storageOrNull(): Storage | null {
  return typeof window !== "undefined" ? window.localStorage : null;
}
export function readRefreshResult(store: Storage): RefreshResultMarker | null {
  try {
    const raw = store.getItem(RESULT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RefreshResultMarker>;
    if (
      (parsed.status === "active" || parsed.status === "anonymous") &&
      typeof parsed.at === "number" &&
      Number.isFinite(parsed.at)
    ) {
      return { status: parsed.status, at: parsed.at };
    }
    return null;
  } catch {
    return null;
  }
}

function writeRefreshResult(store: Storage, status: RefreshOutcome): void {
  try {
    store.setItem(RESULT_KEY, JSON.stringify({ status, at: Date.now() }));
  } catch {
    // Storage full/blocked: coordination degrades to per-tab behaviour.
  }
}

// markSessionAnonymous is called by customerLogout: every other tab observes
// the marker (storage event / next read) and converges to logged-out, and any
// in-flight refresh discards its result instead of resurrecting the session.
export function markSessionAnonymous(store?: Storage | null): void {
  const target = store ?? storageOrNull();
  if (target) {
    writeRefreshResult(target, "anonymous");
  }
}

// tryAcquireRefreshLock implements the fallback mutex. Returns true when THIS
// tab owns the lock afterwards. A lock older than ttlMs is stale (holder
// crashed/closed) and may be stolen. Best-effort: localStorage writes are
// atomic per key, and the re-read confirms ownership when two tabs race the
// same write.
export function tryAcquireRefreshLock(
  store: Storage,
  tabId: string,
  now: number,
  ttlMs: number = REFRESH_LOCK_TTL_MS
): boolean {
  try {
    const raw = store.getItem(LOCK_KEY);
    if (raw) {
      const existing = JSON.parse(raw) as Partial<LockEntry>;
      if (
        typeof existing.tabId === "string" &&
        typeof existing.since === "number" &&
        now - existing.since < ttlMs
      ) {
        return existing.tabId === tabId; // fresh lock: only the owner proceeds
      }
      // stale: fall through and steal
    }
    store.setItem(LOCK_KEY, JSON.stringify({ tabId, since: now }));
    const confirm = JSON.parse(store.getItem(LOCK_KEY) ?? "{}") as Partial<LockEntry>;
    return confirm.tabId === tabId;
  } catch {
    // Corrupt entry: overwrite and confirm.
    try {
      store.setItem(LOCK_KEY, JSON.stringify({ tabId, since: now }));
      const confirm = JSON.parse(store.getItem(LOCK_KEY) ?? "{}") as Partial<LockEntry>;
      return confirm.tabId === tabId;
    } catch {
      return false;
    }
  }
}

// releaseRefreshLock removes the lock only when THIS tab owns it — a waiter
// must never delete another tab's fresh lock.
export function releaseRefreshLock(store: Storage, tabId: string): void {
  try {
    const raw = store.getItem(LOCK_KEY);
    if (!raw) return;
    const existing = JSON.parse(raw) as Partial<LockEntry>;
    if (existing.tabId === tabId) {
      store.removeItem(LOCK_KEY);
    }
  } catch {
    // Corrupt lock entry: remove it so nobody waits on garbage.
    try {
      store.removeItem(LOCK_KEY);
    } catch {
      // ignore
    }
  }
}

// waitForLockChange resolves early when another tab writes the lock/result
// keys (storage events fire in every tab EXCEPT the writer), or after
// timeoutMs. Event-driven — this is NOT refresh polling.
function waitForLockChange(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || typeof window.addEventListener !== "function") {
      setTimeout(resolve, timeoutMs);
      return;
    }
    const timer = setTimeout(done, timeoutMs);
    function onStorage(event: StorageEvent) {
      if (event.key === null || event.key === LOCK_KEY || event.key === RESULT_KEY) {
        done();
      }
    }
    function done() {
      clearTimeout(timer);
      window.removeEventListener("storage", onStorage);
      resolve();
    }
    window.addEventListener("storage", onStorage);
  });
}

// runRefreshCriticalSection runs EXCLUSIVELY (one tab at a time). Reuses the
// previous holder's result, discards tokens that race a logout, and
// propagates the outcome via the result marker.
async function runRefreshCriticalSection(
  store: Storage,
  doRefresh: () => Promise<RefreshAttempt>,
  anonFreshMs: number
): Promise<RefreshOutcome> {
  // The previous lock holder may have just refreshed — shared storage means
  // the token is already visible here. Never rotate twice.
  if (getCustomerAccessToken()) {
    return "active";
  }
  const startedAt = Date.now();
  // A recent anonymous marker (another tab's 401 or logout) means the session
  // is definitively gone: do not fire a duplicate refresh that would 401.
  const prior = readRefreshResult(store);
  if (
    prior?.status === "anonymous" &&
    prior.at <= startedAt &&
    startedAt - prior.at < anonFreshMs
  ) {
    return "anonymous";
  }

  const attempt = await doRefresh();

  if (attempt.kind === "success") {
    // A logout in ANY tab during the in-flight request wins: the anonymous
    // marker is not older than our start (a fresh pre-existing one would have
    // short-circuited above), so discard the fresh token instead of
    // resurrecting a session the user just signed out of.
    const raced = readRefreshResult(store);
    if (raced?.status === "anonymous" && raced.at >= startedAt) {
      clearCustomerAccessToken();
      return "anonymous";
    }
    if (setCustomerAccessToken(attempt.accessToken, attempt.expiresIn)) {
      writeRefreshResult(store, "active");
      return "active";
    }
    // Storage rejected a valid token: nothing persisted — anonymous.
    return "anonymous";
  }
  if (attempt.kind === "unauthorized") {
    // Session revoked/expired/reuse-detected: clear locally and tell every
    // other tab so all of them converge to logged-out.
    clearCustomerAccessToken();
    writeRefreshResult(store, "anonymous");
    return "anonymous";
  }
  // "failed" (network): keep any stored token, write no marker — the session
  // may still be valid once connectivity returns.
  return "anonymous";
}

// coordinatedRefresh guarantees that across ALL tabs at most ONE refresh
// request is in flight for the shared session, and that waiters reuse its
// result. Single-tab behaviour is unchanged: with no contention this is just
// one refresh under a trivially-acquired lock.
export async function coordinatedRefresh(
  doRefresh: () => Promise<RefreshAttempt>,
  deps: CoordinatorDeps = {}
): Promise<RefreshOutcome> {
  const store = deps.store ?? storageOrNull();
  const anonFreshMs = deps.anonFreshMs ?? ANONYMOUS_RESULT_FRESH_MS;
  if (!store) {
    // No storage (SSR): no coordination possible — direct best-effort attempt.
    const attempt = await doRefresh();
    return attempt.kind === "success" ? "active" : "anonymous";
  }
  if (getCustomerAccessToken()) {
    return "active";
  }
  const locks =
    deps.locks ??
    (typeof navigator !== "undefined"
      ? (navigator as { locks?: LockManagerLike }).locks
      : undefined);
  if (locks && typeof locks.request === "function") {
    // Web Locks: serializes across tabs; the browser auto-releases the lock
    // when a tab crashes or closes mid-refresh — no stale-lock handling needed.
    return locks.request(LOCK_NAME, () =>
      runRefreshCriticalSection(store, doRefresh, anonFreshMs)
    );
  }
  // Fallback: localStorage mutex with stale TTL + event-driven wait.
  const lockTtlMs = deps.lockTtlMs ?? REFRESH_LOCK_TTL_MS;
  const lockWaitMs = deps.lockWaitMs ?? LOCK_WAIT_MS;
  const deadline = Date.now() + (deps.maxWaitMs ?? MAX_COORDINATION_WAIT_MS);
  for (;;) {
    if (getCustomerAccessToken()) {
      return "active";
    }
    if (tryAcquireRefreshLock(store, TAB_ID, Date.now(), lockTtlMs)) {
      try {
        return await runRefreshCriticalSection(store, doRefresh, anonFreshMs);
      } finally {
        releaseRefreshLock(store, TAB_ID);
      }
    }
    if (Date.now() >= deadline) {
      // Coordination wedged (dead holder, no storage events). One direct
      // refresh beats hanging or a false logout.
      return runRefreshCriticalSection(store, doRefresh, anonFreshMs);
    }
    await waitForLockChange(Math.min(lockWaitMs, Math.max(0, deadline - Date.now())));
  }
}

