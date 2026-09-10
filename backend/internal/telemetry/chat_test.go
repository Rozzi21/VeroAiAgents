package telemetry

import (
	"context"
	"testing"
	"time"
)

type collectingSink struct {
	events []Event
	panic  bool
}

func (s *collectingSink) Record(_ context.Context, event Event) {
	if s.panic {
		panic("exporter unavailable")
	}
	s.events = append(s.events, event)
}

func TestTraceRecordsRequestCorrelationAndMainStages(t *testing.T) {
	sink := &collectingSink{}
	ctx := WithRequestID(context.Background(), "req-safe-1")
	ctx, trace := NewTrace(ctx, sink)
	end := StartStage(ctx, "pre_llm_db_writes")
	end("success")
	trace.Milestone("first_delta")
	trace.Milestone("first_delta")
	trace.Milestone("done")
	trace.EndRequest()

	if len(sink.events) != 4 {
		t.Fatalf("got %d events, want 4", len(sink.events))
	}
	for _, event := range sink.events {
		if event.RequestID != "req-safe-1" {
			t.Fatalf("request id = %q", event.RequestID)
		}
	}
	if sink.events[3].Status != "success" {
		t.Fatalf("request status = %q", sink.events[3].Status)
	}
}

func TestInstrumentationFailureDoesNotChangeBehavior(t *testing.T) {
	ctx, trace := NewTrace(context.Background(), &collectingSink{panic: true})
	end := StartStage(ctx, "context_query_build")
	end("success")
	RecordTool(ctx, "search_trips", "success", time.Millisecond)
	trace.Milestone("done")
	trace.EndRequest()
}

func TestDetachDropsRequestCancellationAndPreservesCorrelation(t *testing.T) {
	requestCtx, cancel := context.WithCancel(WithRequestID(context.Background(), "req-detached"))
	requestCtx, trace := NewTrace(requestCtx, &collectingSink{})
	cancel()

	detached := Detach(requestCtx)
	if err := detached.Err(); err != nil {
		t.Fatalf("detached context inherited request cancellation: %v", err)
	}
	if RequestID(detached) != "req-detached" {
		t.Fatalf("detached request id = %q", RequestID(detached))
	}
	if FromContext(detached) != trace {
		t.Fatal("detached context must preserve telemetry trace")
	}
}

func TestStartLLMRecordsProviderTokenUsageWithoutPromptData(t *testing.T) {
	sink := &collectingSink{}
	ctx, _ := NewTrace(WithRequestID(context.Background(), "req-token-usage"), sink)
	ctx = WithLLMCall(ctx, 2, "stream")
	input, output, cached := int64(321), int64(45), int64(123)
	finish := StartLLM(ctx)
	finish("success", nil, &input, &output, &cached)

	if len(sink.events) != 1 {
		t.Fatalf("events = %d, want 1", len(sink.events))
	}
	event := sink.events[0]
	if event.Name != "llm_round" || event.Round != 2 || event.Mode != "stream" {
		t.Fatalf("unexpected event metadata: %+v", event)
	}
	if event.InputTokens == nil || *event.InputTokens != input ||
		event.OutputTokens == nil || *event.OutputTokens != output ||
		event.CachedInputTokens == nil || *event.CachedInputTokens != cached {
		t.Fatalf("provider token usage not preserved: %+v", event)
	}
	// Event has no prompt, message, tool schema, user data, token credential, or
	// other free-form payload field. Only bounded metadata and numeric usage are
	// available to telemetry sinks.
}
