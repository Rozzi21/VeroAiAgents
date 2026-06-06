package auth

import (
	"log/slog"
)

const (
	EventLoginSuccess             = "login_success"
	EventLoginFailed              = "login_failed"
	EventRefreshSuccess           = "refresh_success"
	EventRefreshFailed            = "refresh_failed"
	EventRefreshTokenRevoked      = "refresh_token_revoked"
	EventLogout                   = "logout"
	EventRefreshTokenUsedAsAccess = "refresh_token_used_as_access"
	EventAccessTokenUsedOnRefresh = "access_token_used_on_refresh"
)

func LogSecurity(event string, fields map[string]any) {
	args := []any{slog.String("security_event", event)}
	for key, value := range fields {
		args = append(args, slog.Any(key, value))
	}
	slog.Info("security_audit", args...)
}
