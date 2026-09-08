// B-GENUI-3 / B-GENUI-4 (9 Sep 2026): card "Select Package" synchronizes with
// the backend. These tests lock the UI-state contract:
//   - selection changes ONLY on a structured backend success,
//   - failures never mark a package selected,
//   - the backend echo (`done` / history) is the source of truth on reload,
//   - the client never keyword-matches "paket lain" or parses assistant text.
// Run: npm test (Node built-in runner).
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  initialPackageSelection,
  isPackageSelected,
  selectionFailed,
  selectionStarted,
  selectionSucceeded,
  selectionSynced,
} from "../../../src/lib/packageSelection.ts";
import { APIError, selectPackage } from "../../../src/lib/api.ts";

// --- state transitions -----------------------------------------------------

test("starting a selection keeps the current selection and clears the error", () => {
  const state = selectionStarted(
    { selectedTripId: "trip-a", pendingTripId: null, error: "lama" },
    "trip-b"
  );
  assert.equal(state.selectedTripId, "trip-a"); // not yet confirmed
  assert.equal(state.pendingTripId, "trip-b");
  assert.equal(state.error, null);
});

test("successful backend selection marks the package selected", () => {
  const done = selectionSucceeded("trip-b");
  assert.equal(done.selectedTripId, "trip-b");
  assert.equal(done.pendingTripId, null);
  assert.equal(done.error, null);
  assert.ok(isPackageSelected(done, "trip-b"));
  assert.ok(!isPackageSelected(done, "trip-a"));
});

test("failed selection does NOT change the selected package", () => {
  const selected = selectionSucceeded("trip-a");
  const pending = selectionStarted(selected, "trip-b");
  const failed = selectionFailed(pending, "trip not found");
  // trip-a stays the active package; trip-b is NOT marked selected.
  assert.equal(failed.selectedTripId, "trip-a");
  assert.equal(failed.pendingTripId, null);
  assert.equal(failed.error, "trip not found");
  assert.ok(!isPackageSelected(failed, "trip-b"));
});

test("successful alternative selection marks only the confirmed package", () => {
  const second = selectionSucceeded("trip-b");
  assert.equal(second.selectedTripId, "trip-b");
  assert.ok(isPackageSelected(second, "trip-b"));
  assert.ok(!isPackageSelected(second, "trip-a"));
});

test("backend echo (done/history) is the source of truth, including clearing", () => {
  const selected = selectionSucceeded("trip-a");
  const synced = selectionSynced(selected, "trip-b");
  assert.equal(synced.selectedTripId, "trip-b");
  // An echo without a selection (older session / cleared server-side) clears
  // the local state too.
  assert.equal(selectionSynced(synced, null).selectedTripId, null);
  // A sync never clobbers an in-flight pending marker or error.
  const pending = selectionStarted(selected, "trip-c");
  assert.equal(selectionSynced(pending, "trip-a").pendingTripId, "trip-c");
});

// --- API contract ----------------------------------------------------------

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
      clear: () => undefined,
      key: () => null,
      length: 0,
    },
  };
});

test("selectPackage posts trip_id to the existing backend selection flow", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  (globalThis as { fetch?: unknown }).fetch = (url: string, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    return Promise.resolve(
      jsonResponse({ success: true, message: "Package selected", data: { selected_trip_id: "trip-9" } })
    );
  };

  const res = await selectPackage("trip-9");
  assert.equal(res.selected_trip_id, "trip-9");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/v1/chat/select-package");
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), { trip_id: "trip-9" });
});

test("selectPackage failure rejects with the backend message (no silent success)", async () => {
  (globalThis as { fetch?: unknown }).fetch = () =>
    Promise.resolve(
      jsonResponse({ success: false, message: "trip not found", error: {} }, 400)
    );

  await assert.rejects(selectPackage("nope"), (err: unknown) => {
    assert.ok(err instanceof APIError);
    assert.equal((err as APIError).message, "trip not found");
    return true;
  });
});


// --- structural guards (frontend tests 12 + 13) -----------------------------
// The alternative-request intent ("paket lain") is classified by the AI/tool
// flow on the backend. The client must not keyword-match user/assistant text
// and must not parse assistant prose to decide selection or recommendations.

test("chat UI contains no 'paket lain' keyword matching", () => {
  const chatInterface = readFileSync(
    new URL("../../../src/components/chat/ChatInterface.tsx", import.meta.url),
    "utf8"
  );
  const card = readFileSync(
    new URL("../../../src/components/cards/RecommendationCard.tsx", import.meta.url),
    "utf8"
  );
  for (const source of [chatInterface, card]) {
    // Call sites only: display strings (e.g. the "Alternatif paket lain dari
    // Vero" heading, which branches on the backend-owned reason field) are
    // fine; matching user/assistant text against package keywords is not.
    assert.ok(
      !source.match(/\.includes\(\s*['"`][^'"`]*paket/i),
      "no package keyword matching via includes()"
    );
    assert.ok(
      !source.match(/\.match(?:es)?\(\s*\/?[^)]*paket/i),
      "no package keyword matching via match()"
    );
  }
});

test("selection state is driven by structured outcomes, not assistant text", () => {
  // selectionSynced/selectionSucceeded take a backend-provided trip id — there
  // is intentionally no transition that accepts a message/content string.
  const state = selectionSynced(initialPackageSelection, null);
  assert.equal(state.selectedTripId, null);
  assert.equal(initialPackageSelection.error, null);
});
