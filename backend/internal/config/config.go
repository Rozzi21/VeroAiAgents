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

	JWTSecret       string
	JWTAccessTTL    time.Duration
	JWTRefreshTTL   time.Duration
	OpenClawAPIKey  string
	OpenClawBaseURL string
	DOKUClientID    string
	DOKUSecret      string
	N8NWebhook      string
}

func Load() Config {
	_ = godotenv.Load()

	accessMinutes := getInt("JWT_ACCESS_TTL_MINUTES", 60)
	refreshHours := getInt("JWT_REFRESH_TTL_HOURS", 720)

	cfg := Config{
		AppEnv:           getEnv("APP_ENV", "development"),
		Port:             getEnv("PORT", "8080"),
		DatabaseHost:     getEnv("DATABASE_HOST", "localhost"),
		DatabasePort:     getEnv("DATABASE_PORT", "5432"),
		DatabaseUser:     getEnv("DATABASE_USER", "vero_user"),
		DatabasePassword: getEnv("DATABASE_PASSWORD", ""),
		DatabaseName:     getEnv("DATABASE_NAME", "vero_travel"),
		DatabaseSSLMode:  getEnv("DATABASE_SSLMODE", "disable"),
		DatabaseURL:      os.Getenv("DATABASE_URL"),
		JWTSecret:        getEnv("JWT_SECRET", "super_secret_vero_travel"),
		JWTAccessTTL:     time.Duration(accessMinutes) * time.Minute,
		JWTRefreshTTL:    time.Duration(refreshHours) * time.Hour,
		OpenClawAPIKey:   os.Getenv("OPENCLAW_API_KEY"),
		OpenClawBaseURL:  os.Getenv("OPENCLAW_BASE_URL"),
		DOKUClientID:     os.Getenv("DOKU_CLIENT_ID"),
		DOKUSecret:       os.Getenv("DOKU_SECRET"),
		N8NWebhook:       os.Getenv("N8N_WEBHOOK"),
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
