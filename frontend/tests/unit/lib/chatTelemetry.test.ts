import { test } from "node:test";
import assert from "node:assert/strict";
import { createChatTelemetry } from "../../../src/lib/chatTelemetry.ts";

test("chat telemetry correlates events and deduplicates first milestones", () => {
  const events: Array<{ event: string; request_id: string }> = [];
  const telemetry = createChatTelemetry("req-telemetry-1", (event) => events.push(event));
  telemetry.mark("submit");
  telemetry.mark("first-delta");
  telemetry.mark("first-delta");
  telemetry.mark("done", "success");
  assert.deepEqual(events.map((event) => event.event), ["submit", "first-delta", "done"]);
  assert.ok(events.every((event) => event.request_id === "req-telemetry-1"));
});

test("telemetry sink failure does not escape into chat flow", () => {
  const telemetry = createChatTelemetry("req-telemetry-2", () => { throw new Error("collector down"); });
  assert.doesNotThrow(() => telemetry.mark("submit"));
  assert.doesNotThrow(() => telemetry.mark("done", "success"));
});