// mapHistoryMessages reconstructs Travel Package cards from the persisted
// history payload alone (GenUI persistence, 6 Sep 2026). The mapper is pure —
// no fetch, no search_trips, no LLM — so these tests need no stubs at all:
// a reload can never CREATE a recommendation, it can only re-attach the one
// the server already persisted on the message.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  createChatTurnCompletionGuard,
  mapHistoryMessages,
  markAssistantStreamFailed,
  reconcileFailedTurn,
  replaceAssistantPlaceholder,
  type HistoryChatMessage,
} from "./chatHistory.ts";
import type { GuestChatHistoryResponse, TripPackage } from "./api.ts";
import { initialPackageSelection, selectionSynced } from "./packageSelection.ts";

type HistoryPayload = GuestChatHistoryResponse["messages"];
type RecoveryMessage = HistoryChatMessage & { streaming?: boolean };

function trip(id: string, title: string): TripPackage {
  return {
    id,
    title,
    slug: title.toLowerCase().replaceAll(" ", "-"),
    destination: "Bali",
    location: "Bali",
    category: "domestic",
    status: "published",
    summary: "",
    overview: "",
    duration: "3D2N",
    image_url: "",
    base_price: 1500000,
    estimated_price: 1500000,
  };
}

function discountedTrip(id: string, title: string): TripPackage {
  return {
    ...trip(id, title),
    destination: "Bali",
    duration: "3D2N",
    base_price: 2_000_000,
    estimated_price: 2_000_000,
    discount_enabled: true,
    discount_price: 1_500_000,
    child_price: 1_000_000,
    child_discount_enabled: true,
    child_discount_price: 750_000,
  };
}

const SERVER_MSG_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function payloadWithRecommendation(): HistoryPayload {
  return [
    { id: "user-1", role: "user", content: "cari paket bali" },
    {
      id: SERVER_MSG_ID,
      role: "assistant",
      content: "Ini rekomendasi paket untuk Anda.",
      recommendation: {
        show_recommendations: true,
        recommendation_reason: "initial",
        recommended_packages: [trip("trip-1", "Bali Adventure")],
      },
    },
    // Old message from before recommendation persistence existed.
    { id: "old-1", role: "assistant", content: "Ada lagi yang bisa dibantu?" },
  ];
}

test("history reconstructs the persisted recommendation on the same message", () => {
  const mapped = mapHistoryMessages(payloadWithRecommendation(), () => {
    throw new Error("fallback must not run when the server id is present");
  });

  assert.equal(mapped.length, 3);
  const assistant = mapped[1];
  // The recommendation rides on the SAME logical message — never a second one.
  assert.equal(assistant.id, SERVER_MSG_ID);
  assert.equal(assistant.content, "Ini rekomendasi paket untuk Anda.");
  assert.equal(assistant.showRecommendations, true);
  assert.equal(assistant.recommendationReason, "initial");
  assert.equal(assistant.packages?.length, 1);
  assert.equal(assistant.packages?.[0].id, "trip-1");
});

test("history reload preserves complete authoritative pricing fields", () => {
  const payload = payloadWithRecommendation();
  payload[1].recommendation!.recommended_packages = [
    discountedTrip("trip-priced", "Bali Adventure"),
  ];

  const assistant = mapHistoryMessages(payload, () => "fallback")[1];
  const priced = assistant.packages?.[0];
  assert.equal(priced?.base_price, 2_000_000);
  assert.equal(priced?.discount_enabled, true);
  assert.equal(priced?.discount_price, 1_500_000);
  assert.equal(priced?.child_price, 1_000_000);
  assert.equal(priced?.child_discount_enabled, true);
  assert.equal(priced?.child_discount_price, 750_000);
  assert.equal(priced?.destination, "Bali");
  assert.equal(priced?.duration, "3D2N");
});

test("messages without metadata stay text-only (backward compatibility)", () => {
  const mapped = mapHistoryMessages(payloadWithRecommendation(), () => "fallback");
  const old = mapped[2];

  assert.equal(old.content, "Ada lagi yang bisa dibantu?");
  assert.equal(old.showRecommendations, undefined);
  assert.equal(old.packages, undefined);
  assert.equal(old.recommendationReason, undefined);
});

test("recommendation belongs to its own assistant message, not its neighbours", () => {
  const mapped = mapHistoryMessages(payloadWithRecommendation(), () => "fallback");

  assert.equal(mapped[0].showRecommendations, undefined);
  assert.equal(mapped[0].packages, undefined);
  assert.equal(mapped[2].showRecommendations, undefined);
});

