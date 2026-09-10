package services

import (
	"context"
	"errors"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/ai"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/config"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/models"
)

type memorySummaryRepo struct {
	*mockAIRepo
	count func(context.Context) (int64, error)
}

func (r *memorySummaryRepo) CountChatMessages(ctx context.Context, _ uuid.UUID) (int64, error) {
	return r.count(ctx)
}

func TestScheduleMemorySummaryTimeoutDoesNotBlockCaller(t *testing.T) {
	finished := make(chan error, 1)
	repo := &memorySummaryRepo{
		mockAIRepo: &mockAIRepo{},
		count: func(ctx context.Context) (int64, error) {
			<-ctx.Done()
			finished <- ctx.Err()
			return 0, ctx.Err()
		},
	}
	pool := NewAuditPool(&mockAuditWriter{})
	pool.jobTimeout = 25 * time.Millisecond
	pool.Start()
	defer pool.Stop()
	svc := &AIService{
		repo:       repo,
		cfg:        config.Config{AIMemorySummaryAfter: 1},
		background: pool,
	}

	started := time.Now()
	if !svc.ScheduleMemorySummary(context.Background(), uuid.New()) {
		t.Fatal("summary job should be accepted")
	}
	if elapsed := time.Since(started); elapsed > 20*time.Millisecond {
		t.Fatalf("summary submission blocked caller for %s", elapsed)
	}

	select {
	case err := <-finished:
		if !errors.Is(err, context.DeadlineExceeded) {
			t.Fatalf("summary context error = %v, want deadline exceeded", err)
		}
	case <-time.After(time.Second):
		t.Fatal("timed-out summary worker did not finish")
	}
}

func TestMemorySummaryRefreshesForSessionNeverOverlap(t *testing.T) {
	pool := NewAuditPool(&mockAuditWriter{})
	pool.jobTimeout = time.Second
	pool.Start()
	defer pool.Stop()

	sessionID := uuid.New()
	entered := make(chan struct{}, 2)
	var active atomic.Int32
	var maximum atomic.Int32
	var calls atomic.Int32
	refresh := func(ctx context.Context) {
		current := active.Add(1)
		for {
			old := maximum.Load()
			if current <= old || maximum.CompareAndSwap(old, current) {
				break
			}
		}
		calls.Add(1)
		entered <- struct{}{}
		<-ctx.Done()
		active.Add(-1)
	}

	if !pool.SubmitMemorySummary(context.Background(), sessionID, refresh) {
		t.Fatal("first summary should be accepted")
	}
	select {
	case <-entered:
	case <-time.After(time.Second):
		t.Fatal("first summary did not start")
	}
	if !pool.SubmitMemorySummary(context.Background(), sessionID, refresh) {
		t.Fatal("second summary should be coalesced")
	}
	select {
	case <-entered:
	case <-time.After(time.Second):
		t.Fatal("dirty session did not receive follow-up refresh")
	}
	pool.Stop()

	if got := maximum.Load(); got != 1 {
		t.Fatalf("maximum concurrent refreshes for one session = %d, want 1", got)
	}
	if got := calls.Load(); got != 2 {
		t.Fatalf("refresh calls = %d, want 2 coalesced runs", got)
	}
	select {
	case <-pool.done:
		// All fixed workers exited; no waiter goroutine or job remains.
	default:
		t.Fatal("background workers must exit after Stop")
	}
}

func TestFinalizeChatPersistsBeforeBackgroundSummary(t *testing.T) {
	countCalled := make(chan struct{}, 1)
	repo := &memorySummaryRepo{
		mockAIRepo: &mockAIRepo{session: models.ChatSession{}},
		count: func(context.Context) (int64, error) {
			countCalled <- struct{}{}
			return 0, errors.New("summary failed")
		},
	}
	svc := &AIService{
		repo: repo,
		bus:  nil,
		cfg:  config.Config{AIMemorySummaryAfter: 1},
	}
	// finalizeChat publishes through the event bus, so retain production shape.
	svc.bus = newGenUIAIService(&mockAIRepo{}).bus

	result, err := svc.finalizeChat(context.Background(), uuid.New(), completion("persisted"), nil, nil)
	if err != nil {
		t.Fatalf("finalizeChat: %v", err)
	}
	if result.MessageID == uuid.Nil || len(repo.messages) != 1 {
		t.Fatal("assistant message must be persisted before finalization returns")
	}
	select {
	case <-countCalled:
		t.Fatal("finalization must not run memory summary on critical path")
	default:
	}
}

func completion(text string) ai.CompletionResponse {
	return ai.CompletionResponse{Text: text}
}
