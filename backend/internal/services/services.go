package services

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/ai"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/auth"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/config"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/dto"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/events"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/models"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/repositories"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type Services struct {
	Config    config.Config
	Repo      *repositories.Repository
	JWT       *auth.JWTService
	Events    *events.Bus
	Auth      *AuthService
	AI        *AIService
	MCP       *MCPService
	Trips     *TripService
	Bookings  *BookingService
	Payments  *PaymentService
	Logs      *LogService
	Analytics *AnalyticsService
}

func New(cfg config.Config, repo *repositories.Repository, jwt *auth.JWTService, bus *events.Bus) *Services {
	s := &Services{Config: cfg, Repo: repo, JWT: jwt, Events: bus}
	s.Auth = &AuthService{repo: repo, jwt: jwt, cfg: cfg}
	s.MCP = &MCPService{repo: repo, bus: bus}
	aiClient := ai.NewClient(cfg.AIAPIKey, cfg.AIBaseURL, cfg.AIModel, cfg.AITemperature, cfg.AITimeout)
	s.AI = &AIService{repo: repo, mcp: s.MCP, bus: bus, client: aiClient, cfg: cfg}
	s.Trips = &TripService{repo: repo, bus: bus}
	s.Bookings = &BookingService{repo: repo, bus: bus}
	s.Payments = &PaymentService{repo: repo, bus: bus, cfg: cfg}
	s.Logs = &LogService{repo: repo}
	s.Analytics = &AnalyticsService{repo: repo}
	return s
}

type AuthRequestMeta struct {
	IP        string
	UserAgent string
	RequestID string
}

type AuthIssueResult struct {
	Response     dto.AuthResponse
	RefreshToken string
	RefreshJTI   string
}

var (
	ErrRefreshTokenRevoked = errors.New("refresh token revoked")
	ErrInvalidRefreshToken = errors.New("invalid refresh token")
)

type AuthService struct {
	repo *repositories.Repository
	jwt  *auth.JWTService
	cfg  config.Config
}

func (s *AuthService) auditFields(meta AuthRequestMeta, extra map[string]any) map[string]any {
	fields := map[string]any{
		"ip":         meta.IP,
		"user_agent": meta.UserAgent,
		"request_id": meta.RequestID,
	}
	for key, value := range extra {
		fields[key] = value
	}
	return fields
}

func (s *AuthService) Register(req dto.RegisterRequest, meta AuthRequestMeta) (AuthIssueResult, error) {
	role := models.RoleUser
	if req.Role == string(models.RoleOperator) || req.Role == string(models.RoleAdmin) {
		role = models.Role(req.Role)
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return AuthIssueResult{}, err
	}
	user := models.User{Name: req.Name, Email: strings.ToLower(req.Email), Password: string(hash), Role: role}
	if err := s.repo.CreateUser(&user); err != nil {
		return AuthIssueResult{}, err
	}
	result, err := s.issueSession(user)
	if err != nil {
		return AuthIssueResult{}, err
	}
	auth.LogSecurity(auth.EventLoginSuccess, s.auditFields(meta, map[string]any{
		"user_id": user.ID.String(),
		"email":   user.Email,
		"jti":     result.RefreshJTI,
	}))
	return result, nil
}

func (s *AuthService) Login(req dto.LoginRequest, meta AuthRequestMeta) (AuthIssueResult, error) {
	email := req.Email
	if email == "" {
		email = req.Username
	}
	user, err := s.repo.FindUserByEmail(strings.ToLower(email))
	if err != nil {
		auth.LogSecurity(auth.EventLoginFailed, s.auditFields(meta, map[string]any{
			"email": strings.ToLower(email),
			"error": "invalid email or password",
		}))
		return AuthIssueResult{}, errors.New("invalid email or password")
	}
	if bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password)) != nil {
		auth.LogSecurity(auth.EventLoginFailed, s.auditFields(meta, map[string]any{
			"user_id": user.ID.String(),
			"email":   user.Email,
			"error":   "invalid email or password",
		}))
		return AuthIssueResult{}, errors.New("invalid email or password")
	}
	result, err := s.issueSession(user)
	if err != nil {
		return AuthIssueResult{}, err
	}
	auth.LogSecurity(auth.EventLoginSuccess, s.auditFields(meta, map[string]any{
		"user_id": user.ID.String(),
		"email":   user.Email,
		"jti":     result.RefreshJTI,
	}))
	return result, nil
}

