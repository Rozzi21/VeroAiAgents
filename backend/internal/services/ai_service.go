package services

import (
	"context"
	"encoding/json"
	"log"
	"sort"
	"strings"

	"github.com/google/uuid"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/ai"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/config"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/dto"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/events"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/mcp"
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
	// SEC-17: a client-supplied session_id must belong to the caller. Foreign or
	// unknown sessions fall through to a fresh session instead of letting one
	// guest inject messages into another guest's conversation context.
	sessionID := uuid.Nil
	if req.SessionID != nil {
		if existing, err := s.repo.FindChatSession(*req.SessionID); err == nil && existing.UserID == userID {
			sessionID = existing.ID
		}
	}
	if sessionID == uuid.Nil {
		session := models.ChatSession{UserID: userID, Title: summarizePrompt(req.Prompt)}
		if err := s.repo.CreateChatSession(&session); err != nil {
			return ChatResult{}, err
		}
		sessionID = session.ID
	}

	if err := s.repo.AddChatMessage(&models.ChatMessage{SessionID: sessionID, Role: "user", Content: req.Prompt}); err != nil {
		return ChatResult{}, err
	}

	// Phase 1: Run the hardcoded MCP workflow pipeline (search/budget/itinerary).
	// These are pre-processing steps that feed context into the LLM.
	steps := []struct {
		event string
		tool  string
	}{
		{"ai_thinking", "search_destination"},
		{"searching_destination", "search_hotels"},
		{"calculating_budget", "calculate_budget"},
		{"generating_itinerary", "generate_itinerary"},
	}

	results := make([]ToolResult, 0, len(steps))
	for _, step := range steps {
		// SEC-18: never broadcast the raw user prompt on the shared event bus;
		// only non-sensitive workflow metadata (tool name + session id).
		s.bus.Publish(step.event, map[string]interface{}{"session_id": sessionID, "tool": step.tool})
		result, err := s.mcp.Execute(sessionID, step.tool, map[string]interface{}{"prompt": req.Prompt})
		if err != nil {
			return ChatResult{}, err
		}
		results = append(results, result)
	}

	// Phase 2: Call the LLM with function calling support, then execute any
	// tool calls the LLM makes (create_booking, update_order_draft, etc.).
	response := "I found a premium autonomous travel plan with destination matches, hotel inventory, budget estimate, and itinerary draft."
	packages, _ := s.publishedPackagesForAI()
	aiResponse, toolResults, err := s.generateWithToolLoop(sessionID, req.Prompt, results, packages)
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

	// Merge tool results from the LLM-driven tool calls into workflow results.
	results = append(results, toolResults...)

	// Defense-in-depth: even with tool calling enabled and strict prompting, the
	// model must not be allowed to claim booking creation unless the backend tool
	// actually succeeded.
	if responseClaimsOrderCreated(response) && !hasSuccessfulCreateBooking(toolResults) {
		log.Printf("[ai] blocked unsafe booking success claim for session=%s", sessionID)
		response = "Maaf, saya belum berhasil membuat pesanan Anda karena terjadi kendala pada sistem. Silakan coba beberapa saat lagi."
	}

	if err := s.repo.AddChatMessage(&models.ChatMessage{SessionID: sessionID, Role: "assistant", Content: response}); err != nil {
		return ChatResult{}, err
	}
	_ = s.refreshMemorySummary(sessionID)
	// SEC-18: omit the assistant message body from the broadcast; subscribers
	// only need a completion signal scoped to the session.
	s.bus.Publish("workflow_completed", map[string]interface{}{"session_id": sessionID})

	return ChatResult{
		SessionID:           sessionID,
		Message:             response,
		Workflow:            results,
		RecommendedPackages: selectRecommendedPackages(req.Prompt+" "+response, packages),
	}, nil
}

