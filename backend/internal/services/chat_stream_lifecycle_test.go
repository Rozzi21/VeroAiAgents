package services

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/ai"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/config"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/dto"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/events"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/models"
)

type orderedStreamRepo struct {
	*mockAIRepo
	mu    sync.Mutex
	order []string
}

func (r *orderedStreamRepo) AddChatMessage(ctx context.Context, message *models.ChatMessage) error {
	r.mu.Lock()
	r.order = append(r.order, "persist:"+message.Role)
	r.mu.Unlock()
	return r.mockAIRepo.AddChatMessage(ctx, message)
}

func TestChatStreamForwardsRealDeltasBeforeProviderCompletionAndPersistsLast(t *testing.T) {
	release := make(chan struct{})
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = w.Write([]byte("data: {\"choices\":[{\"delta\":{\"content\":\"one \"}}]}\n\n"))
		w.(http.Flusher).Flush()
		<-release
		_, _ = w.Write([]byte("data: {\"choices\":[{\"delta\":{\"content\":\"two\"},\"finish_reason\":\"stop\"}]}\n\n"))
		w.(http.Flusher).Flush()
	}))
	defer provider.Close()

	sessionID := uuid.New()
	repo := &orderedStreamRepo{mockAIRepo: &mockAIRepo{session: models.ChatSession{BaseModel: models.BaseModel{ID: sessionID}}}}
	svc := &AIService{
		repo: repo, bus: events.NewBus(),
		client: ai.NewClient("key", provider.URL, "model", 0, time.Second),
		cfg:    config.Config{GuestSessionTTL: time.Hour, AIRecentMessages: 8, AIContextMaxTokens: 12000},
	}
	first := make(chan struct{})
	done := make(chan ChatResult, 1)
	go func() {
		result, err := svc.ChatStream(context.Background(), ChatContext{SessionID: sessionID}, chatRequest("hello"), func(event ChatStreamEvent) {
			if event.Type == "delta" {
				repo.mu.Lock()
				repo.order = append(repo.order, "delta:"+event.Content)
				repo.mu.Unlock()
				if event.Content == "one " {
					close(first)
				}
			}
		})
		if err != nil {
			t.Errorf("ChatStream: %v", err)
		}
		done <- result
	}()
	select {
	case <-first:
	case <-time.After(time.Second):
		t.Fatal("first delta waited for provider completion")
	}
	select {
	case <-done:
		t.Fatal("stream completed before provider release")
	default:
	}
	close(release)
	result := <-done
	if result.Message != "one two" || result.MessageID == uuid.Nil {
		t.Fatalf("result=%+v", result)
	}
	repo.mu.Lock()
	defer repo.mu.Unlock()
	want := []string{"persist:user", "delta:one ", "delta:two", "persist:assistant"}
	if len(repo.order) != len(want) {
		t.Fatalf("order=%v", repo.order)
	}
	for index := range want {
		if repo.order[index] != want[index] {
			t.Fatalf("order=%v", repo.order)
		}
	}
}

func TestChatStreamCancellationDoesNotPersistAssistant(t *testing.T) {
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = w.Write([]byte("data: {\"choices\":[{\"delta\":{\"content\":\"partial\"}}]}\n\n"))
		w.(http.Flusher).Flush()
		<-r.Context().Done()
	}))
	defer provider.Close()
	sessionID := uuid.New()
	repo := &orderedStreamRepo{mockAIRepo: &mockAIRepo{session: models.ChatSession{BaseModel: models.BaseModel{ID: sessionID}}}}
	svc := &AIService{repo: repo, bus: events.NewBus(), client: ai.NewClient("key", provider.URL, "model", 0, time.Second), cfg: config.Config{GuestSessionTTL: time.Hour, AIRecentMessages: 8, AIContextMaxTokens: 12000}}
	ctx, cancel := context.WithCancel(context.Background())
	_, err := svc.ChatStream(ctx, ChatContext{SessionID: sessionID}, chatRequest("hello"), func(event ChatStreamEvent) {
		if event.Type == "delta" {
			cancel()
		}
	})
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("err=%v", err)
	}
	for _, message := range repo.messages {
		if message.Role == "assistant" {
			t.Fatal("cancelled partial stream persisted assistant")
		}
	}
}

func chatRequest(prompt string) dto.ChatRequest {
	return dto.ChatRequest{Prompt: prompt, Stream: true}
}