test("repeated mapping (remount / re-render) changes nothing and creates nothing", () => {
  const payload = payloadWithRecommendation();
  const first = mapHistoryMessages(payload, () => "fallback");
  const second = mapHistoryMessages(payload, () => "fallback");

  // Same stable ids, same recommendation — the second pass neither invents a
  // new recommendation nor duplicates the existing one.
  assert.deepEqual(second, first);
  assert.equal(second.filter((m) => m.showRecommendations).length, 1);
  assert.equal(second[1].id, SERVER_MSG_ID);
});

test("legacy payloads without server ids fall back to the local counter", () => {
  // Conversations persisted before message ids existed still render.
  const legacy: HistoryPayload = [
    { role: "user", content: "halo" },
    { role: "assistant", content: "Halo! Ada yang bisa dibantu?" },
  ];
  let n = 0;
  const mapped = mapHistoryMessages(legacy, () => `msg-${++n}`);

  assert.equal(mapped[0].id, "msg-1");
  assert.equal(mapped[1].id, "msg-2");
  assert.equal(mapped[1].showRecommendations, undefined);
});

test("two recommendation sets (initial + alternative) both survive reload", () => {
  // B-GENUI-4: after selecting from set A the user can ask for another
  // package; set B is a NEW assistant message and set A stays visible.
  const payload: HistoryPayload = [
    { id: "u-1", role: "user", content: "cari paket bali" },
    {
      id: "set-a",
      role: "assistant",
      content: "Ini rekomendasi paket untuk Anda.",
      recommendation: {
        show_recommendations: true,
        recommendation_reason: "initial",
        recommended_packages: [trip("trip-1", "Bali Adventure")],
      },
    },
    { id: "u-2", role: "user", content: "carikan paket lain" },
    {
      id: "set-b",
      role: "assistant",
      content: "Berikut pilihan paket yang berbeda.",
      recommendation: {
        show_recommendations: true,
        recommendation_reason: "alternative",
        recommended_packages: [trip("trip-2", "Bromo Sunrise")],
      },
    },
  ];
  const mapped = mapHistoryMessages(payload, () => "fallback");
  assert.equal(mapped.filter((m) => m.showRecommendations).length, 2);
  assert.equal(mapped[1].id, "set-a");
  assert.equal(mapped[1].recommendationReason, "initial");
  assert.equal(mapped[1].packages?.[0].id, "trip-1");
  assert.equal(mapped[3].id, "set-b");
  assert.equal(mapped[3].recommendationReason, "alternative");
  assert.equal(mapped[3].packages?.[0].id, "trip-2");
});

test("malformed metadata (flag on, no packages) renders as text-only", () => {
  const payload: HistoryPayload = [
    {
      id: SERVER_MSG_ID,
      role: "assistant",
      content: "Teks saja.",
      recommendation: { show_recommendations: true, recommendation_reason: "initial" },
    },
  ];
  const mapped = mapHistoryMessages(payload, () => "fallback");

  assert.equal(mapped[0].showRecommendations, undefined);
  assert.equal(mapped[0].packages, undefined);
});

test("failed placeholder becomes matching persisted assistant with recommendations", () => {
  const current: RecoveryMessage[] = [
    { id: "older-set", role: "assistant" as const, content: "Set lama", showRecommendations: true, packages: [trip("old", "Old")] },
    { id: "local-user", role: "user" as const, content: "carikan paket lain" },
    { id: "local-placeholder", role: "assistant" as const, content: "parsial", streaming: true },
  ];
  const persisted: HistoryPayload = [
    { id: "old-user", role: "user", content: "cari paket bali" },
    { id: "older-set", role: "assistant", content: "Set lama" },
    { id: "persisted-user", role: "user", content: "carikan paket lain" },
    {
      id: "recovered-alternative",
      role: "assistant",
      content: "Pilihan alternatif tersimpan.",
      recommendation: {
        show_recommendations: true,
        recommendation_reason: "alternative",
        recommended_packages: [trip("alternative", "Bromo Sunrise")],
      },
    },
  ];

  const result = reconcileFailedTurn(
    current,
    persisted,
    "carikan paket lain",
    "local-placeholder",
    () => "fallback",
    (message) => ({ ...message, streaming: false })
  );

  assert.equal(result.recovered?.id, "recovered-alternative");
  assert.equal(result.messages.length, 3);
  assert.equal(result.messages[0].id, "older-set");
  assert.equal(result.messages[0].packages?.[0].id, "old");
  assert.equal(result.messages[2].id, "recovered-alternative");
  assert.equal(result.messages[2].recommendationReason, "alternative");
  assert.equal(result.messages[2].packages?.[0].id, "alternative");
});

