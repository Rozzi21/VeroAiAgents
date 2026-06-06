package repositories

import (
	"time"

	"github.com/google/uuid"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/models"
	"gorm.io/gorm"
)

func (r *Repository) CreateAuthSession(userID uuid.UUID, tokenJTI string, expiresAt time.Time) error {
	session := models.AuthSession{
		UserID:    userID,
		TokenJTI:  tokenJTI,
		ExpiresAt: expiresAt,
	}
	return r.DB.Create(&session).Error
}

func (r *Repository) FindActiveSessionByJTI(tokenJTI string) (models.AuthSession, error) {
	var session models.AuthSession
	err := r.DB.Where(
		"token_jti = ? AND revoked_at IS NULL AND expires_at > ?",
		tokenJTI,
		time.Now(),
	).First(&session).Error
	return session, err
}

func (r *Repository) FindSessionByJTI(tokenJTI string) (models.AuthSession, error) {
	var session models.AuthSession
	err := r.DB.Where("token_jti = ?", tokenJTI).First(&session).Error
	return session, err
}

func (r *Repository) RevokeSessionByJTI(tokenJTI string) error {
	now := time.Now()
	return r.DB.Model(&models.AuthSession{}).
		Where("token_jti = ? AND revoked_at IS NULL", tokenJTI).
		Update("revoked_at", now).Error
}

func (r *Repository) IsSessionRevoked(tokenJTI string) (bool, error) {
	var session models.AuthSession
	err := r.DB.Where("token_jti = ?", tokenJTI).First(&session).Error
	if err != nil {
		return false, err
	}
	return session.RevokedAt != nil, nil
}

func (r *Repository) RevokeSessionByJTIIfExists(tokenJTI string) error {
	result := r.DB.Model(&models.AuthSession{}).
		Where("token_jti = ? AND revoked_at IS NULL", tokenJTI).
		Update("revoked_at", time.Now())
	if result.Error != nil {
		return result.Error
	}
	return nil
}

func (r *Repository) CountActiveSessionsByJTI(tokenJTI string) (int64, error) {
	var count int64
	err := r.DB.Model(&models.AuthSession{}).
		Where("token_jti = ? AND revoked_at IS NULL AND expires_at > ?", tokenJTI, time.Now()).
		Count(&count).Error
	return count, err
}

// EnsureRevokeIsIdempotent allows logout on already-revoked sessions without error.
func (r *Repository) RevokeSessionByJTIAllowMissing(tokenJTI string) error {
	err := r.RevokeSessionByJTI(tokenJTI)
	if err == gorm.ErrRecordNotFound {
		return nil
	}
	return err
}
