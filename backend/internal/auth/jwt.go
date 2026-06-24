package auth

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/config"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/models"
)

const (
	AudienceAccess  = "access"
	AudienceRefresh = "refresh"
)

var (
	ErrInvalidToken    = errors.New("invalid token")
	ErrInvalidAudience = errors.New("invalid token audience")
	ErrRefreshAsAccess = errors.New("refresh token cannot be used as access token")
	ErrAccessOnRefresh = errors.New("access token cannot be used as refresh token")
)

type Claims struct {
	UserID uuid.UUID   `json:"user_id"`
	Email  string      `json:"email"`
	Role   models.Role `json:"role"`
	jwt.RegisteredClaims
}

type TokenPair struct {
	AccessToken  string
	RefreshToken string
	RefreshJTI   string
	ExpiresIn    int64
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

func (s *JWTService) RefreshTTL() time.Duration {
	return s.refreshTTL
}

func (s *JWTService) Generate(user models.User) (TokenPair, error) {
	access, err := s.sign(user, s.accessTTL, AudienceAccess)
	if err != nil {
		return TokenPair{}, err
	}
	refresh, refreshJTI, err := s.signWithJTI(user, s.refreshTTL, AudienceRefresh)
	if err != nil {
		return TokenPair{}, err
	}
	return TokenPair{
		AccessToken:  access,
		RefreshToken: refresh,
		RefreshJTI:   refreshJTI,
		ExpiresIn:    int64(s.accessTTL.Seconds()),
	}, nil
}

func (s *JWTService) Parse(tokenString string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(_ *jwt.Token) (interface{}, error) {
		return s.secret, nil
	}, jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}))
	if err != nil {
		return nil, err
	}
	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, ErrInvalidToken
	}
	return claims, nil
}

func (s *JWTService) ParseWithAudience(tokenString, expectedAudience string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(_ *jwt.Token) (interface{}, error) {
		return s.secret, nil
	}, jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}), jwt.WithAudience(expectedAudience))
	if err != nil {
		return nil, err
	}
	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, ErrInvalidToken
	}
	if !IsAudience(claims, expectedAudience) {
		return nil, ErrInvalidAudience
	}
	return claims, nil
}

func IsAudience(claims *Claims, expectedAudience string) bool {
	for _, aud := range claims.Audience {
		if aud == expectedAudience {
			return true
		}
	}
	return false
}

func (s *JWTService) sign(user models.User, ttl time.Duration, tokenType string) (string, error) {
	token, _, err := s.signWithJTI(user, ttl, tokenType)
	return token, err
}

func (s *JWTService) signWithJTI(user models.User, ttl time.Duration, tokenType string) (string, string, error) {
	now := time.Now()
	jti := uuid.NewString()
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
			ID:        jti,
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString(s.secret)
	if err != nil {
		return "", "", err
	}
	return signed, jti, nil
}
