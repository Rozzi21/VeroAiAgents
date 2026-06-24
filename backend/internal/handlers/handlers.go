package handlers

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/auth"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/config"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/database"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/dto"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/events"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/middlewares"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/services"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/utils"
)

type Handler struct {
	Services  *services.Services
	Database  *database.Database
	StartedAt time.Time
}

func New(s *services.Services, db *database.Database) *Handler {
	return &Handler{Services: s, Database: db, StartedAt: time.Now()}
}

func (h *Handler) Health(c *gin.Context) {
	utils.Success(c, http.StatusOK, "Service healthy", gin.H{
		"service": "vero-travel-api",
		"status":  "healthy",
		"uptime":  time.Since(h.StartedAt).String(),
	})
}

func (h *Handler) DatabaseHealth(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
	defer cancel()
	if err := h.Database.Health(ctx); err != nil {
		utils.Error(c, http.StatusServiceUnavailable, "Database disconnected", gin.H{"detail": err.Error()})
		return
	}
	utils.Success(c, http.StatusOK, "Database connected", gin.H{"database": "connected"})
}

func (h *Handler) Register(c *gin.Context) {
	var req dto.RegisterRequest
	if !bind(c, &req) {
		return
	}
	result, err := h.Services.Auth.Register(req, authRequestMeta(c))
	if err != nil {
		utils.BadRequest(c, "Registration failed", gin.H{"detail": err.Error()})
		return
	}
	respondAuthIssue(c, h.Services.Config, http.StatusCreated, "Registered", result)
}

func (h *Handler) Login(c *gin.Context) {
	var req dto.LoginRequest
	if !bind(c, &req) {
		return
	}
	result, err := h.Services.Auth.Login(req, authRequestMeta(c))
	if err != nil {
		utils.Unauthorized(c, err.Error())
		return
	}
	respondAuthIssue(c, h.Services.Config, http.StatusOK, "Logged in", result)
}

func (h *Handler) Refresh(c *gin.Context) {
	refreshToken := auth.GetRefreshCookie(c, h.Services.Config)
	result, err := h.Services.Auth.Refresh(refreshToken, authRequestMeta(c))
	if err != nil {
		message := "Invalid refresh token"
		if errors.Is(err, services.ErrRefreshTokenRevoked) {
			message = "Refresh token revoked"
		}
		utils.Unauthorized(c, message)
		return
	}
	result.Response.User = nil
	respondAuthIssue(c, h.Services.Config, http.StatusOK, "Token refreshed", result)
}

func (h *Handler) Logout(c *gin.Context) {
	refreshToken := auth.GetRefreshCookie(c, h.Services.Config)
	_ = h.Services.Auth.Logout(refreshToken, authRequestMeta(c))
	auth.ClearRefreshCookie(c, h.Services.Config)
	utils.Success(c, http.StatusOK, "Logged out", gin.H{})
}

func (h *Handler) Me(c *gin.Context) {
	user, err := h.Services.Auth.Me(currentUserID(c))
	if err != nil {
		utils.NotFound(c, "User not found")
		return
	}
	utils.Success(c, http.StatusOK, "Current user", user)
}

func (h *Handler) Chat(c *gin.Context) {
	var req dto.ChatRequest
	if !bind(c, &req) {
		return
	}
	res, err := h.Services.AI.Chat(currentUserID(c), req)
	if err != nil {
		utils.ServerError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "AI workflow completed", res)
}

func (h *Handler) GuestChat(c *gin.Context) {
	var req dto.ChatRequest
	if !bind(c, &req) {
		return
	}
	user, err := h.Services.Auth.GuestUser()
	if err != nil {
		utils.ServerError(c, err)
		return
	}
	res, err := h.Services.AI.Chat(user.ID, req)
	if err != nil {
		utils.ServerError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "AI workflow completed", res)
}

func (h *Handler) ChatSessions(c *gin.Context) {
	sessions, err := h.Services.Repo.ListChatSessions(currentUserID(c))
	if err != nil {
		utils.ServerError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "Chat sessions", sessions)
}

func (h *Handler) ChatMessages(c *gin.Context) {
	id, ok := parseID(c, "id")
	if !ok {
		return
	}
	messages, err := h.Services.Repo.ListChatMessages(id)
	if err != nil {
		utils.ServerError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "Chat messages", messages)
}

