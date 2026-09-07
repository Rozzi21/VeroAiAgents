-- GenUI Travel Package persistence (6 Sep 2026).
--
-- chat_messages.recommendation stores the structured recommendation metadata
-- of ONE assistant message ({show_recommendations, recommendation_reason,
-- recommended_packages}) so a page reload reconstructs the Travel Package
-- cards from the DB alone — without re-running search_trips or the LLM.
-- Packages reuse the existing trips row shape (JSON), never rendered UI.
--
-- NULL for user messages, old messages (backward compatibility — no backfill,
-- no invented data), and assistant turns without recommendations.
--
-- Additive + idempotent; touches no existing row. Equivalent to the
-- ChatMessage.Recommendation field registered in Database.AutoMigrate().
BEGIN;
ALTER TABLE chat_messages
    ADD COLUMN IF NOT EXISTS recommendation jsonb;
COMMIT;
