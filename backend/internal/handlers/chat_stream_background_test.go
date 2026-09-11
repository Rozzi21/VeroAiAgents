package handlers

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/services"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/telemetry"
)

type orderedTelemetrySink struct {
	mu     sync.Mutex
	events []telemetry.Event
}

func (s *orderedTelemetrySink) Record(_ context.Context, event telemetry.Event) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.events = append(s.events, event)
}

func (s *orderedTelemetrySink) names() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	names := make([]string, len(s.events))
	for i, event := range s.events {
		names[i] = event.Name
	}
	return names
}

func TestCompleteChatStreamSendsDoneBeforeSchedulingSummary(t *testing.T) {
	sink := &orderedTelemetrySink{}
	ctx, _ := telemetry.NewTrace(context.Background(), sink)
	messageID := uuid.New()
	sessionID := uuid.New()
	result := services.ChatResult{SessionID: sessionID, MessageID: messageID, Message: "persisted"}
	var order []string

	completeChatStream(
		ctx,
		result,
		func(event string, data interface{}) bool {
			got := data.(services.ChatResult)
			if got.MessageID != messageID {
				t.Fatal("done must carry persisted assistant message id")
			}
			order = append(order, event)
			return true
		},
		func(summaryCtx context.Context, gotSessionID uuid.UUID) bool {
			if gotSessionID != sessionID {
				t.Fatalf("summary session id = %s, want %s", gotSessionID, sessionID)
			}
			order = append(order, "summary")
			telemetry.RecordDuration(summaryCtx, "memory_summary_refresh", "failure", time.Millisecond)
			return false
		},
	)

	if len(order) != 2 || order[0] != "done" || order[1] != "summary" {
		t.Fatalf("completion order = %v, want [done summary]", order)
	}
	if names := sink.names(); len(names) != 2 || names[0] != "done" || names[1] != "memory_summary_refresh" {
		t.Fatalf("telemetry order = %v, want [done memory_summary_refresh]", names)
	}
}

func TestCompleteChatStreamSummaryFailureDoesNotChangeDone(t *testing.T) {
	doneSent := false
	completeChatStream(
		context.Background(),
		services.ChatResult{SessionID: uuid.New(), MessageID: uuid.New()},
		func(event string, _ interface{}) bool {
			doneSent = event == "done"
			return true
		},
		func(context.Context, uuid.UUID) bool { return false },
	)
	if !doneSent {
		t.Fatal("summary scheduling failure must not fail successful done")
	}
}

func TestProviderDeltaTelemetryUsesRealProviderFlagAndRequestCorrelation(t *testing.T) {
	sink := &orderedTelemetrySink{}
	ctx := telemetry.WithRequestID(context.Background(), "req-stream-1")
	ctx, _ = telemetry.NewTrace(ctx, sink)
	write := func(event services.ChatStreamEvent) {
		if event.Type == "delta" && event.ProviderGenerated {
			telemetry.Milestone(ctx, "first_delta")
		}
	}
	write(services.ChatStreamEvent{Type: "delta", Content: "local fallback"})
	write(services.ChatStreamEvent{Type: "delta", Content: "real", ProviderGenerated: true})
	write(services.ChatStreamEvent{Type: "delta", Content: "later", ProviderGenerated: true})
	if names := sink.names(); len(names) != 1 || names[0] != "first_delta" {
		t.Fatalf("milestones = %v, want one real first_delta", names)
	}
	sink.mu.Lock()
	defer sink.mu.Unlock()
	if sink.events[0].RequestID != "req-stream-1" {
		t.Fatalf("request id = %q", sink.events[0].RequestID)
	}
}