func (s *AuthService) Refresh(refreshToken string, meta AuthRequestMeta) (AuthIssueResult, error) {
	if refreshToken == "" {
		auth.LogSecurity(auth.EventRefreshFailed, s.auditFields(meta, map[string]any{
			"error": "missing refresh token",
		}))
		return AuthIssueResult{}, ErrInvalidRefreshToken
	}

	claims, err := s.jwt.Parse(refreshToken)
	if err == nil && auth.IsAudience(claims, auth.AudienceAccess) {
		auth.LogSecurity(auth.EventAccessTokenUsedOnRefresh, s.auditFields(meta, map[string]any{
			"user_id": claims.UserID.String(),
			"email":   claims.Email,
			"jti":     claims.ID,
		}))
		return AuthIssueResult{}, ErrInvalidRefreshToken
	}

	claims, err = s.jwt.ParseWithAudience(refreshToken, auth.AudienceRefresh)
	if err != nil {
		auth.LogSecurity(auth.EventRefreshFailed, s.auditFields(meta, map[string]any{
			"error": err.Error(),
		}))
		return AuthIssueResult{}, ErrInvalidRefreshToken
	}

	session, err := s.repo.FindSessionByJTI(claims.ID)
	if err != nil {
		auth.LogSecurity(auth.EventRefreshFailed, s.auditFields(meta, map[string]any{
			"user_id": claims.UserID.String(),
			"email":   claims.Email,
			"jti":     claims.ID,
			"error":   "session not found",
		}))
		return AuthIssueResult{}, ErrRefreshTokenRevoked
	}
	if session.RevokedAt != nil {
		// A refresh token that was already rotated (revoked) is being used again.
		// This is a strong indicator of token theft, so we defensively revoke every
		// active session for this user, forcing a fresh login on all devices.
		_ = s.repo.RevokeAllActiveSessionsByUser(claims.UserID)
		auth.LogSecurity(auth.EventRefreshTokenReuseDetected, s.auditFields(meta, map[string]any{
			"user_id": claims.UserID.String(),
			"email":   claims.Email,
			"jti":     claims.ID,
		}))
		return AuthIssueResult{}, ErrRefreshTokenRevoked
	}
	if session.ExpiresAt.Before(time.Now()) {
		auth.LogSecurity(auth.EventRefreshTokenRevoked, s.auditFields(meta, map[string]any{
			"user_id": claims.UserID.String(),
			"email":   claims.Email,
			"jti":     claims.ID,
		}))
		return AuthIssueResult{}, ErrRefreshTokenRevoked
	}

	if _, err := s.repo.FindActiveSessionByJTI(claims.ID); err != nil {
		auth.LogSecurity(auth.EventRefreshTokenRevoked, s.auditFields(meta, map[string]any{
			"user_id": claims.UserID.String(),
			"email":   claims.Email,
			"jti":     claims.ID,
		}))
		return AuthIssueResult{}, ErrRefreshTokenRevoked
	}

	if err := s.repo.RevokeSessionByJTI(claims.ID); err != nil {
		return AuthIssueResult{}, err
	}

	user, err := s.repo.FindUserByID(claims.UserID)
	if err != nil {
		return AuthIssueResult{}, err
	}

	result, err := s.issueSession(user)
	if err != nil {
		return AuthIssueResult{}, err
	}

	auth.LogSecurity(auth.EventRefreshSuccess, s.auditFields(meta, map[string]any{
		"user_id": user.ID.String(),
		"email":   user.Email,
		"jti":     result.RefreshJTI,
	}))
	return result, nil
}

func (s *AuthService) Logout(refreshToken string, meta AuthRequestMeta) error {
	if refreshToken == "" {
		return nil
	}

	claims, err := s.jwt.ParseWithAudience(refreshToken, auth.AudienceRefresh)
	if err != nil {
		auth.LogSecurity(auth.EventLogout, s.auditFields(meta, map[string]any{
			"error": err.Error(),
		}))
		return nil
	}

	_ = s.repo.RevokeSessionByJTIIfExists(claims.ID)
	auth.LogSecurity(auth.EventLogout, s.auditFields(meta, map[string]any{
		"user_id": claims.UserID.String(),
		"email":   claims.Email,
		"jti":     claims.ID,
	}))
	return nil
}

