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
