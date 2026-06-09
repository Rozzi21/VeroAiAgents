package routes

import (
	"github.com/gin-gonic/gin"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/handlers"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/middlewares"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/models"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/services"
)

func Register(router *gin.Engine, h *handlers.Handler, s *services.Services) {
	router.GET("/health", h.Health)
	router.GET("/health/database", h.DatabaseHealth)
	router.GET("/openapi.json", h.OpenAPI)
	router.GET("/docs", h.ScalarDocs)

	api := router.Group("/api/v1")
	{
		api.GET("/packages", h.PublicPackages)
		api.GET("/packages/:id", h.GetPackage)
		api.POST("/chat", h.GuestChat)

		authGroup := api.Group("/auth")
		{
			authGroup.POST("/register", h.Register)
			authGroup.POST("/login", h.Login)
			authGroup.POST("/refresh", h.Refresh)
			authGroup.POST("/logout", h.Logout)
			authGroup.GET("/me", middlewares.Auth(s.JWT), h.Me)
		}

		api.GET("/events/stream", middlewares.Auth(s.JWT), h.EventStream)

		protected := api.Group("")
		protected.Use(middlewares.Auth(s.JWT))
		{
			protected.GET("/chat/sessions", h.ChatSessions)
			protected.GET("/chat/:id/messages", h.ChatMessages)

			protected.GET("/trips", h.ListTrips)
			protected.GET("/trips/:id", h.GetTrip)
			protected.POST("/trips", middlewares.Role(models.RoleOperator, models.RoleAdmin), h.CreateTrip)
			protected.PUT("/trips/:id", middlewares.Role(models.RoleOperator, models.RoleAdmin), h.UpdateTrip)

			admin := protected.Group("/admin")
			admin.Use(middlewares.Role(models.RoleOperator, models.RoleAdmin))
			{
				admin.GET("/packages", h.ListTrips)
				admin.POST("/packages", h.CreateTrip)
				admin.PUT("/packages/:id", h.UpdateTrip)
				admin.DELETE("/packages/:id", h.DeleteTrip)
				admin.POST("/uploads", h.UploadTripMedia)
				admin.GET("/dashboard", h.Analytics)
			}

			protected.DELETE("/trips/:id", middlewares.Role(models.RoleOperator, models.RoleAdmin), h.DeleteTrip)

			protected.POST("/bookings", h.CreateBooking)
			protected.GET("/bookings", middlewares.Role(models.RoleOperator, models.RoleAdmin), h.ListBookings)
			protected.GET("/bookings/:id", h.GetBooking)

			protected.POST("/payments/create", h.CreatePayment)
			protected.GET("/payments/:id", h.GetPayment)

			protected.GET("/logs", middlewares.Role(models.RoleOperator, models.RoleAdmin), h.Logs)
			protected.GET("/logs/workflows", middlewares.Role(models.RoleOperator, models.RoleAdmin), h.WorkflowLogs)
			protected.GET("/logs/tool-calls", middlewares.Role(models.RoleOperator, models.RoleAdmin), h.ToolCalls)
			protected.GET("/analytics/dashboard", middlewares.Role(models.RoleOperator, models.RoleAdmin), h.Analytics)
		}

		api.POST("/payments/webhook", h.PaymentWebhook)
	}
}