func (s *AuthService) Me(userID uuid.UUID) (models.User, error) {
	return s.repo.FindUserByID(userID)
}

func (s *AuthService) GuestUser() (models.User, error) {
	hash, _ := bcrypt.GenerateFromPassword([]byte(uuid.NewString()), bcrypt.DefaultCost)
	user := models.User{
		Name:     "Guest Traveler",
		Email:    "guest@vero.local",
		Password: string(hash),
		Role:     models.RoleUser,
	}
	err := s.repo.FirstOrCreateUser(&user)
	return user, err
}

func (s *AuthService) issueSession(user models.User) (AuthIssueResult, error) {
	pair, err := s.jwt.Generate(user)
	if err != nil {
		return AuthIssueResult{}, err
	}
	expiresAt := time.Now().Add(s.jwt.RefreshTTL())
	if err := s.repo.CreateAuthSession(user.ID, pair.RefreshJTI, expiresAt); err != nil {
		return AuthIssueResult{}, err
	}
	return AuthIssueResult{
		Response: dto.AuthResponse{
			AccessToken: pair.AccessToken,
			TokenType:   "Bearer",
			ExpiresIn:   pair.ExpiresIn,
			User:        user,
		},
		RefreshToken: pair.RefreshToken,
		RefreshJTI:   pair.RefreshJTI,
	}, nil
}

type MCPService struct {
	repo *repositories.Repository
	bus  *events.Bus
}

type ToolResult struct {
	Tool   string                 `json:"tool"`
	Status string                 `json:"status"`
	Data   map[string]interface{} `json:"data"`
}

func (s *MCPService) Execute(sessionID uuid.UUID, toolName string, payload map[string]interface{}) (ToolResult, error) {
	start := time.Now()
	var result ToolResult

	for attempt := 1; attempt <= 3; attempt++ {
		result = s.mock(toolName, payload)
		if result.Status == "success" {
			break
		}
		time.Sleep(time.Duration(attempt) * 100 * time.Millisecond)
	}

	payloadJSON, _ := json.Marshal(payload)
	resultJSON, _ := json.Marshal(result)
	_ = s.repo.CreateToolCall(&models.ToolCall{
		SessionID: sessionID,
		ToolName:  toolName,
		Payload:   string(payloadJSON),
		Result:    string(resultJSON),
		Status:    result.Status,
	})
	_ = s.repo.CreateAILog(&models.AILog{
		SessionID:     &sessionID,
		Workflow:      "mcp_tool_execution",
		ToolName:      toolName,
		Status:        result.Status,
		ExecutionTime: time.Since(start).Milliseconds(),
		Response:      string(resultJSON),
	})
	s.bus.Publish("mcp_tool_executed", result)
	return result, nil
}

