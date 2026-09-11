package services

import (
	"crypto/sha256"
	"encoding/hex"
	"strings"

	"github.com/google/uuid"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/dto"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/models"
)

// Contact hashes keep guest-order limits after cookies rotate or disappear.
// Authenticated orders bypass anchors. Different contacts remain distinct until verified.
const (
	guestLimitReasonSessionSpent = "guest_session_spent"
	guestLimitReasonContactSpent = "contact_already_used"
)

type guestContactAnchor struct {
	Channel string
	Key     string
}

func guestContactAnchors(req dto.BookingRequest) []guestContactAnchor {
	anchors := make([]guestContactAnchor, 0, 2)
	if email := normalizeGuestContactEmail(req.ContactEmail); email != "" {
		anchors = append(anchors, guestContactAnchor{
			Channel: models.GuestContactChannelEmail,
			Key:     hashGuestContact(models.GuestContactChannelEmail, email),
		})
	}
	if phone := normalizeGuestContactPhone(req.ContactPhone); phone != "" {
		anchors = append(anchors, guestContactAnchor{
			Channel: models.GuestContactChannelPhone,
			Key:     hashGuestContact(models.GuestContactChannelPhone, phone),
		})
	}
	return anchors
}

func guestContactKeys(anchors []guestContactAnchor) []string {
	keys := make([]string, 0, len(anchors))
	for _, anchor := range anchors {
		keys = append(keys, anchor.Key)
	}
	return keys
}

func guestOrderEntitlements(anchors []guestContactAnchor, guestID, bookingID uuid.UUID) []models.GuestOrderEntitlement {
	owner := guestID
	rows := make([]models.GuestOrderEntitlement, 0, len(anchors))
	for _, anchor := range anchors {
		rows = append(rows, models.GuestOrderEntitlement{
			ContactKey:     anchor.Key,
			Channel:        anchor.Channel,
			GuestSessionID: &owner,
			BookingID:      bookingID,
		})
	}
	return rows
}

func hashGuestContact(channel, normalized string) string {
	sum := sha256.Sum256([]byte(channel + ":" + normalized))
	return hex.EncodeToString(sum[:])
}

// Preserve dots because dot aliases are provider-specific.
func normalizeGuestContactEmail(raw string) string {
	value := strings.ToLower(strings.TrimSpace(raw))
	at := strings.LastIndex(value, "@")
	if at <= 0 || at == len(value)-1 {
		return ""
	}
	local, domain := value[:at], value[at+1:]
	if plus := strings.Index(local, "+"); plus > 0 {
		local = local[:plus]
	}
	if local == "" {
		return ""
	}
	return local + "@" + domain
}

// Fold local Indonesian prefixes to country code 62. Foreign local formats may not match.
func normalizeGuestContactPhone(raw string) string {
	var digits strings.Builder
	for _, r := range raw {
		if r >= '0' && r <= '9' {
			digits.WriteRune(r)
		}
	}
	value := strings.TrimPrefix(digits.String(), "00")
	if strings.HasPrefix(value, "0") {
		trimmed := strings.TrimLeft(value, "0")
		if trimmed == "" {
			return ""
		}
		value = "62" + trimmed
	}
	return value
}
