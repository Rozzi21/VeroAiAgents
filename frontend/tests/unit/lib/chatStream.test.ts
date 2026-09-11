// streamChat is the only path the chat UI gets order state from, so the
// structured gate must survive the SSE hop intact and the Bearer token must be
// attached on the way out (the proxy then forwards it — see chatProxy.test.ts).
// Run: npm test
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";

import { futureToken, makeMemoryStorage } from "../../helpers/auth.ts";
import { setCustomerAccessToken, streamChat } from "../../../src/lib/api.ts";
import type { ChatResponse } from "../../../src/lib/api.ts";

// sseResponse builds a streaming response body the way the backend writes it:
// one `event:`/`data:` pair per block, blocks separated by a blank line.
function sseResponse(blocks: Array<{ event: string; data: unknown }>): Response {
  const body = blocks
    .map((b) => `event: ${b.event}\ndata: ${JSON.stringify(b.data)}\n\n`)
    .join("");
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

function chunkedSseResponse(chunks: Uint8Array[]): Response {
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  }), { status: 200, headers: { "content-type": "text/event-stream" } });
}

type Collected = { deltas: string[]; done: ChatResponse[]; errors: string[] };

async function run(): Promise<Collected> {
  const collected: Collected = { deltas: [], done: [], errors: [] };
  await streamChat("/api/v1/chat", { prompt: "buat pesanan", stream: true }, {
    onDelta: (text) => collected.deltas.push(text),
    onDone: (result) => collected.done.push(result),
    onError: (message) => collected.errors.push(message),
  });
  return collected;
}

let lastInit: RequestInit | null = null;

beforeEach(() => {
  (globalThis as { window?: unknown }).window = { localStorage: makeMemoryStorage() };
  lastInit = null;
});

function stubFetch(response: Response) {
  (globalThis as { fetch?: unknown }).fetch = (_url: string, init: RequestInit = {}) => {
    lastInit = init;
    return Promise.resolve(response);
  };
}

test("guest limit reaches the UI as a structured gate, not as text", async () => {
  stubFetch(
    sseResponse([
      { event: "delta", data: { content: "Pesanan guest Anda sudah terpakai." } },
      {
        event: "done",
        data: {
          message: "Pesanan guest Anda sudah terpakai.",
          show_recommendations: false,
          recommendation_reason: "",
          order_gate: { code: "GUEST_ORDER_LIMIT_REACHED", auth_required: true },
        },
      },
    ])
  );

  const { done, errors } = await run();
  assert.equal(errors.length, 0);
  assert.equal(done.length, 1);
  assert.equal(done[0].order_gate?.code, "GUEST_ORDER_LIMIT_REACHED");
  assert.equal(done[0].order_gate?.auth_required, true);
  assert.equal(done[0].order_gate?.order_id, undefined);
});

test("a created order arrives with its id so tracking survives the sign-in prompt", async () => {
  stubFetch(
    sseResponse([
      {
        event: "done",
        data: {
          message: "Pesanan Anda sudah dibuat.",
          show_recommendations: false,
          recommendation_reason: "",
          order_gate: {
            code: "ORDER_CREATED",
            auth_required: false,
            order_id: "33333333-3333-3333-3333-333333333333",
          },
        },
      },
    ])
  );

  const { done } = await run();
  assert.equal(done[0].order_gate?.order_id, "33333333-3333-3333-3333-333333333333");
});

test("a turn without an ordering step carries no gate", async () => {
  stubFetch(
    sseResponse([
      {
        event: "done",
        data: { message: "Ini rekomendasinya.", show_recommendations: true, recommendation_reason: "initial" },
      },
    ])
  );

  const { done } = await run();
  assert.equal(done[0].order_gate, undefined);
});

test("the stable server-owned message_id survives the SSE done event", async () => {
  // GenUI persistence (6 Sep 2026): the done payload carries the persisted
  // ChatMessage.ID so the assistant message AND its recommendation cards share
  // one stable id that survives reload.
  stubFetch(
    sseResponse([
      { event: "delta", data: { content: "Ini " } },
      {
        event: "done",
        data: {
          message: "Ini rekomendasinya.",
          message_id: "11111111-1111-1111-1111-111111111111",
          show_recommendations: true,
          recommendation_reason: "initial",
        },
      },
    ])
  );

  const { deltas, done } = await run();
  assert.deepEqual(deltas, ["Ini "]);
  assert.equal(done[0].message_id, "11111111-1111-1111-1111-111111111111");
});

test("recommendation pricing survives the SSE done event", async () => {
  stubFetch(
    sseResponse([
      {
        event: "done",
        data: {
          message: "Paket ditemukan.",
          message_id: "22222222-2222-2222-2222-222222222222",
          show_recommendations: true,
          recommendation_reason: "initial",
          recommended_packages: [
            {
              id: "trip-1",
              title: "Bali Adventure",
              destination: "Bali",
              duration: "3D2N",
              base_price: 2000000,
              discount_enabled: true,
              discount_price: 1500000,
              child_price: 1000000,
              child_discount_enabled: true,
              child_discount_price: 750000,
            },
          ],
        },
      },
    ])
  );

  const { done, errors } = await run();
  assert.equal(errors.length, 0);
  const trip = done[0].recommended_packages?.[0];
  assert.equal(trip?.base_price, 2000000);
  assert.equal(trip?.discount_price, 1500000);
  assert.equal(trip?.child_discount_price, 750000);
  assert.equal(trip?.destination, "Bali");
  assert.equal(trip?.duration, "3D2N");
});