func (s *MCPService) mock(toolName string, payload map[string]interface{}) ToolResult {
	switch toolName {
	case "search_destination":
		return ToolResult{Tool: toolName, Status: "success", Data: map[string]interface{}{
			"destinations": []string{"Tokyo", "Kyoto", "Osaka", "Bali"},
			"match":        0.96,
		}}
	case "search_hotels":
		return ToolResult{Tool: toolName, Status: "success", Data: map[string]interface{}{
			"hotels": []string{"Aman Kyoto", "Hoshinoya Tokyo", "Bali Ocean Villa"},
			"count":  18,
		}}
	case "calculate_budget":
		return ToolResult{Tool: toolName, Status: "success", Data: map[string]interface{}{
			"estimated_total": 5400,
			"currency":        "USD",
			"confidence":      0.92,
		}}
	case "generate_itinerary":
		return ToolResult{Tool: toolName, Status: "success", Data: map[string]interface{}{
			"days": []string{"Arrival and coastal relaxation", "Culture and food route", "Checkout and transfer"},
		}}
	// Fitur create_payment dimatikan sementara — mock QRIS tidak dijalankan di workflow chat.
	// case "create_payment":
	//	return ToolResult{Tool: toolName, Status: "success", Data: map[string]interface{}{
	//		"method":      "QRIS",
	//		"external_id": "DOKU-" + uuid.NewString(),
	//		"expires_in":  "15m",
	//	}}
	case "send_whatsapp":
		return ToolResult{Tool: toolName, Status: "success", Data: map[string]interface{}{
			"delivered": true,
			"channel":   "whatsapp",
		}}
	default:
		return ToolResult{Tool: toolName, Status: "failed", Data: map[string]interface{}{"error": "unknown tool"}}
	}
}

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
		// Fitur create_payment dimatikan sementara agar AI tidak menyebut QRIS/pembayaran
		// sebelum booking sungguhan dibuat. Aktifkan kembali setelah integrasi payment siap.
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
			Content: "You are Vero Travel, an autonomous travel assistant. Answer in natural Indonesian. Recommend only from the provided published package catalog when packages are relevant. Mention exact package names so the UI can show matching cards. Explain concise reasoning and suggest the next booking step. Do not use Markdown formatting, bold markers, asterisks, headings, or decorative symbols. Use plain text and simple hyphen bullets only when a list is helpful.",
		},
	}
	if catalog := packageCatalogSummary(packages); catalog != "" {
		messages = append(messages, ai.Message{Role: "system", Content: catalog})
	}
	session, err := s.repo.FindChatSession(sessionID)
	if err == nil && session.MemorySummary != "" {
		messages = append(messages, ai.Message{Role: "system", Content: "Conversation memory summary: " + session.MemorySummary})
	}
	recent, _ := s.repo.ListRecentChatMessages(sessionID, s.cfg.AIRecentMessages)
	for _, message := range recent {
		messages = append(messages, ai.Message{Role: message.Role, Content: message.Content})
	}
	workflowJSON, _ := json.Marshal(workflow)
	messages = append(messages, ai.Message{
		Role:    "system",
		Content: "Latest travel workflow context: " + string(workflowJSON),
	})
	messages = append(messages, ai.Message{Role: "user", Content: prompt})

	return s.client.Generate(ctx, ai.CompletionRequest{
		Messages: messages,
	})
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
	messages, err := s.repo.ListChatMessages(sessionID)
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

type TripService struct {
	repo *repositories.Repository
	bus  *events.Bus
}

func (s *TripService) List(query dto.TripListQuery) ([]models.Trip, error) {
	return s.repo.ListTrips(query)
}
func (s *TripService) Find(id uuid.UUID) (models.Trip, error) { return s.repo.FindTrip(id) }
func (s *TripService) FindBySlugOrID(value string) (models.Trip, error) {
	return s.repo.FindTripBySlugOrID(value)
}
func (s *TripService) Create(req dto.TripRequest) (models.Trip, error) {
	trip := buildTripFromRequest(models.Trip{}, req)
	if trip.Slug == "" {
		trip.Slug = slugify(trip.Title)
	}
	if trip.Status == "published" {
		now := time.Now()
		trip.PublishedAt = &now
	}
	err := s.repo.CreateTrip(&trip)
	if err == nil && len(req.Itineraries) > 0 {
		err = s.repo.ReplaceTripItineraries(trip.ID, buildItineraries(req.Itineraries))
		if err == nil {
			trip, _ = s.repo.FindTrip(trip.ID)
		}
	}
	s.bus.Publish("trip_created", trip)
	return trip, err
}
func (s *TripService) Update(id uuid.UUID, req dto.TripRequest) (models.Trip, error) {
	trip, err := s.repo.FindTrip(id)
	if err != nil {
		return trip, err
	}
	trip = buildTripFromRequest(trip, req)
	if trip.Slug == "" {
		trip.Slug = slugify(trip.Title)
	}
	if trip.Status == "published" && trip.PublishedAt == nil {
		now := time.Now()
		trip.PublishedAt = &now
	}
	err = s.repo.UpdateTrip(&trip)
	if err == nil {
		err = s.repo.ReplaceTripItineraries(trip.ID, buildItineraries(req.Itineraries))
		if err == nil {
			trip, _ = s.repo.FindTrip(trip.ID)
		}
	}
	return trip, err
}
func (s *TripService) Delete(id uuid.UUID) error { return s.repo.DeleteTrip(id) }

