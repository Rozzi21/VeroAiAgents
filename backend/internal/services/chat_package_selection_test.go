package services

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/ai"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/events"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/mcp"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/models"
)

// B-GENUI-3 / B-GENUI-4 (9 Sep 2026): package selection from a Travel Package
// card is backend-authoritative (select_package persists selected_trip_id), a
// selection suppresses NORMAL recommendations (BUG-13), and an EXPLICIT
// alternative request (search_trips alternative=true) still produces a new
// recommendation set while the selection stays intact.
//
// Tool-level tests use mockMCPRepo (mcp_pricing_tools_test.go); finalization
// tests reuse mockAIRepo/newGenUIAIService (chat_recommendation_persistence_test.go).

func newSelectionMCPService(repo *mockMCPRepo) *MCPService {
	// audit nil -> synchronous audit fallback; bookings/auth unused by
	// search_trips/select_package.
	return &MCPService{repo: repo, bus: events.NewBus(), audit: nil}
}

func alternativeSearchTripsResult(packages ...map[string]interface{}) ToolResult {
	return ToolResult{Tool: mcp.ToolSearchTrips, Status: models.ToolResultStatusSuccess, Data: map[string]interface{}{
		"packages": packages,
		"reason":   "alternative",
	}}
}

// (1) select_package successfully persists selected_trip_id.
func TestSelectPackagePersistsSelectedTripID(t *testing.T) {
	tripID := uuid.New()
	repo := &mockMCPRepo{trip: models.Trip{BaseModel: models.BaseModel{ID: tripID}, Title: "Bali Adventure 3D2N"}}
	svc := newSelectionMCPService(repo)

	res, err := svc.Execute(context.Background(), uuid.New(), nil, mcp.ToolSelectPackage, map[string]interface{}{
		"trip_id": tripID.String(),
	})
	if err != nil {
		t.Fatalf("Execute: %v", err)
	}
	if res.Status != models.ToolResultStatusSuccess {
		t.Fatalf("selection must succeed: %+v", res)
	}
	if res.Data["trip_id"] != tripID.String() {
		t.Fatalf("result must echo the selected trip id: %+v", res.Data)
	}
	if len(repo.selectedTripUpdates) != 1 || repo.selectedTripUpdates[0] != tripID {
		t.Fatalf("selected_trip_id must be persisted exactly once with %s, got %v", tripID, repo.selectedTripUpdates)
	}
}

// (2) An invalid selection never changes selected_trip_id.
func TestSelectPackageInvalidSelectionDoesNotPersist(t *testing.T) {
	past := time.Now().Add(-time.Hour)
	cases := []struct {
		name    string
		repo    *mockMCPRepo
		payload map[string]interface{}
		wantErr string
	}{
		{
			name:    "malformed trip_id",
			repo:    &mockMCPRepo{trip: models.Trip{BaseModel: models.BaseModel{ID: uuid.New()}}},
			payload: map[string]interface{}{"trip_id": "not-a-uuid"},
			wantErr: "invalid trip_id",
		},
		{
			name:    "unknown trip",
			repo:    &mockMCPRepo{tripErr: errors.New("record not found")},
			payload: map[string]interface{}{"trip_id": uuid.NewString()},
			wantErr: "trip not found",
		},
		{
			name: "expired chat session",
			repo: &mockMCPRepo{
				trip:    models.Trip{BaseModel: models.BaseModel{ID: uuid.New()}},
				session: &models.ChatSession{ExpiresAt: &past},
			},
			payload: map[string]interface{}{"trip_id": uuid.NewString()},
			wantErr: "chat session expired",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			svc := newSelectionMCPService(tc.repo)
			res, err := svc.Execute(context.Background(), uuid.New(), nil, mcp.ToolSelectPackage, tc.payload)
			if err != nil {
				t.Fatalf("Execute: %v", err)
			}
			if res.Status != models.ToolResultStatusFailed {
				t.Fatalf("selection must fail: %+v", res)
			}
			if res.Data["error"] != tc.wantErr {
				t.Fatalf("expected error %q, got %+v", tc.wantErr, res.Data)
			}
			if len(tc.repo.selectedTripUpdates) != 0 {
				t.Fatalf("failed selection must not persist selected_trip_id, got %v", tc.repo.selectedTripUpdates)
			}
		})
	}
}