// generateWithToolLoop calls the LLM with OpenAI function calling enabled.
// If the LLM responds with tool_calls, this function executes them via MCP,
// appends the results back into the conversation, and calls the LLM again
// so it can generate a final text response based on actual tool results.
// This ensures the AI NEVER claims an order was created unless the backend
// actually confirms it.
func (s *AIService) generateWithToolLoop(sessionID uuid.UUID, prompt string, workflow []ToolResult, packages []models.Trip) (ai.CompletionResponse, []ToolResult, error) {
	ctx, cancel := context.WithTimeout(context.Background(), s.cfg.AITimeout)
	defer cancel()

	messages := s.buildMessages(sessionID, prompt, workflow, packages)
	tools := mcp.OpenAITools()

	var allToolResults []ToolResult

	for round := 0; round < ai.MaxToolCallRounds; round++ {
		resp, err := s.client.Generate(ctx, ai.CompletionRequest{
			Messages: messages,
			Tools:    tools,
		})
		if err != nil {
			return resp, allToolResults, err
		}

		// No tool calls — LLM gave a final text response.
		if len(resp.ToolCalls) == 0 {
			return resp, allToolResults, nil
		}

		log.Printf("[ai] round %d: LLM requested %d tool call(s)", round+1, len(resp.ToolCalls))

		// Append the assistant message with tool_calls to the conversation.
		assistantMsg := ai.Message{
			Role:      "assistant",
			ToolCalls: resp.ToolCalls,
		}
		messages = append(messages, assistantMsg)

		// Execute each tool call and append tool results as "tool" role messages.
		for _, tc := range resp.ToolCalls {
			log.Printf("[ai] executing tool: %s (call_id=%s) args=%s", tc.Function.Name, tc.ID, tc.Function.Arguments)

			// Parse the function arguments from JSON string.
			var args map[string]interface{}
			if err := json.Unmarshal([]byte(tc.Function.Arguments), &args); err != nil {
				log.Printf("[ai] failed to parse tool args for %s: %v", tc.Function.Name, err)
				args = map[string]interface{}{}
			}

			// Execute via MCP service (which handles create_booking, mock tools, etc.)
			toolResult, execErr := s.mcp.Execute(sessionID, tc.Function.Name, args)
			if execErr != nil {
				log.Printf("[ai] tool execution error for %s: %v", tc.Function.Name, execErr)
				toolResult = ToolResult{
					Tool:   tc.Function.Name,
					Status: "failed",
					Data:   map[string]interface{}{"error": execErr.Error()},
				}
			}

			allToolResults = append(allToolResults, toolResult)

			// Serialize the tool result and append as a "tool" role message
			// so the LLM knows the actual outcome.
			resultJSON, _ := json.Marshal(toolResult)
			log.Printf("[ai] tool result for %s: %s", tc.Function.Name, string(resultJSON))

			messages = append(messages, ai.Message{
				Role:       "tool",
				Content:    string(resultJSON),
				ToolCallID: tc.ID,
				Name:       tc.Function.Name,
			})
		}

		// Continue the loop — the LLM will receive tool results and either
		// make more tool calls or generate a final text response.
	}

	// If we exhausted all rounds, force a final call without tools so the LLM
	// generates a text response.
	log.Printf("[ai] exhausted %d tool call rounds, forcing final text response", ai.MaxToolCallRounds)
	resp, err := s.client.Generate(ctx, ai.CompletionRequest{Messages: messages})
	return resp, allToolResults, err
}

