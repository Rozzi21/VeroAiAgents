package services

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/config"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/dto"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/events"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/models"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/repositories"
)

type PaymentService struct {
	repo PaymentRepository
	bus  *events.Bus
	cfg  config.Config
}

type PaymentRepository interface {
	repositories.PaymentRepository
	FindBooking(ctx context.Context, id uuid.UUID) (models.Booking, error)
}

// Sentinel errors for the payment domain. Callers (handlers, tests)
// must match these with errors.Is, never by comparing err.Error() strings.
var (
	ErrPaymentNotFound           = errors.New("payment not found")
	ErrBookingNotFoundForPayment = errors.New("booking not found")
	ErrMissingSignature          = errors.New("missing signature or timestamp")
	ErrInvalidTimestampFormat    = errors.New("invalid timestamp format")
	ErrWebhookTimestampExpired   = errors.New("webhook timestamp expired")
	ErrInvalidPaymentSignature   = errors.New("invalid payment signature")
	ErrWebhookSecretMissing      = errors.New("payment webhook secret not configured")
	ErrPaymentAmountMismatch     = errors.New("payment amount mismatch")
	ErrPaymentAlreadySettled     = errors.New("payment already settled")
)

func (s *PaymentService) Create(ctx context.Context, req dto.PaymentCreateRequest) (models.Payment, error) {
	if !s.cfg.PaymentsEnabled {
		return models.Payment{}, ErrPaymentsDisabled
	}

	// Amount is derived from the booking's server-computed total, never
	// from the client request.
	booking, err := s.repo.FindBooking(ctx, req.BookingID)
	if err != nil {
		return models.Payment{}, ErrBookingNotFoundForPayment
	}
	payment := models.Payment{
		BookingID:     req.BookingID,
		PaymentMethod: req.PaymentMethod,
		ExternalID:    "DOKU-" + uuid.NewString(),
		Amount:        booking.TotalPrice,
		Status:        models.PaymentStatusPending,
		ExpiredAt:     time.Now().Add(15 * time.Minute),
	}

	if err := s.repo.CreatePayment(ctx, &payment); err != nil {
		return payment, err
	}
	// Publish only minimal signal; full payment details stay server-side.
	s.bus.Publish("payment_created", map[string]interface{}{"payment_id": payment.ID, "booking_id": payment.BookingID, "status": payment.Status})
	return payment, nil
}

// Find enforces ownership for non-staff callers.
func (s *PaymentService) Find(ctx context.Context, id, userID uuid.UUID, isStaff bool) (models.Payment, error) {
	if !s.cfg.PaymentsEnabled {
		return models.Payment{}, ErrPaymentsDisabled
	}

	if isStaff {
		return s.repo.FindPayment(ctx, id)
	}
	return s.repo.FindPaymentForUser(ctx, id, userID)
}

func (s *PaymentService) Webhook(ctx context.Context, req dto.PaymentWebhookRequest) (models.Payment, error) {
	if !s.cfg.PaymentsEnabled {
		return models.Payment{}, ErrPaymentsDisabled
	}

	// Require a valid HMAC signature whenever a secret is configured.
	// Replay prevention: timestamp must be fresh (±5 min).
	if s.cfg.DOKUSecret != "" {
		if req.Signature == "" || req.Timestamp == "" {
			return models.Payment{}, ErrMissingSignature
		}

		timestamp, err := time.Parse(time.RFC3339, req.Timestamp)
		if err != nil {
			return models.Payment{}, ErrInvalidTimestampFormat
		}

		now := time.Now().UTC()
		if timestamp.Before(now.Add(-5*time.Minute)) || timestamp.After(now.Add(5*time.Minute)) {
			return models.Payment{}, ErrWebhookTimestampExpired
		}

		if !s.verifyDokuSignature(req.RawBody, req.Timestamp, req.Signature) {
			return models.Payment{}, ErrInvalidPaymentSignature
		}
	} else if s.cfg.AppEnv == "production" {
		return models.Payment{}, ErrWebhookSecretMissing
	}

	payment, err := s.repo.FindPaymentByExternalID(ctx, req.ExternalID)
	if err != nil {
		return payment, err
	}

	// The webhook-reported amount must match the stored payment.
	if req.Amount != nil && *req.Amount != payment.Amount {
		return models.Payment{}, ErrPaymentAmountMismatch
	}

	// Idempotency: never downgrade an already-settled payment, and skip
	// re-processing when the status is unchanged.
	newStatus := models.NormalizePaymentStatus(req.Status)
	if models.IsPaymentSuccess(payment.Status) {
		if !models.IsPaymentSuccess(newStatus) {
			return models.Payment{}, ErrPaymentAlreadySettled
		}
		if newStatus == payment.Status {
			return payment, nil
		}
	}

	// Atomic conditional status update avoiding read-modify-write race.
	updated, err := s.repo.UpdatePaymentStatusAtomic(ctx, payment.ID, payment.Status, newStatus)
	if err != nil {
		return payment, err
	}
	if !updated {
		// Status moved under us. Re-read fresh state for a final decision.
		fresh, fetchErr := s.repo.FindPaymentByExternalID(ctx, req.ExternalID)
		if fetchErr != nil {
			return models.Payment{}, fetchErr
		}
		payment = fresh
		if models.IsPaymentSuccess(payment.Status) && !models.IsPaymentSuccess(newStatus) {
			return models.Payment{}, ErrPaymentAlreadySettled
		}
		if payment.Status == newStatus {
			return payment, nil
		}
		// Concurrent change landed on a different non-conflicting status; fall
		// through and publish the actual persisted state.
	} else {
		payment.Status = newStatus
	}
	// Minimal status payload only.
	s.bus.Publish("payment_updated", map[string]interface{}{"payment_id": payment.ID, "booking_id": payment.BookingID, "status": payment.Status})
	if models.IsPaymentSuccess(payment.Status) {
		if payment.Status != newStatus && !models.IsPaymentSuccess(newStatus) {
			log.Printf("[payment] settled webhook finalized concurrent status=%s external_id=%s", payment.Status, payment.ExternalID)
		}

		s.bus.Publish("booking_confirmed", map[string]interface{}{"booking_id": payment.BookingID, "payment_id": payment.ID})
		s.triggerN8N(ctx, "payment_success", map[string]interface{}{
			"booking_id":  payment.BookingID,
			"payment_id":  payment.ID,
			"external_id": payment.ExternalID,
			"amount":      payment.Amount,
			"status":      payment.Status,
		})
	}
	return payment, nil
}

// verifyDokuSignature implements standard DOKU HMAC SHA-256 signature logic.
func (s *PaymentService) verifyDokuSignature(body []byte, timestamp string, signature string) bool {
	message := timestamp + "|" + string(body)
	mac := hmac.New(sha256.New, []byte(s.cfg.DOKUSecret))
	_, _ = mac.Write([]byte(message))
	expected := hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(expected), []byte(signature))
}

// The `ctx` parameter is intentionally unused (`_`): the N8N webhook is fired
// fire-and-forget AFTER the HTTP response, so it must outlive the request
// context. We instead detach to background with our own timeout.
func (s *PaymentService) triggerN8N(_ context.Context, eventName string, payload map[string]interface{}) {
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
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.cfg.N8NWebhook, bytes.NewReader(body))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	client := http.Client{Timeout: 5 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return
	}
	defer res.Body.Close()
	_, _ = io.Copy(io.Discard, res.Body)
}
