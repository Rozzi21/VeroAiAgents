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
