// streamChat is the only path the chat UI gets order state from, so the
// structured gate must survive the SSE hop intact and the Bearer token must be
// attached on the way out (the proxy then forwards it — see chatProxy.test.ts).
// Run: npm test
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";

import { setCustomerAccessToken, streamChat } from "./api.ts";
import type { ChatResponse } from "./api.ts";

function b64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function futureToken(): string {
  const payload = { sub: "user-1", aud: "access", exp: Math.floor(Date.now() / 1000) + 900 };
  return `${b64url({ alg: "RS256", typ: "JWT" })}.${b64url(payload)}.c2ln`;
}

function makeMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

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
