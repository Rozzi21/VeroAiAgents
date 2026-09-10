package services

import (
	"context"
	"reflect"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/ai"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/config"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/mcp"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/models"
)

func TestContextBudgetShortConversationUnchanged(t *testing.T) {
	messages := []ai.Message{
		{Role: "system", Content: "system"},
		{Role: "user", Content: "old question"},
		{Role: "assistant", Content: "old answer"},
		{Role: "user", Content: "current question"},
	}
	ctx := &chatLLMContext{messages: append([]ai.Message(nil), messages...), currentTurnStart: 3}
	got, decision := ctx.messagesForRequest(mcp.OpenAITools(), 12000)
	if decision.Removed != 0 || !reflect.DeepEqual(got, messages) {
		t.Fatalf("short context changed: decision=%+v messages=%+v", decision, got)
	}
}

func TestContextBudgetTrimsOldestCompleteTurnsAndRespectsBudget(t *testing.T) {
	oldest := strings.Repeat("riwayat paling lama ", 800)
	newer := strings.Repeat("riwayat baru ", 250)
	ctx := &chatLLMContext{
		messages: []ai.Message{
			{Role: "system", Content: "system"},
			{Role: "user", Content: "oldest " + oldest},
			{Role: "assistant", Content: "oldest answer " + oldest},
			{Role: "user", Content: "middle question"},
			{Role: "assistant", Content: "middle answer"},
			{Role: "user", Content: "newer " + newer},
			{Role: "assistant", Content: "newer answer " + newer},
			{Role: "user", Content: "current"},
		},
		currentTurnStart: 7,
	}
	got, decision := ctx.messagesForRequest(nil, 8000)
	if decision.Removed != 2 {
		t.Fatalf("removed=%d, want oldest two-message turn; decision=%+v", decision.Removed, decision)
	}
	if decision.After > decision.Limit {
		t.Fatalf("estimated context remains over budget: %+v", decision)
	}
	if got[1].Content != "middle question" || got[len(got)-1].Content != "current" {
		t.Fatal("wrong turn trimmed or current user removed")
	}
}

func TestContextBudgetProtectsSystemStateAndCurrentToolChain(t *testing.T) {
	orderState := "__order_created__:{\"booking_id\":\"stable\"}"
	toolJSON := `{"tool":"search_trips","status":"success","data":{"packages":[{"id":"trip-1","title":"Bali"}]}}`
	toolCall := ai.ToolCall{ID: "call-1", Type: "function", Function: ai.FunctionCall{Name: mcp.ToolSearchTrips, Arguments: `{"query":"Bali"}`}}
	ctx := &chatLLMContext{
		messages: []ai.Message{
			{Role: "system", Content: "system"},
			{Role: "system", Content: orderState},
			{Role: "user", Content: strings.Repeat("old ", 6000)},
			{Role: "assistant", Content: "old answer"},
			{Role: "user", Content: "middle question"},
			{Role: "assistant", Content: "middle answer"},
			{Role: "user", Content: "newer question"},
			{Role: "assistant", Content: "newer answer"},
			{Role: "user", Content: "current alternative request"},
			{Role: "assistant", ToolCalls: []ai.ToolCall{toolCall}},
			{Role: "tool", Name: mcp.ToolSearchTrips, ToolCallID: "call-1", Content: toolJSON},
		},
		currentTurnStart: 8,
	}
	protected := append([]ai.Message(nil), ctx.messages[4:]...)
	got, decision := ctx.messagesForRequest(nil, 8000)
	if decision.Removed != 2 {
		t.Fatalf("eligible old turn not removed: %+v", decision)
	}
	for _, required := range protected {
		if !containsMessage(got, required) {
			t.Fatalf("protected message missing: %+v", required)
		}
	}
	if got[len(got)-1].Content != toolJSON {
		t.Fatalf("tool result changed: %q", got[len(got)-1].Content)
	}
}

