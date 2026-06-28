package main

import (
	"context"
	"errors"
	"log"
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
)

func main() {
	cfg := config.Load()
	if err := cfg.Validate(); err != nil {
		log.Fatalf("invalid configuration: %v", err)
	}
	if cfg.AppEnv == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

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
	// Limit multipart memory buffering for uploads (SEC-5).
	router.MaxMultipartMemory = 8 << 20 // 8 MiB
	router.Use(
		middlewares.RequestID(),
		middlewares.SecureHeaders(),
		middlewares.CORS(cfg.CORSAllowedOrigins),
		middlewares.RateLimit(),
		gin.Logger(),
		middlewares.Recovery(),
	)
	router.Static("/uploads", "./uploads")
	routes.Register(router, handler, serviceContainer)

	server := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 0, // SSE responses need long-lived writes.
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
		log.Fatalf("server shutdown failed: %v", err)
	}
	log.Println("server stopped gracefully")
}