func (h *Handler) ListTrips(c *gin.Context) {
	var query dto.TripListQuery
	_ = c.ShouldBindQuery(&query)
	trips, err := h.Services.Trips.List(query)
	if err != nil {
		utils.ServerError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "Trips", trips)
}

func (h *Handler) PublicPackages(c *gin.Context) {
	var query dto.TripListQuery
	_ = c.ShouldBindQuery(&query)
	query.PublishedOnly = true
	trips, err := h.Services.Trips.List(query)
	if err != nil {
		utils.ServerError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "Packages", trips)
}

func (h *Handler) GetPackage(c *gin.Context) {
	trip, err := h.Services.Trips.FindBySlugOrID(c.Param("id"))
	if err != nil || trip.Status != "published" {
		utils.NotFound(c, "Package not found")
		return
	}
	utils.Success(c, http.StatusOK, "Package", trip)
}

func (h *Handler) GetTrip(c *gin.Context) {
	id, ok := parseID(c, "id")
	if !ok {
		return
	}
	trip, err := h.Services.Trips.Find(id)
	if err != nil {
		utils.NotFound(c, "Trip not found")
		return
	}
	utils.Success(c, http.StatusOK, "Trip", trip)
}

func (h *Handler) CreateTrip(c *gin.Context) {
	var req dto.TripRequest
	if !bind(c, &req) {
		return
	}
	trip, err := h.Services.Trips.Create(req)
	if err != nil {
		utils.ServerError(c, err)
		return
	}
	utils.Success(c, http.StatusCreated, "Trip created", trip)
}

func (h *Handler) UpdateTrip(c *gin.Context) {
	id, ok := parseID(c, "id")
	if !ok {
		return
	}
	var req dto.TripRequest
	if !bind(c, &req) {
		return
	}
	trip, err := h.Services.Trips.Update(id, req)
	if err != nil {
		utils.NotFound(c, "Trip not found")
		return
	}
	utils.Success(c, http.StatusOK, "Trip updated", trip)
}

func (h *Handler) DeleteTrip(c *gin.Context) {
	id, ok := parseID(c, "id")
	if !ok {
		return
	}
	if err := h.Services.Trips.Delete(id); err != nil {
		utils.ServerError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "Trip deleted", gin.H{"id": id})
}

func (h *Handler) CreateBooking(c *gin.Context) {
	var req dto.BookingRequest
	if !bind(c, &req) {
		return
	}
	booking, err := h.Services.Bookings.Create(currentUserID(c), req)
	if err != nil {
		utils.ServerError(c, err)
		return
	}
	utils.Success(c, http.StatusCreated, "Booking created", booking)
}

func (h *Handler) ListBookings(c *gin.Context) {
	var query dto.ListQuery
	_ = c.ShouldBindQuery(&query)
	query.Normalize()
	bookings, err := h.Services.Bookings.List(query)
	if err != nil {
		utils.ServerError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "Bookings", bookings)
}

func (h *Handler) GetBooking(c *gin.Context) {
	id, ok := parseID(c, "id")
	if !ok {
		return
	}
	booking, err := h.Services.Bookings.Find(id)
	if err != nil {
		utils.NotFound(c, "Booking not found")
		return
	}
	utils.Success(c, http.StatusOK, "Booking", booking)
}

func (h *Handler) CreatePayment(c *gin.Context) {
	var req dto.PaymentCreateRequest
	if !bind(c, &req) {
		return
	}
	payment, err := h.Services.Payments.Create(req)
	if err != nil {
		utils.ServerError(c, err)
		return
	}
	utils.Success(c, http.StatusCreated, "Payment created", payment)
}

func (h *Handler) PaymentWebhook(c *gin.Context) {
	var req dto.PaymentWebhookRequest
	if !bind(c, &req) {
		return
	}
	if req.Signature == "" {
		req.Signature = c.GetHeader("X-Doku-Signature")
	}
	payment, err := h.Services.Payments.Webhook(req)
	if err != nil {
		utils.BadRequest(c, "Webhook failed", gin.H{"detail": err.Error()})
		return
	}
	utils.Success(c, http.StatusOK, "Payment updated", payment)
}