func buildTripFromRequest(trip models.Trip, req dto.TripRequest) models.Trip {
	trip.Title = req.Title
	trip.Slug = req.Slug
	trip.Destination = firstNonEmpty(req.Destination, req.Location)
	trip.Location = firstNonEmpty(req.Location, req.Destination)
	trip.Category = normalize(req.Category, "international")
	trip.Status = normalize(req.Status, "draft")
	trip.Overview = firstNonEmpty(req.Overview, req.Summary)
	trip.Summary = firstNonEmpty(req.Summary, req.Overview)
	trip.Duration = req.Duration
	trip.AdultPax = req.AdultPax
	trip.ChildPax = req.ChildPax
	trip.EstimatedPrice = firstNonZero(req.EstimatedPrice, req.BasePrice)
	trip.BasePrice = firstNonZero(req.BasePrice, req.EstimatedPrice)
	trip.DiscountPrice = req.DiscountPrice
	trip.ChildPrice = req.ChildPrice
	trip.ChildDiscount = req.ChildDiscountPrice
	trip.DiscountEnabled = req.DiscountEnabled
	trip.ChildDiscountEnabled = req.ChildDiscountEnabled
	trip.ImageURL = req.ImageURL
	trip.Media = make([]models.TripMedia, 0, len(req.Media))
	for _, media := range req.Media {
		if media.URL == "" {
			continue
		}
		trip.Media = append(trip.Media, models.TripMedia{URL: media.URL, Type: firstNonEmpty(media.Type, "image"), AltText: media.AltText})
		if trip.ImageURL == "" {
			trip.ImageURL = media.URL
		}
	}
	trip.Highlights = req.Highlights
	trip.AmenitiesIncluded = req.AmenitiesIncluded
	trip.AmenitiesExcluded = req.AmenitiesExcluded
	trip.References = req.References
	trip.ScheduleType = firstNonEmpty(req.ScheduleType, "date_range")
	trip.PackageStartDate = parseDate(req.PackageStartDate)
	trip.PackageEndDate = parseDate(req.PackageEndDate)
	trip.PublishStartDate = parseDate(req.PublishStartDate)
	trip.PublishEndDate = parseDate(req.PublishEndDate)
	return trip
}

func buildItineraries(items []dto.ItineraryRequest) []models.Itinerary {
	itineraries := make([]models.Itinerary, 0, len(items))
	for index, item := range items {
		day := item.Day
		if day <= 0 {
			day = index + 1
		}
		if item.Title == "" && item.Description == "" {
			continue
		}
		itineraries = append(itineraries, models.Itinerary{
			Day:         day,
			Title:       firstNonEmpty(item.Title, fmt.Sprintf("Day %d", day)),
			Description: item.Description,
		})
	}
	return itineraries
}

func slugify(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	re := regexp.MustCompile(`[^a-z0-9]+`)
	value = strings.Trim(re.ReplaceAllString(value, "-"), "-")
	if value == "" {
		return uuid.NewString()
	}
	return value + "-" + uuid.NewString()[:8]
}

