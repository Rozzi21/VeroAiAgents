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

export function mapHistoryMessages(
  messages: GuestChatHistoryResponse["messages"],
  fallbackId: () => string
): HistoryChatMessage[] {
  return messages.map((message) => {
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
    return mapped;
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

  const assistant = persisted.slice(userIndex + 1).find((message) => message.role === "assistant");
  if (!assistant?.id) {
    return { messages: current, recovered: null };
  }

  const [mapped] = mapHistoryMessages([assistant], fallbackId);
  const recovered = mapRecovered(mapped);
  const failedIndex = current.findIndex((message) => message.id === failedAssistantId);
  const duplicateIndex = current.findIndex((message) => message.id === recovered.id);
  if (duplicateIndex !== -1) {
    // This server message already belongs to rendered history. It may be an
    // older answer to an identical prompt, so never use it to finalize the
    // current failed turn.
    return { messages: current, recovered: null };
  }
  if (failedIndex === -1) {
    // Persisted recovery exists, but this state snapshot predates React adding
    // the placeholder. Caller may retry the pure merge inside functional
    // setState; never append because only the failed placeholder may change.
    return { messages: current, recovered };
  }

  const messages = [...current];
  messages[failedIndex] = recovered;
  return { messages, recovered };
}
