package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	AppEnv string
	Port   string

	DatabaseHost     string
	DatabasePort     string
	DatabaseUser     string
	DatabasePassword string
	DatabaseName     string
	DatabaseSSLMode  string
	DatabaseURL      string

	JWTSecret            string
	JWTAccessTTL         time.Duration
	JWTRefreshTTL        time.Duration
	JWTCookieName        string
	JWTCookieSecure      bool
	JWTCookieSameSite    string
	AIAPIKey             string
	AIBaseURL            string
	AIModel              string
	AITemperature        float64
	AITimeout            time.Duration
	AIRecentMessages     int
	AIMemorySummaryAfter int
	AIMemoryMaxChars     int
	OpenClawAPIKey       string
	OpenClawBaseURL      string
	DOKUClientID         string
	DOKUSecret           string
	N8NWebhook           string
}

func Load() Config {
	_ = godotenv.Load()

	accessMinutes := getInt("JWT_ACCESS_TTL_MINUTES", 60)
	refreshHours := getInt("JWT_REFRESH_TTL_HOURS", 720)
	aiTimeoutSeconds := getInt("AI_TIMEOUT_SECONDS", 35)

	cfg := Config{
		AppEnv:               getEnv("APP_ENV", "development"),
		Port:                 getEnv("PORT", "8080"),
		DatabaseHost:         getEnv("DATABASE_HOST", "localhost"),
		DatabasePort:         getEnv("DATABASE_PORT", "5432"),
		DatabaseUser:         getEnv("DATABASE_USER", "vero_user"),
		DatabasePassword:     getEnv("DATABASE_PASSWORD", ""),
		DatabaseName:         getEnv("DATABASE_NAME", "vero_travel"),
		DatabaseSSLMode:      getEnv("DATABASE_SSLMODE", "disable"),
		DatabaseURL:          os.Getenv("DATABASE_URL"),
		JWTSecret:            getEnv("JWT_SECRET", "super_secret_vero_travel"),
		JWTAccessTTL:         time.Duration(accessMinutes) * time.Minute,
		JWTRefreshTTL:        time.Duration(refreshHours) * time.Hour,
		JWTCookieName:        getEnv("JWT_COOKIE_NAME", "refresh_token"),
		JWTCookieSecure:      getBoolEnv("JWT_COOKIE_SECURE", getEnv("APP_ENV", "development") == "production"),
		JWTCookieSameSite:    getEnv("JWT_COOKIE_SAME_SITE", "Strict"),
		AIAPIKey:             os.Getenv("AI_API_KEY"),
		AIBaseURL:            getEnv("AI_BASE_URL", "https://api.openai.com/v1"),
		AIModel:              getEnv("AI_MODEL", "gpt-4o-mini"),
		AITemperature:        getFloat("AI_TEMPERATURE", 0.4),
		AITimeout:            time.Duration(aiTimeoutSeconds) * time.Second,
		AIRecentMessages:     getInt("AI_CONTEXT_RECENT_MESSAGES", 8),
		AIMemorySummaryAfter: getInt("AI_MEMORY_SUMMARY_AFTER", 12),
		AIMemoryMaxChars:     getInt("AI_MEMORY_MAX_CHARS", 1800),
		OpenClawAPIKey:       os.Getenv("OPENCLAW_API_KEY"),
		OpenClawBaseURL:      os.Getenv("OPENCLAW_BASE_URL"),
		DOKUClientID:         os.Getenv("DOKU_CLIENT_ID"),
		DOKUSecret:           os.Getenv("DOKU_SECRET"),
		N8NWebhook:           os.Getenv("N8N_WEBHOOK"),
	}

	if cfg.DatabaseURL == "" || strings.Contains(cfg.DatabaseURL, "YOUR_PASSWORD") {
		cfg.DatabaseURL = fmt.Sprintf(
			"host=%s user=%s password=%s dbname=%s port=%s sslmode=%s",
			cfg.DatabaseHost,
			cfg.DatabaseUser,
			cfg.DatabasePassword,
			cfg.DatabaseName,
			cfg.DatabasePort,
			cfg.DatabaseSSLMode,
		)
	}

	return cfg
}

func getEnv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func getInt(key string, fallback int) int {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func getFloat(key string, fallback float64) float64 {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return fallback
	}
	return parsed
}

func getBoolEnv(key string, fallback bool) bool {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return fallback
	}
	return parsed
}
