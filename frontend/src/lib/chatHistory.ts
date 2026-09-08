import type { GuestChatHistoryResponse, TripPackage } from "./api.ts";

// History reconstruction (GenUI persistence, 6 Sep 2026).
//
// mapHistoryMessages converts the persisted chat history into the shape
// ChatInterface renders. It is a PURE function: no fetch, no LLM, no
// search_trips — a reload can never create a new recommendation, it can only
// re-attach the metadata the server already persisted on the message.
//
// Rules:
//   - The server-owned message id is used verbatim as the React key, so the
//     same logical message keeps the same id across reloads and re-renders.
//     fallbackId() (the local counter) is only used for legacy payloads that
//     predate server ids.
//   - A message WITHOUT recommendation metadata maps to plain text fields
//     only — old conversations keep rendering normally (backward compat).
//   - Recommendation metadata is attached to the SAME message object; a
//     recommendation never becomes a second independent message.

export type HistoryChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  packages?: TripPackage[];
  showRecommendations?: boolean;
  recommendationReason?: "initial" | "alternative" | "";
};

type StreamableChatMessage = HistoryChatMessage & { streaming?: boolean };

// Per-turn terminal guard. Recovery starts only after one stream failure;
// normal completion and recovery completion are mutually exclusive. Keeping
// this outside React state makes duplicate callbacks and late SSE events no-op
// without causing another render or history request.
export function createChatTurnCompletionGuard() {
  let phase: "streaming" | "recovering" | "completed" = "streaming";
  return {
    completeNormally(): boolean {
      if (phase !== "streaming") {
        return false;
      }
      phase = "completed";
      return true;
    },
    beginRecovery(): boolean {
      if (phase !== "streaming") {
        return false;
      }
      phase = "recovering";
      return true;
    },
    completeRecovery(): boolean {
      if (phase !== "recovering") {
        return false;
      }
      phase = "completed";
      return true;
    },
  };
}

// Replace one local placeholder with one server-owned logical message. If that
// stable id already exists (late done, repeated updater, Strict Mode), remove
// only the placeholder and keep the existing message. Never append.
export function replaceAssistantPlaceholder<T extends HistoryChatMessage>(
  current: T[],
  placeholderId: string,
  finalMessage: T
): T[] {
  const placeholderIndex = current.findIndex((message) => message.id === placeholderId);
  const stableIndex = current.findIndex((message) => message.id === finalMessage.id);

  if (stableIndex !== -1 && stableIndex !== placeholderIndex) {
    return placeholderIndex === -1
      ? current
      : current.filter((message) => message.id !== placeholderId);
  }
  if (placeholderIndex === -1) {
    return current;
  }

  const messages = [...current];
  messages[placeholderIndex] = finalMessage;
  return messages;
}

// Finalize the existing placeholder as an error exactly once. Missing or
// already-finalized placeholders stay untouched; no text, package, or
// recommendation is invented and no duplicate local id is appended.
export function markAssistantStreamFailed<T extends StreamableChatMessage>(
  current: T[],
  placeholderId: string,
  pending: string,
  errorMessage: string
): T[] {
  const index = current.findIndex((message) => message.id === placeholderId);
  if (index === -1 || !current[index].streaming) {
    return current;
  }

  const target = current[index];
  const partial = target.content + pending;
  const messages = [...current];
  messages[index] = {
    ...target,
    content: partial ? `${partial}\n\n${errorMessage}` : errorMessage,
    streaming: false,
  };
  return messages;
}

export function mapHistoryMessages(
  messages: GuestChatHistoryResponse["messages"],
  fallbackId: () => string
): HistoryChatMessage[] {
  const seenServerIds = new Set<string>();
  return messages.flatMap((message) => {
    // History rows have immutable DB ids. Ignore a repeated server id rather
    // than rendering a second assistant/recommendation component. Legacy rows
    // have no id and receive distinct local ids for backward compatibility.
    if (message.id) {
      if (seenServerIds.has(message.id)) {
        return [];
      }
      seenServerIds.add(message.id);
    }
    const mapped: HistoryChatMessage = {
      id: message.id ?? fallbackId(),
      role: message.role,
      content: message.content,
    };
    const rec = message.recommendation;
    if (rec && rec.show_recommendations && rec.recommended_packages?.length) {
      mapped.showRecommendations = true;
      mapped.recommendationReason = rec.recommendation_reason;
      mapped.packages = rec.recommended_packages;
    }
    return [mapped];
  });
}

// reconcileFailedTurn replaces only a failed local assistant placeholder with
// its persisted counterpart. The backend stores user then assistant messages
// before it emits SSE `done`, so matching the last equal prompt identifies the
// one turn eligible for recovery. No request, LLM, or search_trips call occurs
// here; callers supply history already fetched once after stream failure.
//
// A recovery requires a server-owned assistant id. Legacy history without ids
// cannot safely be deduplicated against live state and remains untouched.
export function reconcileFailedTurn<T extends HistoryChatMessage>(
  current: T[],
  persisted: GuestChatHistoryResponse["messages"],
  prompt: string,
  failedAssistantId: string,
  fallbackId: () => string,
  mapRecovered: (message: HistoryChatMessage) => T
): { messages: T[]; recovered: T | null } {
  let userIndex = -1;
  for (let index = persisted.length - 1; index >= 0; index -= 1) {
    const message = persisted[index];
    if (message.role === "user" && message.content === prompt) {
      userIndex = index;
      break;
    }
  }
  if (userIndex === -1) {
    return { messages: current, recovered: null };
  }

  // Only the immediately following persisted row can belong to this turn.
  // Crossing another user row could attach another tab/turn's assistant and
  // invent a completion for a prompt whose assistant was never persisted.
  const assistant = persisted[userIndex + 1];
  if (!assistant?.id) {
    return { messages: current, recovered: null };
  }
  if (assistant.role !== "assistant") {
    return { messages: current, recovered: null };
  }

  const [mapped] = mapHistoryMessages([assistant], fallbackId);
  const recovered = mapRecovered(mapped);
  const failedIndex = current.findIndex((message) => message.id === failedAssistantId);
  const duplicateIndex = current.findIndex((message) => message.id === recovered.id);
  if (duplicateIndex !== -1) {
    // Stable id proves this is the same logical assistant message. A late done
    // may already have inserted it; remove only the obsolete placeholder.
    return {
      messages: replaceAssistantPlaceholder(current, failedAssistantId, recovered),
      recovered: current[duplicateIndex],
    };
  }
  if (failedIndex === -1) {
    // Persisted recovery exists, but this state snapshot predates React adding
    // the placeholder. Caller may retry the pure merge inside functional
    // setState; never append because only the failed placeholder may change.
    return { messages: current, recovered };
  }

  return {
    messages: replaceAssistantPlaceholder(current, failedAssistantId, recovered),
    recovered,
  };
}
