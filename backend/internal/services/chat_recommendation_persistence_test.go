package services

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/ai"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/config"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/events"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/mcp"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/models"
)

type mockAIRepo struct {
	session  models.ChatSession
	messages []models.ChatMessage
}

func (m *mockAIRepo) FindChatSession(_ context.Context, id uuid.UUID) (models.ChatSession, error) {
	m.session.ID = id
	return m.session, nil
}
func (m *mockAIRepo) AddChatMessage(_ context.Context, msg *models.ChatMessage) error {
	if msg.ID == uuid.Nil {
		msg.ID = uuid.New()
	}
	m.messages = append(m.messages, *msg)
	return nil
}
func (m *mockAIRepo) ListChatMessages(_ context.Context, _ uuid.UUID) ([]models.ChatMessage, error) {
	return m.messages, nil
}
func (m *mockAIRepo) ListRecentChatMessages(_ context.Context, _ uuid.UUID, _ int) ([]models.ChatMessage, error) {
	return m.messages, nil
}
func (m *mockAIRepo) TailChatMessages(_ context.Context, _ uuid.UUID, _ int) ([]models.ChatMessage, error) {
	return nil, nil
}
func (m *mockAIRepo) CountChatMessages(_ context.Context, _ uuid.UUID) (int64, error) {
	return int64(len(m.messages)), nil
}
func (m *mockAIRepo) CreateChatSession(_ context.Context, _ *models.ChatSession) error { return nil }
func (m *mockAIRepo) UpdateChatSession(_ context.Context, _ *models.ChatSession) error { return nil }
func (m *mockAIRepo) UpdateChatSessionMemorySummary(_ context.Context, _ uuid.UUID, _ string) error {
	return nil
}
func (m *mockAIRepo) UpdateChatSessionSelectedTrip(_ context.Context, _ uuid.UUID, _ *uuid.UUID) error {
	return nil
}
func (m *mockAIRepo) UpdateChatSessionActivity(_ context.Context, _ uuid.UUID, _, _ time.Time) error {
	return nil
}
func (m *mockAIRepo) ListChatSessions(_ context.Context, _ uuid.UUID) ([]models.ChatSession, error) {
	return nil, nil
}
func (m *mockAIRepo) DeleteExpiredChatSessions(_ context.Context, _ time.Time) (int64, error) {
	return 0, nil
}
func (m *mockAIRepo) CountExpiredChatSessions(_ context.Context, _ time.Time) (int64, error) {
	return 0, nil
}
func (m *mockAIRepo) CreateAILog(_ context.Context, _ *models.AILog) error { return nil }

func searchTripsResult(packages ...map[string]interface{}) ToolResult {
	return ToolResult{Tool: mcp.ToolSearchTrips, Status: models.ToolResultStatusSuccess, Data: map[string]interface{}{
		"packages": packages,
		"reason":   "initial",
	}}
}

func newGenUIAIService(repo *mockAIRepo) *AIService {
	return &AIService{
		repo: repo,
		bus:  events.NewBus(),
		cfg:  config.Config{AIMemorySummaryAfter: 1000},
	}
}

func TestFinalizeChatPersistsRecommendation(t *testing.T) {
	repo := &mockAIRepo{session: models.ChatSession{}}
	svc := newGenUIAIService(repo)
	sessionID := uuid.New()
	tripID := uuid.New()

	result, err := svc.finalizeChat(context.Background(), sessionID,
		ai.CompletionResponse{Text: "Ini rekomendasi paket untuk Anda."},
		[]ToolResult{searchTripsResult(map[string]interface{}{
			"id":       tripID.String(),
			"title":    "Bali Adventure 3D2N",
			"category": "domestic",
			"price":    1500000.0,
		})},
		nil,
	)
	if err != nil {
		t.Fatalf("finalizeChat: %v", err)
	}
	if !result.ShowRecommendations || len(result.RecommendedPackages) != 1 {
		t.Fatalf("expected 1 recommended package, got %+v", result)
	}
	if result.MessageID == uuid.Nil {
		t.Fatal("MessageID must be the stable id of the persisted assistant message")
	}

	if len(repo.messages) != 1 {
		t.Fatalf("expected exactly 1 persisted message, got %d", len(repo.messages))
	}
	persisted := repo.messages[0]
	if persisted.ID != result.MessageID {
		t.Fatalf("persisted message id %s != ChatResult.MessageID %s", persisted.ID, result.MessageID)
	}
	if persisted.Recommendation == nil {
		t.Fatal("recommendation metadata must be persisted with the message")
	}
	rec := persisted.Recommendation
	if !rec.ShowRecommendations || rec.RecommendationReason != "initial" {
		t.Fatalf("unexpected recommendation flags: %+v", rec)
	}
	if len(rec.RecommendedPackages) != 1 ||
		rec.RecommendedPackages[0].ID != tripID ||
		rec.RecommendedPackages[0].Title != "Bali Adventure 3D2N" {
		t.Fatalf("persisted packages mismatch: %+v", rec.RecommendedPackages)
	}
}

