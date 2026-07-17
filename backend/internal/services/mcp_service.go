package services

import (
	"encoding/json"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/auth"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/dto"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/events"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/models"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/repositories"
)

type MCPService struct {
	repo     *repositories.Repository
	bus      *events.Bus
	bookings *BookingService
	auth     *AuthService
}

type ToolResult struct {
	Tool   string                 `json:"tool"`
	Status string                 `json:"status"`
	Data   map[string]interface{} `json:"data"`
}

func (s *MCPService) Execute(sessionID uuid.UUID, toolName string, payload map[string]interface{}) (ToolResult, error) {
	start := time.Now()
	var result ToolResult
	log.Printf("[mcp] tool selected session=%s tool=%s payload=%+v", sessionID, toolName, payload)
	switch toolName {
	case "create_payment":
		// DOKU/payment tools are temporarily disabled. Keep the tool name blocked
		// here as a defense-in-depth guard even if a caller bypasses AIService.Chat.
		result = ToolResult{Tool: toolName, Status: "failed", Data: map[string]interface{}{"error": "payment tools are temporarily disabled"}}
	case "create_booking", "create_order":
		// Execute actual booking logic
		result = s.executeCreateBooking(payload)
	case "update_order_draft":
		result = ToolResult{Tool: toolName, Status: "success", Data: map[string]interface{}{
			"success": true,
			"draft":   payload,
		}}
	default:
		for attempt := 1; attempt <= 3; attempt++ {
			result = s.mock(toolName, payload)
			if result.Status == "success" {
				break
			}
			time.Sleep(time.Duration(attempt) * 100 * time.Millisecond)
		}
	}
	log.Printf("[mcp] tool executed session=%s tool=%s status=%s duration_ms=%d", sessionID, toolName, result.Status, time.Since(start).Milliseconds())

	payloadJSON, _ := json.Marshal(payload)
	resultJSON, _ := json.Marshal(result)
	toolCall := models.ToolCall{
		SessionID: sessionID,
		ToolName:  toolName,
		Payload:   string(payloadJSON),
		Result:    string(resultJSON),
		Status:    result.Status,
	}
	aiLog := models.AILog{
		SessionID:     &sessionID,
		Workflow:      "mcp_tool_execution",
		ToolName:      toolName,
		Status:        result.Status,
		ExecutionTime: time.Since(start).Milliseconds(),
		Response:      string(resultJSON),
	}
	// Persist tool call + AI log asynchronously to avoid blocking the chat
	// workflow with ~8 synchronous DB writes per request. Errors are logged to
	// the audit log and retried once to prevent silent data loss.
	go func() {
		if err := s.repo.CreateToolCall(&toolCall); err != nil {
			auth.LogSecurity("tool_call_persist_failed", map[string]any{
				"session_id": sessionID.String(),
				"tool_name":  toolName,
				"error":      err.Error(),
			})
			// Single retry in case of transient DB issue
			time.Sleep(500 * time.Millisecond)
			_ = s.repo.CreateToolCall(&toolCall)
		}
		if err := s.repo.CreateAILog(&aiLog); err != nil {
			auth.LogSecurity("ai_log_persist_failed", map[string]any{
				"session_id": sessionID.String(),
				"workflow":   "mcp_tool_execution",
				"tool_name":  toolName,
				"error":      err.Error(),
			})
			// Single retry in case of transient DB issue
			time.Sleep(500 * time.Millisecond)
			_ = s.repo.CreateAILog(&aiLog)
		}
	}()
	s.bus.Publish("mcp_tool_executed", result)
	return result, nil
}

func (s *MCPService) mock(toolName string, _ map[string]any) ToolResult {
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

func (s *MCPService) executeCreateBooking(payload map[string]interface{}) ToolResult {
	log.Printf("[mcp] create_booking called args=%+v", payload)
	// Get guest user
	guestUser, err := s.auth.GuestUser()
	if err != nil {
		log.Printf("[mcp] create_booking failed guest_user error=%v", err)
		return ToolResult{Tool: "create_booking", Status: "failed", Data: map[string]interface{}{"success": false, "error": err.Error()}}
	}

	tripIDStr, _ := payload["trip_id"].(string)
	tripID, err := uuid.Parse(tripIDStr)
	if err != nil {
		log.Printf("[mcp] create_booking failed invalid_trip_id trip_id=%q", tripIDStr)
		return ToolResult{Tool: "create_booking", Status: "failed", Data: map[string]interface{}{"success": false, "error": "invalid trip_id"}}
	}

	adultPax := 1
	if v, ok := payload["adult_pax"].(float64); ok {
		adultPax = int(v)
	} else if v, ok := payload["adult_pax"].(string); ok {
		adultPax = parseIntFallback(v, 1)
	}

	childPax := 0
	if v, ok := payload["child_pax"].(float64); ok {
		childPax = int(v)
	} else if v, ok := payload["child_pax"].(string); ok {
		childPax = parseIntFallback(v, 0)
	}

	req := dto.BookingRequest{
		TripID:       tripID,
		AdultPax:     adultPax,
		ChildPax:     childPax,
		ContactName:  getString(payload, "contact_name"),
		ContactEmail: getString(payload, "contact_email"),
		ContactPhone: getString(payload, "contact_phone"),
		TravelDate:   getString(payload, "travel_date"),
	}

	if req.ContactName == "" {
		req.ContactName = "Guest"
	}
	if req.ContactEmail == "" && req.ContactPhone == "" {
		log.Printf("[mcp] create_booking failed missing_contact trip_id=%s", tripID)
		return ToolResult{Tool: "create_booking", Status: "failed", Data: map[string]interface{}{"success": false, "error": "contact_email or contact_phone is required"}}
	}

	log.Printf("[mcp] create_booking saving trip_id=%s adult_pax=%d child_pax=%d contact_email=%q contact_phone=%q travel_date=%q", req.TripID, req.AdultPax, req.ChildPax, req.ContactEmail, req.ContactPhone, req.TravelDate)
	booking, err := s.bookings.Create(guestUser.ID, req)
	if err != nil {
		log.Printf("[mcp] create_booking save failed error=%v", err)
		return ToolResult{Tool: "create_booking", Status: "failed", Data: map[string]interface{}{"success": false, "error": err.Error()}}
	}
	log.Printf("[mcp] create_booking saved booking_id=%s status=%s payment_status=%s total=%.2f", booking.ID, booking.BookingStatus, booking.PaymentStatus, booking.TotalPrice)

	return ToolResult{Tool: "create_booking", Status: "success", Data: map[string]interface{}{
		"success":        true,
		"order_id":       booking.ID.String(),
		"status":         booking.BookingStatus,
		"booking_id":     booking.ID.String(),
		"booking_status": booking.BookingStatus,
		"payment_status": booking.PaymentStatus,
		"total_price":    booking.TotalPrice,
	}}
}

func getString(m map[string]interface{}, key string) string {
	if v, ok := m[key].(string); ok {
		return v
	}
	return ""
}

func parseIntFallback(v string, fallback int) int {
	return ParseIntFromString(v, fallback)
}
