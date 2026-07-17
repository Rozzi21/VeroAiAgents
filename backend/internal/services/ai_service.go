package services

import (
	"context"
	"encoding/json"
	"sort"
	"strings"

	"github.com/google/uuid"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/ai"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/config"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/dto"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/events"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/models"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/repositories"
)

type AIService struct {
	repo   *repositories.Repository
	mcp    *MCPService
	bus    *events.Bus
	client *ai.Client
	cfg    config.Config
}

type ChatResult struct {
	SessionID           uuid.UUID     `json:"session_id"`
	Message             string        `json:"message"`
	Workflow            []ToolResult  `json:"workflow"`
	RecommendedPackages []models.Trip `json:"recommended_packages"`
}

func (s *AIService) Chat(userID uuid.UUID, req dto.ChatRequest) (ChatResult, error) {
	sessionID := uuid.Nil
	if req.SessionID != nil {
		sessionID = *req.SessionID
	} else {
		session := models.ChatSession{UserID: userID, Title: summarizePrompt(req.Prompt)}
		if err := s.repo.CreateChatSession(&session); err != nil {
			return ChatResult{}, err
		}
		sessionID = session.ID
	}

	if err := s.repo.AddChatMessage(&models.ChatMessage{SessionID: sessionID, Role: "user", Content: req.Prompt}); err != nil {
		return ChatResult{}, err
	}

	steps := []struct {
		event string
		tool  string
	}{
		{"ai_thinking", "search_destination"},
		{"searching_destination", "search_hotels"},
		{"calculating_budget", "calculate_budget"},
		{"generating_itinerary", "generate_itinerary"},
		// DOKU/payment disabled temporarily. AI must not call create_payment or
		// mention QRIS/checkout; orders are saved as pending for admin processing.
		// Re-enable only with PAYMENTS_ENABLED=true and MCP Catalog Enabled=true.
		// {"payment_created", "create_payment"},
	}

	results := make([]ToolResult, 0, len(steps))
	for _, step := range steps {
		s.bus.Publish(step.event, map[string]interface{}{"session_id": sessionID, "prompt": req.Prompt})
		result, err := s.mcp.Execute(sessionID, step.tool, map[string]interface{}{"prompt": req.Prompt})
		if err != nil {
			return ChatResult{}, err
		}
		results = append(results, result)
	}

	response := "I found a premium autonomous travel plan with destination matches, hotel inventory, budget estimate, and itinerary draft."
	packages, _ := s.publishedPackagesForAI()
	aiResponse, err := s.generateWithAI(sessionID, req.Prompt, results, packages)
	if err != nil {
		errorPayload, _ := json.Marshal(map[string]interface{}{
			"error": err.Error(),
			"mode":  "local_fallback",
		})
		_ = s.repo.CreateAILog(&models.AILog{
			SessionID: &sessionID,
			Workflow:  "ai_generation",
			Status:    "failed",
			Response:  string(errorPayload),
		})
	} else if aiResponse.Text != "" {
		response = aiResponse.Text
		payload, _ := json.Marshal(aiResponse.Metadata)
		_ = s.repo.CreateAILog(&models.AILog{
			SessionID: &sessionID,
			Workflow:  "ai_generation",
			Status:    "success",
			Response:  string(payload),
		})
		s.bus.Publish("ai_response", map[string]interface{}{
			"session_id": sessionID,
			"status":     aiResponse.RawStatus,
		})
	}
	if err := s.repo.AddChatMessage(&models.ChatMessage{SessionID: sessionID, Role: "assistant", Content: response}); err != nil {
		return ChatResult{}, err
	}
	_ = s.refreshMemorySummary(sessionID)
	s.bus.Publish("workflow_completed", map[string]interface{}{"session_id": sessionID, "message": response})

	return ChatResult{
		SessionID:           sessionID,
		Message:             response,
		Workflow:            results,
		RecommendedPackages: selectRecommendedPackages(req.Prompt+" "+response, packages),
	}, nil
}

func (s *AIService) generateWithAI(sessionID uuid.UUID, prompt string, workflow []ToolResult, packages []models.Trip) (ai.CompletionResponse, error) {
	ctx, cancel := context.WithTimeout(context.Background(), s.cfg.AITimeout)
	defer cancel()

	messages := []ai.Message{
		{
			Role:    "system",
			Content: "You are Vero Travel, an autonomous travel assistant. Answer in natural Indonesian. Recommend only from the provided published package catalog when packages are relevant. Mention exact package names so the UI can show matching cards. Explain concise reasoning and suggest the next booking step: customer confirms selected package, then an order is saved with NEW/PENDING status for admin processing. Payments are temporarily disabled, so never mention DOKU, QRIS, virtual accounts, checkout links, payment sessions, payment instructions, or paying now. Do not use Markdown formatting, bold markers, asterisks, headings, or decorative symbols. Use plain text and simple hyphen bullets only when a list is helpful.",
		},
	}
	if catalog := packageCatalogSummary(packages); catalog != "" {
		messages = append(messages, ai.Message{Role: "system", Content: catalog})
	}
	session, err := s.repo.FindChatSession(sessionID)
	if err == nil && session.MemorySummary != "" {
		messages = append(messages, ai.Message{Role: "system", Content: "Conversation memory summary: " + session.MemorySummary})
	}
	// Token optimization: send a compact workflow summary (tool + status) as a
	// system message BEFORE the conversation tail, instead of the full dummy
	// tool payloads.
	messages = append(messages, ai.Message{
		Role:    "system",
		Content: "Latest travel workflow context: " + summarizeWorkflow(workflow),
	})
	// Recent messages already end with the user's latest prompt (persisted by
	// Chat() before this call), so we do NOT append the prompt again — that would
	// duplicate it and waste tokens.
	recent, _ := s.repo.ListRecentChatMessages(sessionID, s.cfg.AIRecentMessages)
	for _, message := range recent {
		messages = append(messages, ai.Message{Role: message.Role, Content: message.Content})
	}
	// Fallback only if, for some reason, the tail could not be loaded.
	if len(recent) == 0 {
		messages = append(messages, ai.Message{Role: "user", Content: prompt})
	}

	return s.client.Generate(ctx, ai.CompletionRequest{
		Messages: messages,
	})
}

