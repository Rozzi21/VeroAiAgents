// mapHistoryMessages reconstructs Travel Package cards from the persisted
// history payload alone (GenUI persistence, 6 Sep 2026). The mapper is pure —
// no fetch, no search_trips, no LLM — so these tests need no stubs at all:
// a reload can never CREATE a recommendation, it can only re-attach the one
// the server already persisted on the message.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  mapHistoryMessages,
  reconcileFailedTurn,
  type HistoryChatMessage,
} from "./chatHistory.ts";
import type { GuestChatHistoryResponse, TripPackage } from "./api.ts";

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

test("reconciliation rejects an existing server id instead of reusing an older answer", () => {
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

  assert.equal(result.recovered, null);
  assert.equal(result.messages, current);
  assert.deepEqual(result.messages.map((message) => message.id), [
    "user-local",
    "server-assistant",
    "placeholder",
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