// (7) Selecting a package from an alternative set replaces the active package
// via the same mechanism (unconditional overwrite in executeSelectPackage).
func TestSelectPackageFromAlternativeSetReplacesSelection(t *testing.T) {
	first := uuid.New()
	second := uuid.New()
	repo := &mockMCPRepo{
		trip:    models.Trip{BaseModel: models.BaseModel{ID: second}, Title: "Bromo Sunrise"},
		session: &models.ChatSession{SelectedTripID: &first},
	}
	svc := newSelectionMCPService(repo)

	res, err := svc.Execute(context.Background(), uuid.New(), nil, mcp.ToolSelectPackage, map[string]interface{}{
		"trip_id": second.String(),
	})
	if err != nil {
		t.Fatalf("Execute: %v", err)
	}
	if res.Status != models.ToolResultStatusSuccess {
		t.Fatalf("re-selection must succeed: %+v", res)
	}
	if len(repo.selectedTripUpdates) != 1 || repo.selectedTripUpdates[0] != second {
		t.Fatalf("selected_trip_id must be overwritten with the alternative %s, got %v", second, repo.selectedTripUpdates)
	}
}

// (8) Normal package-detail conversation must not produce a new search: the
// tool-level guard refuses plain search_trips while a selection exists.
func TestSearchTripsRefusedAfterSelectionWithoutAlternative(t *testing.T) {
	selected := uuid.New()
	repo := &mockMCPRepo{
		trip:    models.Trip{BaseModel: models.BaseModel{ID: selected}, Title: "Bali Adventure 3D2N"},
		session: &models.ChatSession{SelectedTripID: &selected},
	}
	svc := newSelectionMCPService(repo)

	res, err := svc.Execute(context.Background(), uuid.New(), nil, mcp.ToolSearchTrips, map[string]interface{}{
		"query": "berapa harganya untuk 4 orang",
	})
	if err != nil {
		t.Fatalf("Execute: %v", err)
	}
	if res.Status != models.ToolResultStatusFailed {
		t.Fatalf("plain search after selection must be refused: %+v", res)
	}
	if res.Data["error"] != "a package is already selected" {
		t.Fatalf("expected the already-selected conflict, got %+v", res.Data)
	}
	if _, leaked := res.Data["packages"]; leaked {
		t.Fatalf("refused search must not carry packages: %+v", res.Data)
	}
}

// (9) An explicit alternative request CAN search after selection and produces
// a new recommendation result flagged reason=alternative.
func TestSearchTripsAlternativeAllowedAfterSelection(t *testing.T) {
	selected := uuid.New()
	repo := &mockMCPRepo{
		trip:    models.Trip{BaseModel: models.BaseModel{ID: uuid.New()}, Title: "Bromo Sunrise", Destination: "Bromo"},
		session: &models.ChatSession{SelectedTripID: &selected},
	}
	svc := newSelectionMCPService(repo)

	res, err := svc.Execute(context.Background(), uuid.New(), nil, mcp.ToolSearchTrips, map[string]interface{}{
		"query":       "paket lain",
		"alternative": true,
	})
	if err != nil {
		t.Fatalf("Execute: %v", err)
	}
	if res.Status != models.ToolResultStatusSuccess {
		t.Fatalf("alternative search must be allowed after selection: %+v", res)
	}
	if res.Data["reason"] != "alternative" {
		t.Fatalf("reason must be alternative, got %+v", res.Data)
	}
	packages, ok := res.Data["packages"].([]map[string]interface{})
	if !ok || len(packages) == 0 {
		t.Fatalf("alternative search must return packages: %+v", res.Data)
	}
	// The selection itself is untouched by a search.
	if len(repo.selectedTripUpdates) != 0 {
		t.Fatalf("search must never write selected_trip_id, got %v", repo.selectedTripUpdates)
	}
}