test("alternative recovery preserves previous set and persisted selected_trip_id", () => {
  const selectedTripId = "selected-trip";
  const current: RecoveryMessage[] = [
    {
      id: "initial-recommendation",
      role: "assistant",
      content: "Pilihan awal",
      showRecommendations: true,
      recommendationReason: "initial",
      packages: [trip(selectedTripId, "Bali Adventure")],
    },
    { id: "alternative-user", role: "user", content: "alternatif lain" },
    { id: "alternative-placeholder", role: "assistant", content: "", streaming: true },
  ];
  const history: GuestChatHistoryResponse = {
    selected_trip_id: selectedTripId,
    messages: [
      { id: "server-user", role: "user", content: "alternatif lain" },
      {
        id: "alternative-server",
        role: "assistant",
        content: "Pilihan alternatif",
        recommendation: {
          show_recommendations: true,
          recommendation_reason: "alternative",
          recommended_packages: [trip("alternative-trip", "Lombok Adventure")],
        },
      },
    ],
  };

  const result = reconcileFailedTurn(
    current,
    history.messages,
    "alternatif lain",
    "alternative-placeholder",
    () => "never-used",
    (message) => ({ ...message, streaming: false })
  );
  const selection = selectionSynced(
    initialPackageSelection,
    history.selected_trip_id ?? null
  );

  assert.equal(result.messages.length, 3);
  assert.equal(result.messages[0].id, "initial-recommendation");
  assert.equal(result.messages[0].packages?.[0].id, selectedTripId);
  assert.equal(result.messages[2].id, "alternative-server");
  assert.equal(result.messages[2].recommendationReason, "alternative");
  assert.equal(result.messages[2].packages?.[0].id, "alternative-trip");
  assert.equal(selection.selectedTripId, selectedTripId);
});

test("duplicate reconciliation removes placeholder and keeps one stable server message", () => {
  const current: RecoveryMessage[] = [
    { id: "user-local", role: "user" as const, content: "halo" },
    { id: "server-assistant", role: "assistant" as const, content: "Sudah selesai" },
    { id: "placeholder", role: "assistant" as const, content: "", streaming: true },
  ];
  const persisted: HistoryPayload = [
    { id: "server-user", role: "user", content: "halo" },
    { id: "server-assistant", role: "assistant", content: "Sudah selesai" },
  ];

  const result = reconcileFailedTurn(
    current,
    persisted,
    "halo",
    "placeholder",
    () => "fallback",
    (message) => ({ ...message, streaming: false })
  );

  assert.equal(result.recovered?.id, "server-assistant");
  assert.deepEqual(result.messages.map((message) => message.id), [
    "user-local",
    "server-assistant",
  ]);
});

test("reconciliation leaves state unchanged when matching turn was not persisted", () => {
  const current: RecoveryMessage[] = [
    { id: "user-local", role: "user" as const, content: "halo" },
    { id: "placeholder", role: "assistant" as const, content: "", streaming: true },
  ];
  const result = reconcileFailedTurn(
    current,
    [{ id: "other-user", role: "user", content: "pesan lain" }],
    "halo",
    "placeholder",
    () => "fallback",
    (message) => ({ ...message, streaming: false })
  );

  assert.equal(result.recovered, null);
  assert.equal(result.messages, current);
});

test("duplicate prompts recover assistant after latest persisted occurrence", () => {
  const current: RecoveryMessage[] = [
    { id: "local-user", role: "user", content: "paket bali" },
    { id: "placeholder", role: "assistant", content: "", streaming: true },
  ];
  const persisted: HistoryPayload = [
    { id: "user-1", role: "user", content: "paket bali" },
    { id: "assistant-1", role: "assistant", content: "Jawaban lama" },
    { id: "user-2", role: "user", content: "paket bali" },
    { id: "assistant-2", role: "assistant", content: "Jawaban terbaru" },
  ];

  const result = reconcileFailedTurn(
    current,
    persisted,
    "paket bali",
    "placeholder",
    () => "fallback",
    (message) => ({ ...message, streaming: false })
  );

  assert.equal(result.recovered?.id, "assistant-2");
  assert.equal(result.messages[1].id, "assistant-2");
  assert.equal(result.messages[1].content, "Jawaban terbaru");
});

test("Strict Mode remount maps one stable message id to one recommendation", () => {
  const payload = payloadWithRecommendation();
  const duplicatedPayload = [...payload, payload[1]];
  const firstMount = mapHistoryMessages(duplicatedPayload, () => "fallback-first");
  const secondMount = mapHistoryMessages(duplicatedPayload, () => "fallback-second");

  for (const mounted of [firstMount, secondMount]) {
    assert.equal(mounted.filter((message) => message.id === SERVER_MSG_ID).length, 1);
    assert.equal(mounted.filter((message) => message.showRecommendations).length, 1);
  }
  assert.deepEqual(secondMount, firstMount);
});