test("clean EOF without done reports one stream error for history recovery", async () => {
  stubFetch(sseResponse([{ event: "delta", data: { content: "Respons tersimpan." } }]));

  const { deltas, done, errors } = await run();
  assert.deepEqual(deltas, ["Respons tersimpan."]);
  assert.equal(done.length, 0);
  assert.equal(errors.length, 1);
  assert.equal(errors[0], "Koneksi terputus saat memuat respons. Coba lagi.");
});

test("normal done does not report an EOF error", async () => {
  stubFetch(
    sseResponse([
      { event: "done", data: { message: "Selesai.", show_recommendations: false, recommendation_reason: "" } },
    ])
  );

  const { done, errors } = await run();
  assert.equal(done.length, 1);
  assert.equal(errors.length, 0);
});

test("SSE error event is not reported again when stream reaches EOF", async () => {
  stubFetch(sseResponse([{ event: "error", data: { message: "Backend gagal." } }]));

  const { done, errors } = await run();
  assert.equal(done.length, 0);
  assert.deepEqual(errors, ["Backend gagal."]);
});

test("the access token is attached so the backend sees an account, not a guest", async () => {
  const token = futureToken();
  setCustomerAccessToken(token, 900);
  stubFetch(
    sseResponse([
      { event: "done", data: { message: "ok", show_recommendations: false, recommendation_reason: "" } },
    ])
  );

  await run();
  const headers = new Headers(lastInit?.headers);
  assert.equal(headers.get("Authorization"), `Bearer ${token}`);
});

test("telemetry callbacks receive request lifecycle and correlation id", async () => {
  const marks: string[] = [];
  stubFetch(new Response(
    `event: done\ndata: ${JSON.stringify({ message: "ok", show_recommendations: false, recommendation_reason: "" })}\n\n`,
    { status: 200, headers: { "content-type": "text/event-stream", "x-request-id": "req-chat-1" } }
  ));
  await streamChat("/api/v1/chat", { prompt: "x", stream: true }, {
    requestID: "req-chat-1",
    onRequestStart: () => marks.push("request-start"),
    onResponseHeaders: (id) => marks.push(`headers:${id}`),
    onFirstEvent: () => marks.push("first-event"),
    onDelta: () => {},
    onDone: () => marks.push("done"),
    onError: (error) => assert.fail(error),
  });
  assert.deepEqual(marks, ["request-start", "headers:req-chat-1", "first-event", "done"]);
  assert.equal(new Headers(lastInit?.headers).get("X-Request-ID"), "req-chat-1");
});

test("multiple events per chunk and one split event preserve delta order", async () => {
  const encoder = new TextEncoder();
  stubFetch(chunkedSseResponse([
    encoder.encode('event: delta\ndata: {"content":"A"}\n\nevent: del'),
    encoder.encode('ta\ndata: {"content":"B"}\n\nevent: done\ndata: {"message":"AB","show_recommendations":false,"recommendation_reason":""}\n\n'),
  ]));
  const result = await run();
  assert.deepEqual(result.deltas, ["A", "B"]);
  assert.equal(result.done[0].message, "AB");
  assert.deepEqual(result.errors, []);
});

test("streaming TextDecoder preserves multibyte UTF-8 split across chunks", async () => {
  const bytes = new TextEncoder().encode('event: delta\ndata: {"content":"Bali 🌴"}\n\nevent: done\ndata: {"message":"Bali 🌴","show_recommendations":false,"recommendation_reason":""}\n\n');
  const emojiStart = bytes.findIndex((value) => value === 0xf0);
  stubFetch(chunkedSseResponse([bytes.slice(0, emojiStart + 2), bytes.slice(emojiStart + 2)]));
  const result = await run();
  assert.deepEqual(result.deltas, ["Bali 🌴"]);
  assert.equal(result.done[0].message, "Bali 🌴");
});

test("final done without trailing blank line is processed at EOF", async () => {
  stubFetch(chunkedSseResponse([new TextEncoder().encode(
    'event: delta\ndata: {"content":"tail"}\n\nevent: done\ndata: {"message":"tail","show_recommendations":false,"recommendation_reason":""}'
  )]));
  const result = await run();
  assert.deepEqual(result.deltas, ["tail"]);
  assert.equal(result.done.length, 1);
  assert.deepEqual(result.errors, []);
});

test("recommendation event arrives before remaining text and done", async () => {
  const order: string[] = [];
  stubFetch(sseResponse([
    { event: "delta", data: { content: "Pilihan: " } },
    { event: "recommendation", data: { show_recommendations: true, recommendation_reason: "initial", recommended_packages: [{ id: "trip-1", title: "Bali" }] } },
    { event: "delta", data: { content: "silakan pilih." } },
    { event: "done", data: { message: "Pilihan: silakan pilih.", show_recommendations: true, recommendation_reason: "initial", recommended_packages: [] } },
  ]));
  await streamChat("/api/v1/chat", { prompt: "x", stream: true }, {
    onDelta: (text) => order.push(`delta:${text}`),
    onRecommendation: () => order.push("recommendation"),
    onDone: () => order.push("done"),
    onError: (error) => assert.fail(error),
  });
  assert.deepEqual(order, ["delta:Pilihan: ", "recommendation", "delta:silakan pilih.", "done"]);
});
