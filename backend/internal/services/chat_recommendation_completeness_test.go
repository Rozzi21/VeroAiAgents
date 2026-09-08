package services

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/ai"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/events"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/mcp"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/models"
)

// B-GENUI-5: exercise the real search_trips result through ChatResult,
// persistence, JSON transport, and history. No LLM runs: finalizeChat receives
// a fixed completion and the history service has a nil client/executor.
func TestRecommendationCompletenessSurvivesSearchPersistenceAndHistory(t *testing.T) {
	trip := discountedTrip()
	mcpRepo := &mockMCPRepo{trip: trip}
	mcpService := &MCPService{repo: mcpRepo, bus: events.NewBus(), audit: nil}
	sessionID := uuid.New()

	search, err := mcpService.Execute(
		context.Background(),
		sessionID,
		nil,
		mcp.ToolSearchTrips,
		map[string]interface{}{"query": "bali"},
	)
	if err != nil || search.Status != models.ToolResultStatusSuccess {
		t.Fatalf("search_trips: result=%+v err=%v", search, err)
	}

	aiRepo := &mockAIRepo{session: models.ChatSession{}}
	aiService := newGenUIAIService(aiRepo)
	result, err := aiService.finalizeChat(
		context.Background(),
		sessionID,
		ai.CompletionResponse{Text: "Paket ditemukan."},
		[]ToolResult{search},
		nil,
	)
	if err != nil {
		t.Fatalf("finalizeChat: %v", err)
	}
	if len(result.RecommendedPackages) != 1 {
		t.Fatalf("expected one recommendation: %+v", result)
	}
	assertCompleteRecommendationTrip(t, result.RecommendedPackages[0], trip)

	if len(aiRepo.messages) != 1 || aiRepo.messages[0].Recommendation == nil {
		t.Fatalf("recommendation was not persisted: %+v", aiRepo.messages)
	}
	persisted := aiRepo.messages[0].Recommendation.RecommendedPackages[0]
	assertCompleteRecommendationTrip(t, persisted, trip)

	wire, err := json.Marshal(result)
	if err != nil {
		t.Fatalf("marshal ChatResult: %v", err)
	}
	var decoded ChatResult
	if err := json.Unmarshal(wire, &decoded); err != nil {
		t.Fatalf("unmarshal ChatResult: %v", err)
	}
	assertCompleteRecommendationTrip(t, decoded.RecommendedPackages[0], trip)

	history, _, err := aiService.GetGuestHistory(context.Background(), sessionID)
	if err != nil {
		t.Fatalf("GetGuestHistory: %v", err)
	}
	if len(history) != 1 || history[0].Recommendation == nil {
		t.Fatalf("history recommendation missing: %+v", history)
	}
	assertCompleteRecommendationTrip(t, history[0].Recommendation.RecommendedPackages[0], trip)
}

func assertCompleteRecommendationTrip(t *testing.T, got, want models.Trip) {
	t.Helper()
	if got.ID != want.ID || got.Title != want.Title || got.Destination != want.Destination ||
		got.Location != want.Location || got.Duration != want.Duration {
		t.Fatalf("package identity/details lost: got=%+v want=%+v", got, want)
	}
	if got.BasePrice != want.BasePrice || got.DiscountPrice != want.DiscountPrice ||
		got.DiscountEnabled != want.DiscountEnabled || got.ChildPrice != want.ChildPrice ||
		got.ChildDiscount != want.ChildDiscount ||
		got.ChildDiscountEnabled != want.ChildDiscountEnabled {
		t.Fatalf("package pricing lost: got=%+v want=%+v", got, want)
	}
}

func TestAlternativeRecommendationCompletenessKeepsSelection(t *testing.T) {
	selected := uuid.New()
	trip := discountedTrip()
	mcpService := &MCPService{
		repo: &mockMCPRepo{
			trip:    trip,
			session: &models.ChatSession{SelectedTripID: &selected},
		},
		bus: events.NewBus(),
	}
	search, err := mcpService.Execute(
		context.Background(),
		uuid.New(),
		nil,
		mcp.ToolSearchTrips,
		map[string]interface{}{"query": "bali", "alternative": true},
	)
	if err != nil || search.Status != models.ToolResultStatusSuccess {
		t.Fatalf("alternative search: result=%+v err=%v", search, err)
	}

	repo := &mockAIRepo{session: models.ChatSession{SelectedTripID: &selected}}
	result, err := newGenUIAIService(repo).finalizeChat(
		context.Background(),
		uuid.New(),
		ai.CompletionResponse{Text: "Alternatif ditemukan."},
		[]ToolResult{search},
		nil,
	)
	if err != nil {
		t.Fatalf("finalize alternative: %v", err)
	}
	if result.RecommendationReason != "alternative" || result.SelectedTripID == nil ||
		*result.SelectedTripID != selected {
		t.Fatalf("alternative/selection contract regressed: %+v", result)
	}
	assertCompleteRecommendationTrip(t, result.RecommendedPackages[0], trip)
}