func normalize(value, fallback string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	if value == "" {
		return fallback
	}
	return value
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func firstNonZero(values ...float64) float64 {
	for _, value := range values {
		if value != 0 {
			return value
		}
	}
	return 0
}

func parseDate(value string) *time.Time {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	for _, layout := range []string{time.RFC3339, "2006-01-02"} {
		parsed, err := time.Parse(layout, value)
		if err == nil {
			return &parsed
		}
	}
	return nil
}

type BookingService struct {
	repo *repositories.Repository
	bus  *events.Bus
}

func (s *BookingService) Create(userID uuid.UUID, req dto.BookingRequest) (models.Booking, error) {
	booking := models.Booking{
		UserID:        userID,
		TripID:        req.TripID,
		BookingStatus: "pending",
		PaymentStatus: "waiting_payment",
		TotalPrice:    req.TotalPrice,
		BookingDate:   time.Now(),
	}
	err := s.repo.CreateBooking(&booking)
	s.bus.Publish("booking_created", booking)
	return booking, err
}
func (s *BookingService) List() ([]models.Booking, error)           { return s.repo.ListBookings() }
func (s *BookingService) Find(id uuid.UUID) (models.Booking, error) { return s.repo.FindBooking(id) }

type PaymentService struct {
	repo *repositories.Repository
	bus  *events.Bus
	cfg  config.Config
}

func (s *PaymentService) Create(req dto.PaymentCreateRequest) (models.Payment, error) {
	payment := models.Payment{
		BookingID:     req.BookingID,
		PaymentMethod: req.PaymentMethod,
		ExternalID:    "DOKU-" + uuid.NewString(),
		Amount:        req.Amount,
		Status:        "pending",
		ExpiredAt:     time.Now().Add(15 * time.Minute),
	}
	err := s.repo.CreatePayment(&payment)
	s.bus.Publish("payment_created", payment)
	return payment, err
}

func (s *PaymentService) Find(id uuid.UUID) (models.Payment, error) { return s.repo.FindPayment(id) }

func (s *PaymentService) Webhook(req dto.PaymentWebhookRequest) (models.Payment, error) {
	if s.cfg.DOKUSecret != "" && req.Signature != "" && !s.verifySignature(req.ExternalID+req.Status, req.Signature) {
		return models.Payment{}, errors.New("invalid payment signature")
	}
	payment, err := s.repo.FindPaymentByExternalID(req.ExternalID)
	if err != nil {
		return payment, err
	}
	payment.Status = strings.ToLower(req.Status)
	if err := s.repo.UpdatePayment(&payment); err != nil {
		return payment, err
	}
	s.bus.Publish("payment_updated", payment)
	if payment.Status == "paid" || payment.Status == "settlement" {
		s.bus.Publish("booking_confirmed", map[string]interface{}{"booking_id": payment.BookingID, "payment_id": payment.ID})
		s.triggerN8N("payment_success", map[string]interface{}{
			"booking_id":  payment.BookingID,
			"payment_id":  payment.ID,
			"external_id": payment.ExternalID,
			"amount":      payment.Amount,
			"status":      payment.Status,
		})
	}
	return payment, nil
}

func (s *PaymentService) verifySignature(message, signature string) bool {
	mac := hmac.New(sha256.New, []byte(s.cfg.DOKUSecret))
	_, _ = mac.Write([]byte(message))
	expected := hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(expected), []byte(signature))
}

func (s *PaymentService) triggerN8N(eventName string, payload map[string]interface{}) {
	if s.cfg.N8NWebhook == "" {
		return
	}
	body, err := json.Marshal(map[string]interface{}{
		"event":   eventName,
		"payload": payload,
	})
	if err != nil {
		return
	}
	req, err := http.NewRequest(http.MethodPost, s.cfg.N8NWebhook, bytes.NewReader(body))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	client := http.Client{Timeout: 5 * time.Second}
	_, _ = client.Do(req)
}

type LogService struct{ repo *repositories.Repository }

func (s *LogService) Logs() ([]models.AILog, error)         { return s.repo.ListAILogs() }
func (s *LogService) ToolCalls() ([]models.ToolCall, error) { return s.repo.ListToolCalls() }

type AnalyticsService struct{ repo *repositories.Repository }

func (s *AnalyticsService) Dashboard() (map[string]interface{}, error) {
	var totalBookings int64
	var totalRevenue float64
	var activeTrips int64
	var aiLogs int64
	var paidPayments int64
	var allPayments int64

	db := s.repo.DB
	db.Model(&models.Booking{}).Count(&totalBookings)
	db.Model(&models.Booking{}).Select("COALESCE(SUM(total_price), 0)").Scan(&totalRevenue)
	db.Model(&models.Trip{}).Count(&activeTrips)
	db.Model(&models.AILog{}).Count(&aiLogs)
	db.Model(&models.Payment{}).Count(&allPayments)
	db.Model(&models.Payment{}).Where("status IN ?", []string{"paid", "settlement", "verified"}).Count(&paidPayments)

	successRate := 0.0
	if allPayments > 0 {
		successRate = float64(paidPayments) / float64(allPayments) * 100
	}

	bookings, err := s.repo.ListBookings()
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	return map[string]interface{}{
		"total_bookings":       totalBookings,
		"total_revenue":        totalRevenue,
		"active_trips":         activeTrips,
		"ai_usage_stats":       aiLogs,
		"payment_success_rate": fmt.Sprintf("%.2f%%", successRate),
		"customer_activity":    bookings,
	}, nil
}
