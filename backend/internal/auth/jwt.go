package auth

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/config"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/models"
)

type Claims struct {
	UserID uuid.UUID   `json:"user_id"`
	Email  string      `json:"email"`
	Role   models.Role `json:"role"`
	jwt.RegisteredClaims
}

type JWTService struct {
	secret     []byte
	accessTTL  time.Duration
	refreshTTL time.Duration
}

func NewJWTService(cfg config.Config) *JWTService {
	return &JWTService{
		secret:     []byte(cfg.JWTSecret),
		accessTTL:  cfg.JWTAccessTTL,
		refreshTTL: cfg.JWTRefreshTTL,
	}
}

func (s *JWTService) Generate(user models.User) (access string, refresh string, expiresIn int64, err error) {
	access, err = s.sign(user, s.accessTTL, "access")
	if err != nil {
		return "", "", 0, err
	}
	refresh, err = s.sign(user, s.refreshTTL, "refresh")
	if err != nil {
		return "", "", 0, err
	}
	return access, refresh, int64(s.accessTTL.Seconds()), nil
}

func (s *JWTService) Parse(tokenString string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(_ *jwt.Token) (interface{}, error) {
		return s.secret, nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid token")
	}
	return claims, nil
}

func (s *JWTService) sign(user models.User, ttl time.Duration, tokenType string) (string, error) {
	now := time.Now()
	claims := Claims{
		UserID: user.ID,
		Email:  user.Email,
		Role:   user.Role,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    "vero-travel-api",
			Subject:   user.ID.String(),
			Audience:  []string{tokenType},
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
			ID:        uuid.NewString(),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(s.secret)
}