func TestContextBudgetSelectedTripProtectsHistoricalWorkflow(t *testing.T) {
	selected := uuid.New()
	repo := &mockAIRepo{
		session: models.ChatSession{SelectedTripID: &selected},
		messages: []models.ChatMessage{
			{Role: "user", Content: strings.Repeat("selection history ", 3000)},
			{Role: "assistant", Content: "selected package context"},
			{Role: "user", Content: "continue booking"},
		},
	}
	svc := &AIService{repo: repo, cfg: config.Config{AIRecentMessages: 8, AIContextMaxTokens: 8000}}
	built := svc.buildMessages(context.Background(), repo.session, "continue booking")
	before := append([]ai.Message(nil), built.messages...)
	got, decision := built.messagesForRequest(nil, 8000)
	if decision.Removed != 0 || !reflect.DeepEqual(got, before) || decision.After <= decision.Limit {
		t.Fatalf("selected workflow history must remain intact: %+v", decision)
	}
}

func TestContextBudgetProtectedContentMayExceedSoftLimit(t *testing.T) {
	ctx := &chatLLMContext{
		messages: []ai.Message{
			{Role: "system", Content: strings.Repeat("system ", 3000)},
			{Role: "user", Content: strings.Repeat("current ", 3000)},
		},
		currentTurnStart: 1,
	}
	got, decision := ctx.messagesForRequest(nil, 8000)
	if decision.Removed != 0 || decision.After <= decision.Limit || len(got) != 2 {
		t.Fatalf("protected content must fail open without truncation: %+v", decision)
	}
}

func TestContextBudgetRepeatedBuildingDeterministic(t *testing.T) {
	messages := []ai.Message{
		{Role: "system", Content: "system"},
		{Role: "user", Content: strings.Repeat("old ", 5000)},
		{Role: "assistant", Content: "answer"},
		{Role: "user", Content: "current"},
	}
	build := func() ([]ai.Message, contextBudgetDecision) {
		ctx := &chatLLMContext{messages: append([]ai.Message(nil), messages...), currentTurnStart: 3}
		return ctx.messagesForRequest(mcp.OpenAITools(), 8000)
	}
	firstMessages, firstDecision := build()
	secondMessages, secondDecision := build()
	if !reflect.DeepEqual(firstMessages, secondMessages) || firstDecision != secondDecision {
		t.Fatalf("context budgeting is not deterministic: first=%+v second=%+v", firstDecision, secondDecision)
	}
}

func TestContextBudgetIncludesToolSchemaCost(t *testing.T) {
	messages := []ai.Message{{Role: "system", Content: "system"}, {Role: "user", Content: "current"}}
	withoutTools := estimateContextTokens(messages, nil)
	withTools := estimateContextTokens(messages, mcp.OpenAITools())
	if withTools <= withoutTools {
		t.Fatalf("tool schema cost missing from estimate: without=%d with=%d", withoutTools, withTools)
	}
}

func TestBuildMessagesKeepsLatestUserAndRemovesExactMemoryOverlap(t *testing.T) {
	repo := &mockAIRepo{
		session: models.ChatSession{MemorySummary: "user: older fact\nassistant: exact duplicate"},
		messages: []models.ChatMessage{
			{Role: "assistant", Content: "exact duplicate"},
			{Role: "user", Content: "latest user"},
		},
	}
	svc := &AIService{repo: repo, cfg: config.Config{AIRecentMessages: 8, AIContextMaxTokens: 12000}}
	built := svc.buildMessages(context.Background(), repo.session, "latest user")
	if built.messages[len(built.messages)-1].Content != "latest user" || built.currentTurnStart != len(built.messages)-1 {
		t.Fatal("latest user was not protected as current turn")
	}
	for _, message := range built.messages {
		if message.Role == "system" && strings.Contains(message.Content, "exact duplicate") {
			t.Fatalf("exact recent content remained duplicated in memory: %q", message.Content)
		}
	}
}

func containsMessage(messages []ai.Message, target ai.Message) bool {
	for _, message := range messages {
		if reflect.DeepEqual(message, target) {
			return true
		}
	}
	return false
}
