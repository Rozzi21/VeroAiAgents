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
	s.Auth = &AuthService{repo: repo, jwt: jwt}
	s.MCP = &MCPService{repo: repo, bus: bus}
	openClaw := ai.NewOpenClawClient(cfg.OpenClawAPIKey, cfg.OpenClawBaseURL)
	s.AI = &AIService{repo: repo, mcp: s.MCP, bus: bus, openClaw: openClaw}
	s.Trips = &TripService{repo: repo, bus: bus}
	s.Bookings = &BookingService{repo: repo, bus: bus}
	s.Payments = &PaymentService{repo: repo, bus: bus, cfg: cfg}
	s.Logs = &LogService{repo: repo}
	s.Analytics = &AnalyticsService{repo: repo}
	return s
}

type AuthService struct {
	repo *repositories.Repository
	jwt  *auth.JWTService
}

func (s *AuthService) Register(req dto.RegisterRequest) (dto.AuthResponse, error) {
	role := models.RoleUser
	if req.Role == string(models.RoleOperator) || req.Role == string(models.RoleAdmin) {
		role = models.Role(req.Role)
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return dto.AuthResponse{}, err
	}
	user := models.User{Name: req.Name, Email: strings.ToLower(req.Email), Password: string(hash), Role: role}
	if err := s.repo.CreateUser(&user); err != nil {
		return dto.AuthResponse{}, err
	}
	return s.issue(user)
}

func (s *AuthService) Login(req dto.LoginRequest) (dto.AuthResponse, error) {
	user, err := s.repo.FindUserByEmail(strings.ToLower(req.Email))
	if err != nil {
		return dto.AuthResponse{}, errors.New("invalid email or password")
	}
	if bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password)) != nil {
		return dto.AuthResponse{}, errors.New("invalid email or password")
	}
	return s.issue(user)
}

func (s *AuthService) Refresh(refreshToken string) (dto.AuthResponse, error) {
	claims, err := s.jwt.Parse(refreshToken)
	if err != nil {
		return dto.AuthResponse{}, err
	}
	user, err := s.repo.FindUserByID(claims.UserID)
	if err != nil {
		return dto.AuthResponse{}, err
	}
	return s.issue(user)
}

func (s *AuthService) Me(userID uuid.UUID) (models.User, error) {
	return s.repo.FindUserByID(userID)
}

func (s *AuthService) issue(user models.User) (dto.AuthResponse, error) {
	access, refresh, expiresIn, err := s.jwt.Generate(user)
	if err != nil {
		return dto.AuthResponse{}, err
	}
	return dto.AuthResponse{
		AccessToken:  access,
		RefreshToken: refresh,
		TokenType:    "Bearer",
		ExpiresIn:    expiresIn,
		User:         user,
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
	case "create_payment":
		return ToolResult{Tool: toolName, Status: "success", Data: map[string]interface{}{
			"method":      "QRIS",
			"external_id": "DOKU-" + uuid.NewString(),
			"expires_in":  "15m",
		}}
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
	repo     *repositories.Repository
	mcp      *MCPService
	bus      *events.Bus
	openClaw *ai.OpenClawClient
}

type ChatResult struct {
	SessionID uuid.UUID    `json:"session_id"`
	Message   string       `json:"message"`
	Workflow  []ToolResult `json:"workflow"`
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
		{"payment_created", "create_payment"},
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

	response := "I found a premium autonomous travel plan with destination matches, hotel inventory, budget estimate, itinerary draft, and payment-ready workflow."
	openClawResponse, err := s.generateWithOpenClaw(req.Prompt, results)
	if err != nil {
		errorPayload, _ := json.Marshal(map[string]interface{}{
			"error": err.Error(),
			"mode":  "local_fallback",
		})
		_ = s.repo.CreateAILog(&models.AILog{
			SessionID: &sessionID,
			Workflow:  "openclaw_generation",
			Status:    "failed",
			Response:  string(errorPayload),
		})
	} else if openClawResponse.Text != "" {
		response = openClawResponse.Text
		payload, _ := json.Marshal(openClawResponse.Metadata)
		_ = s.repo.CreateAILog(&models.AILog{
			SessionID: &sessionID,
			Workflow:  "openclaw_generation",
			Status:    "success",
			Response:  string(payload),
		})
		s.bus.Publish("openclaw_response", map[string]interface{}{
			"session_id": sessionID,
			"status":     openClawResponse.RawStatus,
		})
	}
	if err := s.repo.AddChatMessage(&models.ChatMessage{SessionID: sessionID, Role: "assistant", Content: response}); err != nil {
		return ChatResult{}, err
	}
	s.bus.Publish("workflow_completed", map[string]interface{}{"session_id": sessionID, "message": response})

	return ChatResult{SessionID: sessionID, Message: response, Workflow: results}, nil
}

func (s *AIService) generateWithOpenClaw(prompt string, workflow []ToolResult) (ai.CompletionResponse, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 35*time.Second)
	defer cancel()

	return s.openClaw.Generate(ctx, ai.CompletionRequest{
		Prompt: prompt,
		Context: map[string]interface{}{
			"platform":      "Vero Travel Agents",
			"role":          "autonomous travel orchestration engine",
			"workflow":      workflow,
			"response_goal": "Return a polished travel assistant answer with recommended package, reasoning, budget notes, and next action.",
		},
	})
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

func (s *TripService) List() ([]models.Trip, error)           { return s.repo.ListTrips() }
func (s *TripService) Find(id uuid.UUID) (models.Trip, error) { return s.repo.FindTrip(id) }
func (s *TripService) Create(req dto.TripRequest) (models.Trip, error) {
	trip := models.Trip{
		Title:          req.Title,
		Destination:    req.Destination,
		Overview:       req.Overview,
		Duration:       req.Duration,
		EstimatedPrice: req.EstimatedPrice,
		ImageURL:       req.ImageURL,
	}
	err := s.repo.CreateTrip(&trip)
	s.bus.Publish("trip_created", trip)
	return trip, err
}
func (s *TripService) Update(id uuid.UUID, req dto.TripRequest) (models.Trip, error) {
	trip, err := s.repo.FindTrip(id)
	if err != nil {
		return trip, err
	}
	trip.Title = req.Title
	trip.Destination = req.Destination
	trip.Overview = req.Overview
	trip.Duration = req.Duration
	trip.EstimatedPrice = req.EstimatedPrice
	trip.ImageURL = req.ImageURL
	err = s.repo.UpdateTrip(&trip)
	return trip, err
}
func (s *TripService) Delete(id uuid.UUID) error { return s.repo.DeleteTrip(id) }

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