// buildMessages constructs the initial message array for the LLM, including
// system prompt, package catalog, memory summary, workflow context, and recent
// conversation history.
func (s *AIService) buildMessages(sessionID uuid.UUID, prompt string, workflow []ToolResult, packages []models.Trip) []ai.Message {
	messages := []ai.Message{
		{
			Role: "system",
			Content: "You are Vero Travel, a professional travel assistant. Answer in natural Indonesian. ONLY recommend real packages retrieved from the provided catalog. Never invent package names, prices, destinations, durations, or details. " +
				"If the user's message indicates a destination or preference, prioritize and recommend up to 3 of the most relevant packages, briefly explaining why each matches their request. Mention exact package names so the UI can show matching cards. Only list the entire catalog if explicitly asked or if you lack preference information. " +
				"When a customer selects a package, you MUST collect the following information: " +
				"1. Number of adults " +
				"2. Number of children (if any) " +
				"3. Travel date " +
				"4. Contact information (Email OR WhatsApp number). Explain that this is needed so the team can follow up. " +
				"You have access to tools. Call `update_order_draft` when gathering info. " +
				"CRITICAL INSTRUCTION: `update_order_draft` DOES NOT create the order. Once ALL required info is collected, you MUST call `create_booking` to actually save the order to the database. " +
				"NEVER tell the customer the order is created until you have successfully called `create_booking` and received a success response. " +
				"If `create_booking` succeeds, confirm the order. If it fails, apologize and ask them to try again. " +
				"Use natural, customer-facing language. NEVER expose internal order statuses (like NEW, PENDING, PROCESSING), and never explain backend workflows, database, or admin processes. " +
				"Instead of technical steps, suggest the next step naturally: e.g., 'Silakan pilih paket yang Anda inginkan.', ask 'Berapa orang yang ikut?', or say 'Pesanan Anda sudah berhasil dibuat. Tim kami akan segera menghubungi Anda.' (only after tool success). " +
				"Payments are temporarily disabled, so never mention DOKU, QRIS, virtual accounts, checkout links, payment sessions, payment instructions, or paying now. " +
				"Do not use Markdown formatting, bold markers, asterisks, headings, or decorative symbols. Use plain text and simple hyphen bullets only when a list is helpful.",
		},
	}
	if catalog := packageCatalogSummary(packages); catalog != "" {
		messages = append(messages, ai.Message{Role: "system", Content: catalog})
	}
	session, err := s.repo.FindChatSession(sessionID)
	if err == nil && session.MemorySummary != "" {
		messages = append(messages, ai.Message{Role: "system", Content: "Conversation memory summary: " + session.MemorySummary})
	}
	messages = append(messages, ai.Message{
		Role:    "system",
		Content: "Latest travel workflow context: " + summarizeWorkflow(workflow),
	})
	recent, _ := s.repo.ListRecentChatMessages(sessionID, s.cfg.AIRecentMessages)
	for _, message := range recent {
		messages = append(messages, ai.Message{Role: message.Role, Content: message.Content})
	}
	if len(recent) == 0 {
		messages = append(messages, ai.Message{Role: "user", Content: prompt})
	}

	return messages
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

func hasSuccessfulCreateBooking(results []ToolResult) bool {
	for _, result := range results {
		if result.Tool == "create_booking" && result.Status == "success" {
			return true
		}
	}
	return false
}

func responseClaimsOrderCreated(response string) bool {
	lower := strings.ToLower(response)
	if strings.Contains(lower, "belum berhasil") || strings.Contains(lower, "tidak berhasil") || strings.Contains(lower, "gagal") {
		return false
	}
	phrases := []string{
		"pesanan anda berhasil dibuat",
		"pesanan anda sudah dibuat",
		"pesanan anda telah dibuat",
		"pesanan sudah berhasil dibuat",
		"pesanan berhasil dibuat",
		"pemesanan anda berhasil",
		"pemesanan berhasil",
		"booking anda berhasil",
		"reservasi anda berhasil",
		"order has been successfully created",
		"order successfully created",
		"order anda berhasil",
		"booking has been successfully created",
		"booking successfully created",
		"berhasil saya buatkan",
	}
	for _, phrase := range phrases {
		if strings.Contains(lower, phrase) {
			return true
		}
	}
	orderWords := []string{"pesanan", "pemesanan", "order", "booking", "reservasi"}
	successWords := []string{"berhasil dibuat", "sudah dibuat", "telah dibuat", "successfully created", "created successfully"}
	for _, orderWord := range orderWords {
		if !strings.Contains(lower, orderWord) {
			continue
		}
		for _, successWord := range successWords {
			if strings.Contains(lower, successWord) {
				return true
			}
		}
	}
	return false
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