func (h *Handler) GetPayment(c *gin.Context) {
	id, ok := parseID(c, "id")
	if !ok {
		return
	}
	payment, err := h.Services.Payments.Find(id)
	if err != nil {
		utils.NotFound(c, "Payment not found")
		return
	}
	utils.Success(c, http.StatusOK, "Payment", payment)
}

func (h *Handler) Logs(c *gin.Context) {
	var query dto.ListQuery
	_ = c.ShouldBindQuery(&query)
	query.Normalize()
	logs, err := h.Services.Logs.Logs(query)
	if err != nil {
		utils.ServerError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "AI logs", logs)
}

func (h *Handler) WorkflowLogs(c *gin.Context) {
	h.Logs(c)
}

func (h *Handler) ToolCalls(c *gin.Context) {
	var query dto.ListQuery
	_ = c.ShouldBindQuery(&query)
	query.Normalize()
	calls, err := h.Services.Logs.ToolCalls(query)
	if err != nil {
		utils.ServerError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "Tool calls", calls)
}

func (h *Handler) Analytics(c *gin.Context) {
	data, err := h.Services.Analytics.Dashboard()
	if err != nil {
		utils.ServerError(c, err)
		return
	}
	utils.Success(c, http.StatusOK, "Analytics dashboard", data)
}

func (h *Handler) UploadTripMedia(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		utils.BadRequest(c, "Upload failed", gin.H{"detail": err.Error()})
		return
	}

	ext := strings.ToLower(filepath.Ext(file.Filename))
	allowed := map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".webp": true, ".gif": true}
	if !allowed[ext] {
		utils.BadRequest(c, "Unsupported media type", gin.H{"extension": ext})
		return
	}

	dir := filepath.Join("uploads", "trips")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		utils.ServerError(c, err)
		return
	}
	filename := uuid.NewString() + ext
	path := filepath.Join(dir, filename)
	if err := c.SaveUploadedFile(file, path); err != nil {
		utils.ServerError(c, err)
		return
	}

	utils.Success(c, http.StatusCreated, "Media uploaded", dto.UploadResponse{
		URL:      "/" + filepath.ToSlash(path),
		Filename: filename,
		Size:     file.Size,
	})
}

func (h *Handler) EventStream(c *gin.Context) {
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")

	client := h.Services.Events.Subscribe()
	defer h.Services.Events.Unsubscribe(client)

	c.Stream(func(w io.Writer) bool {
		select {
		case event := <-client:
			c.SSEvent(event.Type, event)
			return true
		case <-c.Request.Context().Done():
			return false
		case <-time.After(25 * time.Second):
			c.SSEvent("heartbeat", events.Event{ID: uuid.NewString(), Type: "heartbeat", CreatedAt: time.Now()})
			return true
		}
	})
}

func authRequestMeta(c *gin.Context) services.AuthRequestMeta {
	requestID, _ := c.Get("request_id")
	id, _ := requestID.(string)
	return services.AuthRequestMeta{
		IP:        c.ClientIP(),
		UserAgent: c.GetHeader("User-Agent"),
		RequestID: id,
	}
}

func respondAuthIssue(c *gin.Context, cfg config.Config, status int, message string, result services.AuthIssueResult) {
	maxAge := int(cfg.JWTRefreshTTL.Seconds())
	auth.SetRefreshCookie(c, cfg, result.RefreshToken, maxAge)
	utils.Success(c, status, message, result.Response)
}

func bind(c *gin.Context, target interface{}) bool {
	if err := c.ShouldBindJSON(target); err != nil {
		utils.BadRequest(c, "Validation failed", gin.H{"detail": err.Error()})
		return false
	}
	return true
}

func parseID(c *gin.Context, key string) (uuid.UUID, bool) {
	id, err := uuid.Parse(c.Param(key))
	if err != nil {
		utils.BadRequest(c, fmt.Sprintf("Invalid %s", key), gin.H{"detail": err.Error()})
		return uuid.Nil, false
	}
	return id, true
}

func currentUserID(c *gin.Context) uuid.UUID {
	value, exists := c.Get(middlewares.ContextUserID)
	if !exists {
		return uuid.Nil
	}
	id, ok := value.(uuid.UUID)
	if !ok {
		return uuid.Nil
	}
	return id
}
