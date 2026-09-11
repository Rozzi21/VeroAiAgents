package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/dto"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/services"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/telemetry"
)

const chatStreamWriteDeadline = 10 * time.Second

// PERF-1 (3 Agu 2026): streaming chat over Server-Sent Events.
// Each `delta` carries a text fragment and terminal `done` carries full
// ChatResult. Response remains SSE rather than standard JSON envelope.

func (h *Handler) streamChat(c *gin.Context, chatCtx services.ChatContext, req dto.ChatRequest, setCookie func()) {
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	// Hint reverse proxies not to buffer the stream (common for Nginx/Caddy).
	c.Header("X-Accel-Buffering", "no")

	if setCookie != nil {
		setCookie()
	}

	rc := http.NewResponseController(c.Writer)
	// Disable global WriteTimeout; each SSE write has its own deadline.
	_ = rc.SetWriteDeadline(time.Time{})

	// Request context cancels provider work and writes after disconnect.
	ctx, cancel := context.WithCancel(c.Request.Context())
	defer cancel()

	// send writes and flushes one event, returning false for dead connections.
	send := func(eventType string, data interface{}) bool {
		if ctx.Err() != nil {
			return false
		}
		payload, err := json.Marshal(data)
		if err != nil {
			return false
		}
		_ = rc.SetWriteDeadline(time.Now().Add(chatStreamWriteDeadline))
		_, _ = c.Writer.WriteString("event: " + eventType + "\n")
		_, _ = c.Writer.WriteString("data: " + string(payload) + "\n\n")
		if err := rc.Flush(); err != nil {
			cancel()
			return false
		}
		telemetry.Milestone(ctx, "first_sse_write")
		return true
	}

	onEvent := func(event services.ChatStreamEvent) {
		switch event.Type {
		case "delta":
			if send("delta", map[string]string{"content": event.Content}) && event.ProviderGenerated {
				telemetry.Milestone(ctx, "first_delta")
			}
		case "recommendation":
			if !send("recommendation", map[string]interface{}{
				"show_recommendations":  event.ShowRecommendations,
				"recommendation_reason": event.RecommendationReason,
				"recommended_packages":  event.RecommendedPackages,
			}) {
				return
			}
		}
	}

	result, err := h.Services.AI.ChatStream(ctx, chatCtx, req, onEvent)
	if err != nil {
		// Try to surface the error to the client; if the connection is already
		// dead the send is a no-op and we just return.
		_ = send("error", map[string]string{"message": "Maaf, Vero belum bisa memproses permintaan ini."})
		return
	}

	// Terminal event carries full result; SessionID remains excluded by JSON tag.
	completeChatStream(ctx, result, send, h.Services.AI.ScheduleMemorySummary)
}

func completeChatStream(
	ctx context.Context,
	result services.ChatResult,
	send func(string, interface{}) bool,
	scheduleSummary func(context.Context, uuid.UUID) bool,
) {
	if send("done", result) {
		telemetry.Milestone(ctx, "done")
		if trace := telemetry.FromContext(ctx); trace != nil {
			trace.Complete(true)
		}
	}
	// Enqueue only after the terminal write attempt. On successful streams,
	// telemetry's done milestone is therefore always earlier than summary work.
	scheduleSummary(ctx, result.SessionID)
}