// (3+4) BUG-13 fix: selected_trip_id suppresses NORMAL recommendations but
// does NOT suppress an explicit alternative search result.
func TestFinalizeChatAlternativeAllowedAfterSelection(t *testing.T) {
	selected := uuid.New()
	repo := &mockAIRepo{session: models.ChatSession{SelectedTripID: &selected}}
	svc := newGenUIAIService(repo)
	altTripID := uuid.New()

	result, err := svc.finalizeChat(context.Background(), uuid.New(),
		ai.CompletionResponse{Text: "Berikut pilihan paket yang berbeda untuk Anda."},
		[]ToolResult{alternativeSearchTripsResult(map[string]interface{}{
			"id":    altTripID.String(),
			"title": "Bromo Sunrise 2D1N",
			"price": 1200000.0,
		})},
		nil,
	)
	if err != nil {
		t.Fatalf("finalizeChat: %v", err)
	}
	if !result.ShowRecommendations || len(result.RecommendedPackages) != 1 {
		t.Fatalf("explicit alternative request must render a NEW recommendation set: %+v", result)
	}
	if result.RecommendationReason != "alternative" {
		t.Fatalf("reason must be alternative, got %q", result.RecommendationReason)
	}
	if result.RecommendedPackages[0].ID != altTripID {
		t.Fatalf("alternative package mismatch: %+v", result.RecommendedPackages)
	}
	// The selection is still active and echoed to the client.
	if result.SelectedTripID == nil || *result.SelectedTripID != selected {
		t.Fatalf("ChatResult must echo selected_trip_id %s, got %+v", selected, result.SelectedTripID)
	}
	// The new set is persisted on ITS OWN assistant message.
	if len(repo.messages) != 1 || repo.messages[0].Recommendation == nil ||
		repo.messages[0].Recommendation.RecommendationReason != "alternative" {
		t.Fatalf("alternative set must persist with reason=alternative: %+v", repo.messages)
	}
}

// (3 cont.) The BUG-13 suppression of normal conversation stays intact
// (TestFinalizeChatNoRecommendationWhenSelected locks the no-flag case); this
// variant covers a successful plain search riding the same turn as a
// selection (reason "initial" -> suppressed).
func TestFinalizeChatPlainSearchStillSuppressedAfterSelection(t *testing.T) {
	selected := uuid.New()
	repo := &mockAIRepo{session: models.ChatSession{SelectedTripID: &selected}}
	svc := newGenUIAIService(repo)

	result, err := svc.finalizeChat(context.Background(), uuid.New(),
		ai.CompletionResponse{Text: "Paket Anda berangkat jam 06.00."},
		[]ToolResult{{
			Tool:   mcp.ToolSearchTrips,
			Status: models.ToolResultStatusSuccess,
			Data: map[string]interface{}{
				"packages": []map[string]interface{}{{"id": uuid.NewString(), "title": "Unrelated"}},
				"reason":   "initial",
			},
		}},
		nil,
	)
	if err != nil {
		t.Fatalf("finalizeChat: %v", err)
	}
	if result.ShowRecommendations || len(result.RecommendedPackages) != 0 {
		t.Fatalf("normal conversation must stay suppressed after selection: %+v", result)
	}
	if result.SelectedTripID == nil || *result.SelectedTripID != selected {
		t.Fatal("selected_trip_id must still be echoed on a suppressed turn")
	}
	if len(repo.messages) != 1 || repo.messages[0].Recommendation != nil {
		t.Fatal("suppressed turn must persist WITHOUT recommendation metadata")
	}
}

// (6) A new alternative set never overwrites the previous recommendation set:
// both keep their own persisted metadata on their own stable message ids.
func TestFinalizeChatAlternativePreservesPreviousRecommendationSet(t *testing.T) {
	selected := uuid.New()
	sessionID := uuid.New()
	setAID := uuid.New()
	repo := &mockAIRepo{
		session: models.ChatSession{SelectedTripID: &selected},
		messages: []models.ChatMessage{
			{BaseModel: models.BaseModel{ID: uuid.New()}, SessionID: sessionID, Role: "user", Content: "cari paket bali"},
			{
				BaseModel: models.BaseModel{ID: setAID}, SessionID: sessionID, Role: "assistant",
				Content: "Ini rekomendasi paket untuk Anda.",
				Recommendation: &models.ChatRecommendation{
					ShowRecommendations:  true,
					RecommendationReason: "initial",
					RecommendedPackages:  []models.Trip{{BaseModel: models.BaseModel{ID: uuid.New()}, Title: "Bali Adventure 3D2N"}},
				},
			},
		},
	}
	svc := newGenUIAIService(repo)

	result, err := svc.finalizeChat(context.Background(), sessionID,
		ai.CompletionResponse{Text: "Berikut pilihan paket yang berbeda untuk Anda."},
		[]ToolResult{alternativeSearchTripsResult(map[string]interface{}{
			"id":    uuid.NewString(),
			"title": "Bromo Sunrise 2D1N",
		})},
		nil,
	)
	if err != nil {
		t.Fatalf("finalizeChat: %v", err)
	}

	// Set A untouched (historical message, own id, own metadata).
	setA := repo.messages[1]
	if setA.ID != setAID || setA.Recommendation == nil ||
		setA.Recommendation.RecommendationReason != "initial" ||
		len(setA.Recommendation.RecommendedPackages) != 1 {
		t.Fatalf("previous recommendation set must remain intact: %+v", setA)
	}
	// Set B persisted as a NEW message with its own stable id and metadata.
	if len(repo.messages) != 3 {
		t.Fatalf("expected 3 messages after the alternative turn, got %d", len(repo.messages))
	}
	setB := repo.messages[2]
	if setB.ID == setAID || setB.ID != result.MessageID {
		t.Fatal("alternative set must be a new message with its own stable id")
	}
	if setB.Recommendation == nil || setB.Recommendation.RecommendationReason != "alternative" {
		t.Fatalf("alternative set must carry reason=alternative: %+v", setB.Recommendation)
	}
}

