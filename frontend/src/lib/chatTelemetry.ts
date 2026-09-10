export type ChatTelemetryEvent = {
  event: string;
  request_id: string;
  since_submit_ms: number;
  status?: "success" | "failure";
};

export type ChatTelemetrySink = (event: ChatTelemetryEvent) => void;

const defaultSink: ChatTelemetrySink = (event) => {
  // Operational metadata only. No prompt, identity, auth, session, or payload.
  console.info("chat_telemetry", event);
};

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export function createRequestID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `chat-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createChatTelemetry(
  requestID = createRequestID(),
  sink: ChatTelemetrySink = defaultSink
) {
  const started = now();
  const emitted = new Set<string>();
  const mark = (event: string, status?: "success" | "failure") => {
    if (emitted.has(event)) return;
    emitted.add(event);
    try {
      sink({ event, request_id: requestID, since_submit_ms: now() - started, status });
    } catch {
      // Instrumentation cannot affect chat behavior.
    }
  };
  return { requestID, mark };
}