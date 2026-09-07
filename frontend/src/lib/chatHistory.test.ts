// mapHistoryMessages reconstructs Travel Package cards from the persisted
// history payload alone (GenUI persistence, 6 Sep 2026). The mapper is pure —
// no fetch, no search_trips, no LLM — so these tests need no stubs at all:
// a reload can never CREATE a recommendation, it can only re-attach the one
// the server already persisted on the message.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { mapHistoryMessages } from "./chatHistory.ts";
import type { GuestChatHistoryResponse, TripPackage } from "./api.ts";

type HistoryPayload = GuestChatHistoryResponse["messages"];

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
