// Tests for cross-tab refresh coordination (F-02): serialization, result
// reuse, failure propagation, logout races, and the stale-lock fallback.
// Run: npm test (Node built-in runner, storage/locks stubbed).
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";

import { futureToken, makeMemoryStorage } from "../../helpers/auth.ts";
import {
  coordinatedRefresh,
  markSessionAnonymous,
  readRefreshResult,
  releaseRefreshLock,
  tryAcquireRefreshLock,
} from "../../../src/lib/refreshCoordinator.ts";
import type { RefreshAttempt } from "../../../src/lib/refreshCoordinator.ts";
import { getCustomerAccessToken } from "../../../src/lib/authToken.ts";

let store: Storage;

beforeEach(() => {
  store = makeMemoryStorage();
  (globalThis as { window?: unknown }).window = { localStorage: store };
});

// Serializing LockManager stub: mimics navigator.locks — one callback at a
// time, in arrival order.
function makeSerialLocks() {
  let tail: Promise<unknown> = Promise.resolve();
  const names: string[] = [];
  return {
    names,
    request<T>(name: string, callback: () => Promise<T>): Promise<T> {
      names.push(name);
      const run = tail.then(callback);
      tail = run.catch(() => undefined);
      return run;
    },
  };
}

function successAttempt(token: string): RefreshAttempt {
  return { kind: "success", accessToken: token, expiresIn: 900 };
}

// --- single-tab behaviour (unchanged) ----------------------------------------

test("no contention: one refresh, token stored, active marker written", async () => {
  let calls = 0;
  const token = futureToken();
  const outcome = await coordinatedRefresh(async () => {
    calls += 1;
    return successAttempt(token);
  }, { store });
  assert.equal(outcome, "active");
  assert.equal(calls, 1);
  assert.equal(getCustomerAccessToken(), token);
  assert.equal(readRefreshResult(store)?.status, "active");
});

// --- cross-tab race: concurrent expired token in two tabs --------------------

test("two tabs refresh concurrently: exactly ONE rotation, both reuse the result", async () => {
  const locks = makeSerialLocks();
  let calls = 0;
  const token = futureToken();
  const doRefresh = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 20)); // slow network
    return successAttempt(token);
  };
  const [a, b] = await Promise.all([
    coordinatedRefresh(doRefresh, { store, locks }),
    coordinatedRefresh(doRefresh, { store, locks }),
  ]);
  assert.deepEqual([a, b], ["active", "active"]);
  assert.equal(calls, 1); // the second tab reused the winner's stored token
  assert.equal(getCustomerAccessToken(), token);
});

// --- failure propagation ------------------------------------------------------

test("401: token purged, anonymous marker written, waiting tab does NOT re-refresh", async () => {
  const locks = makeSerialLocks();
  let calls = 0;
  const doRefresh = async () => {
    calls += 1;
    return { kind: "unauthorized" } as RefreshAttempt;
  };
  const [a, b] = await Promise.all([
    coordinatedRefresh(doRefresh, { store, locks }),
    coordinatedRefresh(doRefresh, { store, locks }),
  ]);
  assert.deepEqual([a, b], ["anonymous", "anonymous"]);
  assert.equal(calls, 1); // fresh anonymous marker suppresses the duplicate
  assert.equal(store.getItem("vero_customer_access_token"), null);
  assert.equal(readRefreshResult(store)?.status, "anonymous");
});

test("network failure: no marker, no purge — the next attempt retries", async () => {
  let calls = 0;
  const doRefresh = async () => {
    calls += 1;
    return { kind: "failed" } as RefreshAttempt;
  };
  const first = await coordinatedRefresh(doRefresh, { store });
  assert.equal(first, "anonymous");
  assert.equal(readRefreshResult(store), null); // session may still be valid
  const second = await coordinatedRefresh(doRefresh, { store });
  assert.equal(second, "anonymous");
  assert.equal(calls, 2); // retried, not suppressed
});

// --- logout during an in-flight refresh ---------------------------------------

test("logout in another tab DURING refresh wins: fresh token is discarded", async () => {
  const token = futureToken();
  const outcome = await coordinatedRefresh(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    markSessionAnonymous(store); // user clicked logout in another tab
    return successAttempt(token);
  }, { store });
  assert.equal(outcome, "anonymous");
  assert.equal(getCustomerAccessToken(), null); // session not resurrected
  assert.equal(readRefreshResult(store)?.status, "anonymous");
});

// --- fallback mutex primitives ------------------------------------------------

test("fallback lock: fresh lock of another tab cannot be acquired or released", () => {
  const now = Date.now();
  assert.equal(tryAcquireRefreshLock(store, "tab-a", now), true);
  assert.equal(tryAcquireRefreshLock(store, "tab-b", now), false); // held
  releaseRefreshLock(store, "tab-b"); // not the owner: must not delete
  assert.notEqual(store.getItem("vero_customer_refresh_lock"), null);
  releaseRefreshLock(store, "tab-a"); // owner releases
  assert.equal(store.getItem("vero_customer_refresh_lock"), null);
});

test("fallback lock: stale lock (crashed tab) is stolen after the TTL", () => {
  const now = Date.now();
  assert.equal(tryAcquireRefreshLock(store, "tab-a", now), true);
  // Fresh lock: another tab is blocked before the TTL...
  assert.equal(tryAcquireRefreshLock(store, "tab-c", now + 5_000), false);
  // ...but after the TTL the crashed holder's lock is stolen.
  assert.equal(tryAcquireRefreshLock(store, "tab-b", now + 41_000), true);
});

test("fallback lock: corrupt entries are overwritten, corrupt result is ignored", () => {
  store.setItem("vero_customer_refresh_lock", "{not-json");
  assert.equal(tryAcquireRefreshLock(store, "tab-a", Date.now()), true);
  store.setItem("vero_customer_refresh_result", "{not-json");
  assert.equal(readRefreshResult(store), null);
  store.setItem("vero_customer_refresh_result", JSON.stringify({ status: "bogus", at: 1 }));
  assert.equal(readRefreshResult(store), null);
});

test("fallback path with a wedged lock: gives up waiting, does one direct refresh", async () => {
  // Another tab holds a fresh lock and never releases (crash without storage
  // events). With a tiny maxWait the waiter stops waiting and refreshes.
  assert.equal(tryAcquireRefreshLock(store, "dead-tab", Date.now()), true);
  const token = futureToken();
  let calls = 0;
  const outcome = await coordinatedRefresh(
    async () => {
      calls += 1;
      return successAttempt(token);
    },
    { store, lockWaitMs: 5, maxWaitMs: 20 }
  );
  assert.equal(outcome, "active");
  assert.equal(calls, 1);
  assert.equal(getCustomerAccessToken(), token);
});