test("repeated reconciliation is referentially idempotent", () => {
  const current: RecoveryMessage[] = [
    { id: "local-user", role: "user", content: "cari bali" },
    { id: "placeholder", role: "assistant", content: "", streaming: true },
  ];
  const persisted: HistoryPayload = [
    { id: "server-user", role: "user", content: "cari bali" },
    {
      id: SERVER_MSG_ID,
      role: "assistant",
      content: "Paket tersimpan",
      recommendation: {
        show_recommendations: true,
        recommendation_reason: "initial",
        recommended_packages: [trip("trip-1", "Bali Adventure")],
      },
    },
  ];
  const reconcile = (messages: RecoveryMessage[]) =>
    reconcileFailedTurn(
      messages,
      persisted,
      "cari bali",
      "placeholder",
      () => {
        throw new Error("stable message_id must prevent generated recommendation id");
      },
      (message) => ({ ...message, streaming: false })
    );

  const first = reconcile(current);
  const second = reconcile(first.messages);
  assert.equal(first.messages.length, 2);
  assert.equal(second.messages, first.messages);
  assert.equal(second.messages.filter((message) => message.id === SERVER_MSG_ID).length, 1);
  assert.equal(second.messages.filter((message) => message.showRecommendations).length, 1);
});

test("late SSE completion during recovery cannot create a second assistant", () => {
  const guard = createChatTurnCompletionGuard();
  let messages: RecoveryMessage[] = [
    { id: "local-user", role: "user", content: "cari bali" },
    { id: "placeholder", role: "assistant", content: "", streaming: true },
  ];
  const persisted: HistoryPayload = [
    { id: "server-user", role: "user", content: "cari bali" },
    {
      id: SERVER_MSG_ID,
      role: "assistant",
      content: "Persisted response",
      recommendation: {
        show_recommendations: true,
        recommendation_reason: "initial",
        recommended_packages: [discountedTrip("trip-1", "Bali Adventure")],
      },
    },
  ];

  assert.equal(guard.beginRecovery(), true);
  assert.equal(guard.beginRecovery(), false);
  assert.equal(guard.completeNormally(), false);
  assert.equal(guard.completeRecovery(), true);
  messages = reconcileFailedTurn(
    messages,
    persisted,
    "cari bali",
    "placeholder",
    () => "never-used",
    (message) => ({ ...message, streaming: false })
  ).messages;
  const repeated = replaceAssistantPlaceholder(messages, "placeholder", messages[1]);

  assert.equal(repeated, messages);
  assert.equal(messages.length, 2);
  assert.equal(messages[1].id, SERVER_MSG_ID);
  assert.equal(messages.filter((message) => message.showRecommendations).length, 1);
  assert.equal(messages[1].packages?.[0].discount_price, 1_500_000);
});

test("normal done closes turn without allowing history reconciliation", () => {
  const guard = createChatTurnCompletionGuard();
  let historyRequests = 0;

  assert.equal(guard.completeNormally(), true);
  if (guard.beginRecovery()) {
    historyRequests += 1;
  }
  assert.equal(guard.completeNormally(), false);
  assert.equal(historyRequests, 0);
});

test("reconciliation failure finalizes existing placeholder once without invented data", () => {
  const current: RecoveryMessage[] = [
    { id: "placeholder", role: "assistant", content: "parsial", streaming: true },
  ];
  const failed = markAssistantStreamFailed(
    current,
    "placeholder",
    " tersisa",
    "Koneksi terputus."
  );
  const repeated = markAssistantStreamFailed(
    failed,
    "placeholder",
    " tersisa",
    "Koneksi terputus."
  );

  assert.equal(repeated, failed);
  assert.equal(failed.length, 1);
  assert.equal(failed[0].content, "parsial tersisa\n\nKoneksi terputus.");
  assert.equal(failed[0].showRecommendations, undefined);
  assert.equal(failed[0].packages, undefined);
});

test("failed persistence does not cross next user turn or invent assistant data", () => {
  const current: RecoveryMessage[] = [
    { id: "local-user", role: "user", content: "turn gagal" },
    { id: "placeholder", role: "assistant", content: "", streaming: true },
  ];
  const persisted: HistoryPayload = [
    { id: "failed-user", role: "user", content: "turn gagal" },
    { id: "next-user", role: "user", content: "turn berikut" },
    { id: "next-assistant", role: "assistant", content: "Bukan jawaban turn gagal" },
  ];
  const result = reconcileFailedTurn(
    current,
    persisted,
    "turn gagal",
    "placeholder",
    () => "never-used",
    (message) => ({ ...message, streaming: false })
  );

  assert.equal(result.recovered, null);
  assert.equal(result.messages, current);
  assert.equal(result.messages[1].showRecommendations, undefined);
  assert.equal(result.messages[1].packages, undefined);
});
