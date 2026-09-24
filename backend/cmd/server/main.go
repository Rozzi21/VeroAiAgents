package main

import (
	"context"
	"errors"
	"log"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/auth"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/config"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/database"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/events"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/handlers"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/middlewares"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/repositories"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/routes"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/services"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/utils"
)

func main() {
	cfg := config.Load()
	if err := cfg.Validate(); err != nil {
		log.Fatalf("invalid configuration: %v", err)
	}

	var logHandler slog.Handler
	if cfg.AppEnv == "production" {
		logHandler = slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})
		gin.SetMode(gin.ReleaseMode)
	} else {
		logHandler = slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug})
	}
	slog.SetDefault(slog.New(utils.NewContextHandler(logHandler)))

	db, err := database.Connect(cfg)
	if err != nil {
		log.Fatalf("failed to connect database: %v", err)
	}
	defer func() {
		if err := db.Close(); err != nil {
			log.Printf("failed to close database: %v", err)
		}
	}()

	if err := db.AutoMigrate(); err != nil {
		log.Fatalf("failed to run migrations: %v", err)
	}

	repo := repositories.New(db.DB)
	bus := events.NewBus()
	jwtService := auth.NewJWTService(cfg)
	serviceContainer := services.New(cfg, repo, jwtService, bus)
	handler := handlers.New(serviceContainer, db)

	router := gin.New()
	// Limit multipart memory buffering for uploads
	router.MaxMultipartMemory = 8 << 20 // 8 MiB
	// Trust no proxy in dev, trust only configured proxies in production
	if cfg.AppEnv == "production" {
		if err := router.SetTrustedProxies(cfg.TrustedProxies); err != nil {
			log.Fatalf("invalid TRUSTED_PROXIES: %v", err)
		}
	} else {
		router.SetTrustedProxies(nil)
	}
	router.Use(
		middlewares.RequestID(),
		middlewares.ChatTelemetry(),
		middlewares.SecureHeaders(),
		middlewares.CORS(cfg.CORSAllowedOrigins),
		middlewares.RateLimit(),
		middlewares.Metrics(),
		middlewares.StructuredLogger(),
		middlewares.Recovery(),
	)
	router.Static("/uploads", "./uploads")
	routes.Register(router, handler, serviceContainer)
	startChatSessionCleanup(serviceContainer)

	server := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second, // Protect against slow-write attacks globally
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		log.Printf("vero-travel-api listening on :%s", cfg.Port)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("server failed: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := server.Shutdown(ctx); err != nil {
		log.Fatalf("server failed: %v", err)
	}
	// Stop accepting requests before draining detached work
	serviceContainer.StopAudit()
	log.Println("server stopped gracefully")
}

// startChatSessionCleanup invokes the cleanup use case on an hourly ticker.
// The service method is scheduler-agnostic, so a future cron/systemd/Kubernetes
// job can invoke the same operation.
func startChatSessionCleanup(s *services.Services) {
	interval := time.Hour
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for range ticker.C {
			runCtx, cancelRun := context.WithTimeout(context.Background(), 30*time.Second)
			deleted, err := s.AI.CleanupExpiredChatSessions(runCtx, time.Now())
			cancelRun()
			if err != nil {
				log.Printf("[chat-session-cleanup] failed: %v", err)
				continue
			}
			if deleted > 0 {
				log.Printf("[chat-session-cleanup] deleted=%d", deleted)
			}
		}
	}()
}
