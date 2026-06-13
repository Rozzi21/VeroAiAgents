package auth

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/config"
)

const refreshCookiePath = "/api/v1/auth"

func SetRefreshCookie(c *gin.Context, cfg config.Config, token string, maxAgeSeconds int) {
	sameSite := parseSameSite(cfg.JWTCookieSameSite)
	c.SetSameSite(sameSite)
	// Browsers reject SameSite=None cookies unless they are also marked Secure,
	// so force Secure in that case even if JWT_COOKIE_SECURE was left false.
	secure := cfg.JWTCookieSecure
	if sameSite == http.SameSiteNoneMode {
		secure = true
	}
	c.SetCookie(
		cfg.JWTCookieName,
		token,
		maxAgeSeconds,
		refreshCookiePath,
		"",
		secure,
		true,
	)
}

func ClearRefreshCookie(c *gin.Context, cfg config.Config) {
	c.SetSameSite(parseSameSite(cfg.JWTCookieSameSite))
	c.SetCookie(
		cfg.JWTCookieName,
		"",
		-1,
		refreshCookiePath,
		"",
		cfg.JWTCookieSecure,
		true,
	)
}

func GetRefreshCookie(c *gin.Context, cfg config.Config) string {
	token, err := c.Cookie(cfg.JWTCookieName)
	if err != nil {
		return ""
	}
	return token
}

func parseSameSite(value string) http.SameSite {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "lax":
		return http.SameSiteLaxMode
	case "none":
		return http.SameSiteNoneMode
	default:
		return http.SameSiteStrictMode
	}
}