func TestFinalizeChatNoRecommendationWhenSelected(t *testing.T) {
	selected := uuid.New()
	repo := &mockAIRepo{session: models.ChatSession{SelectedTripID: &selected}}
	svc := newGenUIAIService(repo)

	result, err := svc.finalizeChat(context.Background(), uuid.New(),
		ai.CompletionResponse{Text: "Paket Anda sudah dipilih."},
		[]ToolResult{searchTripsResult(map[string]interface{}{
			"id":    uuid.New().String(),
			"title": "Unrelated Package",
		})},
		nil,
	)
	if err != nil {
		t.Fatalf("finalizeChat: %v", err)
	}
	if result.ShowRecommendations || len(result.RecommendedPackages) != 0 {
		t.Fatalf("recommendations must stay suppressed after selection: %+v", result)
	}
	if result.MessageID == uuid.Nil {
		t.Fatal("plain assistant message must still get a stable MessageID")
	}
	if len(repo.messages) != 1 || repo.messages[0].Recommendation != nil {
		t.Fatal("plain assistant message must persist WITHOUT recommendation metadata")
	}
}

func TestGetGuestHistoryReconstructsWithoutLLM(t *testing.T) {
	sessionID := uuid.New()
	tripID := uuid.New()
	repo := &mockAIRepo{
		session: models.ChatSession{},
		messages: []models.ChatMessage{
			{BaseModel: models.BaseModel{ID: uuid.New()}, SessionID: sessionID, Role: "user", Content: "cari paket bali"},
			{
				BaseModel: models.BaseModel{ID: uuid.New()}, SessionID: sessionID, Role: "assistant",
				Content: "Ini rekomendasi paket untuk Anda.",
				Recommendation: &models.ChatRecommendation{
					ShowRecommendations:  true,
					RecommendationReason: "initial",
					RecommendedPackages:  []models.Trip{{BaseModel: models.BaseModel{ID: tripID}, Title: "Bali Adventure 3D2N"}},
				},
			},
			{BaseModel: models.BaseModel{ID: uuid.New()}, SessionID: sessionID, Role: "assistant", Content: "Ada lagi yang bisa dibantu?"},
		},
	}
	svc := newGenUIAIService(repo)

	messages, selectedTripID, err := svc.GetGuestHistory(context.Background(), sessionID)
	if err != nil {
		t.Fatalf("GetGuestHistory: %v", err)
	}
	if selectedTripID != nil {
		t.Fatalf("no package was selected in this fixture; got %s", *selectedTripID)
	}
	if len(messages) != 3 {
		t.Fatalf("expected 3 messages, got %d", len(messages))
	}
	rec := messages[1].Recommendation
	if rec == nil || !rec.ShowRecommendations || len(rec.RecommendedPackages) != 1 {
		t.Fatalf("recommendation metadata must survive history reload: %+v", messages[1])
	}
	if rec.RecommendedPackages[0].ID != tripID {
		t.Fatalf("reloaded package id mismatch: %s", rec.RecommendedPackages[0].ID)
	}
	if messages[2].Recommendation != nil {
		t.Fatal("old message without metadata must stay metadata-free (no invented data)")
	}
	if messages[1].ID != repo.messages[1].ID {
		t.Fatal("history must return the stable server-owned message id")
	}
}

func TestChatRecommendationJSONShape(t *testing.T) {
	rec := models.ChatRecommendation{
		ShowRecommendations:  true,
		RecommendationReason: "alternative",
		RecommendedPackages:  []models.Trip{{BaseModel: models.BaseModel{ID: uuid.New()}, Title: "Bali"}},
	}
	raw, err := json.Marshal(rec)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	for _, key := range []string{"show_recommendations", "recommendation_reason", "recommended_packages"} {
		if !strings.Contains(string(raw), `"`+key+`"`) {
			t.Fatalf("missing key %q in %s", key, raw)
		}
	}
}