// The conflict backstop must stay silent when an explicit alternative search
// succeeded in the same turn — fresh cards are rendering and the model's own
// text introduces them.
func TestFinalizeChatConflictBackstopSilentWhenAlternativeSucceeded(t *testing.T) {
	selected := uuid.New()
	repo := &mockAIRepo{session: models.ChatSession{SelectedTripID: &selected}}
	svc := newGenUIAIService(repo)
	modelText := "Ini pilihan paket yang berbeda untuk Anda."

	result, err := svc.finalizeChat(context.Background(), uuid.New(),
		ai.CompletionResponse{Text: modelText},
		[]ToolResult{
			// The model first tried a plain search (refused by the tool-level
			// guard), then retried with alternative=true (allowed).
			{Tool: mcp.ToolSearchTrips, Status: models.ToolResultStatusFailed, Data: map[string]interface{}{
				"error":               "a package is already selected",
				"selected_trip_title": "Bali Adventure 3D2N",
			}},
			alternativeSearchTripsResult(map[string]interface{}{"id": uuid.NewString(), "title": "Bromo Sunrise 2D1N"}),
		},
		nil,
	)
	if err != nil {
		t.Fatalf("finalizeChat: %v", err)
	}
	if result.Message != modelText {
		t.Fatalf("backstop must not clobber the model text when alternatives render: %q", result.Message)
	}
	if !result.ShowRecommendations {
		t.Fatal("alternative cards must render")
	}
}

// ChatResult exposes selected_trip_id on the wire (omitempty when absent) so
// the client can mark the selected card after any turn.
func TestChatResultSelectedTripIDJSONShape(t *testing.T) {
	selected := uuid.New()
	withSel := ChatResult{Message: "ok", SelectedTripID: &selected}
	raw, err := json.Marshal(withSel)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if !strings.Contains(string(raw), `"selected_trip_id":"`+selected.String()+`"`) {
		t.Fatalf("selected_trip_id missing from payload: %s", raw)
	}
	without := ChatResult{Message: "ok"}
	raw, err = json.Marshal(without)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if strings.Contains(string(raw), "selected_trip_id") {
		t.Fatalf("selected_trip_id must be omitted when nil: %s", raw)
	}
}

// (14) Reload: history returns the persisted selection alongside the messages
// so the client restores the selected card state without any search_trips/LLM
// call (client nil + executor nil prove it structurally).
func TestGetGuestHistoryReturnsSelectedTrip(t *testing.T) {
	selected := uuid.New()
	sessionID := uuid.New()
	repo := &mockAIRepo{
		session: models.ChatSession{SelectedTripID: &selected},
		messages: []models.ChatMessage{
			{BaseModel: models.BaseModel{ID: uuid.New()}, SessionID: sessionID, Role: "assistant", Content: "Paket dipilih."},
		},
	}
	svc := newGenUIAIService(repo)

	_, selectedTripID, err := svc.GetGuestHistory(context.Background(), sessionID)
	if err != nil {
		t.Fatalf("GetGuestHistory: %v", err)
	}
	if selectedTripID == nil || *selectedTripID != selected {
		t.Fatalf("history must return the persisted selection %s, got %+v", selected, selectedTripID)
	}
}