// summarizeWorkflow renders only the tool name and status of each MCP step as
// compact JSON, keeping the LLM context small (token optimization).
func summarizeWorkflow(workflow []ToolResult) string {
	type step struct {
		Tool   string `json:"tool"`
		Status string `json:"status"`
	}
	steps := make([]step, 0, len(workflow))
	for _, item := range workflow {
		steps = append(steps, step{Tool: item.Tool, Status: item.Status})
	}
	payload, _ := json.Marshal(steps)
	return string(payload)
}

func (s *AIService) publishedPackagesForAI() ([]models.Trip, error) {
	return s.repo.ListTrips(dto.TripListQuery{PublishedOnly: true, Limit: 20})
}

func packageCatalogSummary(packages []models.Trip) string {
	if len(packages) == 0 {
		return "Published package catalog is currently empty."
	}
	type packageSummary struct {
		ID          uuid.UUID `json:"id"`
		Slug        string    `json:"slug"`
		Title       string    `json:"title"`
		Destination string    `json:"destination"`
		Category    string    `json:"category"`
		Duration    string    `json:"duration"`
		Price       float64   `json:"price"`
		Summary     string    `json:"summary"`
		Highlights  []string  `json:"highlights"`
	}
	summaries := make([]packageSummary, 0, len(packages))
	for _, trip := range packages {
		summaries = append(summaries, packageSummary{
			ID:          trip.ID,
			Slug:        trip.Slug,
			Title:       trip.Title,
			Destination: trip.Destination,
			Category:    trip.Category,
			Duration:    trip.Duration,
			Price:       firstNonZero(trip.BasePrice, trip.EstimatedPrice),
			Summary:     trip.Summary,
			Highlights:  trip.Highlights,
		})
	}
	payload, _ := json.Marshal(summaries)
	return "Current published package catalog from database, automatically refreshed on every chat request: " + string(payload)
}

func selectRecommendedPackages(text string, packages []models.Trip) []models.Trip {
	if len(packages) == 0 {
		return nil
	}
	text = strings.ToLower(text)
	type scoredTrip struct {
		trip  models.Trip
		score int
	}
	scored := make([]scoredTrip, 0, len(packages))
	for _, trip := range packages {
		score := 0
		for _, token := range []string{trip.Title, trip.Destination, trip.Location, trip.Category, trip.Slug} {
			token = strings.ToLower(strings.TrimSpace(token))
			if token != "" && strings.Contains(text, token) {
				score += 3
			}
		}
		for _, highlight := range trip.Highlights {
			highlight = strings.ToLower(strings.TrimSpace(highlight))
			if highlight != "" && strings.Contains(text, highlight) {
				score++
			}
		}
		scored = append(scored, scoredTrip{trip: trip, score: score})
	}
	sort.SliceStable(scored, func(i, j int) bool {
		return scored[i].score > scored[j].score
	})
	recommended := make([]models.Trip, 0, 3)
	for _, item := range scored {
		if item.score == 0 && len(recommended) > 0 {
			break
		}
		recommended = append(recommended, item.trip)
		if len(recommended) == 3 {
			break
		}
	}
	if len(recommended) == 0 {
		for i := 0; i < len(packages) && i < 3; i++ {
			recommended = append(recommended, packages[i])
		}
	}
	return recommended
}

func (s *AIService) refreshMemorySummary(sessionID uuid.UUID) error {
	count, err := s.repo.CountChatMessages(sessionID)
	if err != nil || count < int64(s.cfg.AIMemorySummaryAfter) {
		return err
	}
	session, err := s.repo.FindChatSession(sessionID)
	if err != nil {
		return err
	}
	// Only fetch the tail of the conversation instead of ALL messages.
	// We estimate how many recent messages are needed to fill AIMemoryMaxChars.
	// A conservative heuristic: ~200 chars per message, so fetch enough to exceed
	// the max. This avoids loading thousands of rows for long sessions.
	tailLimit := s.cfg.AIMemoryMaxChars / 200
	if tailLimit < 20 {
		tailLimit = 20
	}
	messages, err := s.repo.TailChatMessages(sessionID, tailLimit)
	if err != nil {
		return err
	}
	var parts []string
	for _, message := range messages {
		parts = append(parts, message.Role+": "+message.Content)
	}
	summary := strings.Join(parts, "\n")
	if len(summary) > s.cfg.AIMemoryMaxChars {
		summary = summary[len(summary)-s.cfg.AIMemoryMaxChars:]
	}
	session.MemorySummary = summary
	return s.repo.UpdateChatSession(&session)
}

func summarizePrompt(prompt string) string {
	if len(prompt) <= 64 {
		return prompt
	}
	return prompt[:64] + "..."
}
