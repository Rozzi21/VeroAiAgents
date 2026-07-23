package services

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/config"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/dto"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/events"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/models"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/repositories"
)

type PaymentService struct {
	repo *repositories.Repository
	bus  *events.Bus
	cfg  config.Config
}

func (s *PaymentService) Create(req dto.PaymentCreateRequest) (models.Payment, error) {
	if !s.cfg.PaymentsEnabled {
		return models.Payment{}, ErrPaymentsDisabled
	}

	// SEC-3: amount is derived from the booking's server-computed total, never
	// from the client request.
	booking, err := s.repo.FindBooking(req.BookingID)
	if err != nil {
		return models.Payment{}, errors.New("booking not found")
	}
	payment := models.Payment{
		BookingID:     req.BookingID,
		PaymentMethod: req.PaymentMethod,
		ExternalID:    "DOKU-" + uuid.NewString(),
		Amount:        booking.TotalPrice,
		Status:        "pending",
		ExpiredAt:     time.Now().Add(15 * time.Minute),
	}
	if err := s.repo.CreatePayment(&payment); err != nil {
		return payment, err
	}
	// SEC-18: publish only a minimal signal; the full payment (external_id,
	// amount) stays server-side.
	s.bus.Publish("payment_created", map[string]interface{}{"payment_id": payment.ID, "booking_id": payment.BookingID, "status": payment.Status})
	return payment, nil
}

// Find enforces ownership for non-staff callers (SEC-2 anti-IDOR).
func (s *PaymentService) Find(id, userID uuid.UUID, isStaff bool) (models.Payment, error) {
	if !s.cfg.PaymentsEnabled {
		return models.Payment{}, ErrPaymentsDisabled
	}

	if isStaff {
		return s.repo.FindPayment(id)
	}
	return s.repo.FindPaymentForUser(id, userID)
}

func (s *PaymentService) Webhook(req dto.PaymentWebhookRequest) (models.Payment, error) {
	if !s.cfg.PaymentsEnabled {
		return models.Payment{}, ErrPaymentsDisabled
	}

	// SEC-4: require a valid HMAC signature whenever a secret is configured.
	// Without a configured secret the webhook is only accepted outside
	// production (Config.Validate enforces DOKU_SECRET in production).
	if s.cfg.DOKUSecret != "" {
		if req.Signature == "" || !s.verifySignature(req.ExternalID+req.Status, req.Signature) {
			return models.Payment{}, errors.New("invalid payment signature")
		}
	} else if s.cfg.AppEnv == "production" {
		return models.Payment{}, errors.New("payment webhook secret not configured")
	}

	payment, err := s.repo.FindPaymentByExternalID(req.ExternalID)
	if err != nil {
		return payment, err
	}

	// SEC-4: validate the reported amount against the stored payment if present.
	if req.Amount != nil && *req.Amount != payment.Amount {
		return models.Payment{}, errors.New("payment amount mismatch")
	}

	// SEC-4 idempotency: never downgrade an already-settled payment, and skip
	// re-processing when the status is unchanged (prevents replay re-triggers).
	newStatus := strings.ToLower(req.Status)
	if payment.Status == "paid" || payment.Status == "settlement" {
		if newStatus != "paid" && newStatus != "settlement" {
			return models.Payment{}, errors.New("payment already settled")
		}
		if newStatus == payment.Status {
			return payment, nil
		}
	}

	payment.Status = newStatus
	if err := s.repo.UpdatePayment(&payment); err != nil {
		return payment, err
	}
	// SEC-18: minimal status payload only.
	s.bus.Publish("payment_updated", map[string]interface{}{"payment_id": payment.ID, "booking_id": payment.BookingID, "status": payment.Status})
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
