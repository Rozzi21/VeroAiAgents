package middlewares

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/auth"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/models"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/utils"
	"golang.org/x/time/rate"
)

const (
	ContextUserID = "user_id"
	ContextRole   = "role"
	ContextEmail  = "email"
)

func CORS() gin.HandlerFunc {
	return cors.New(cors.Config{
		AllowOrigins:     []string{"http://localhost:3000", "http://localhost:3001", "http://localhost:5173"},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Authorization", "Content-Type", "X-Request-ID", "X-Doku-Signature"},
		ExposeHeaders:    []string{"Content-Length", "X-Request-ID"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	})
}

func RequestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		requestID := c.GetHeader("X-Request-ID")
		if requestID == "" {
			requestID = uuid.NewString()
		}
		c.Header("X-Request-ID", requestID)
		c.Set("request_id", requestID)
		c.Next()
	}
}

func SecureHeaders() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("X-Frame-Options", "DENY")
		c.Header("X-XSS-Protection", "0")
		c.Header("Referrer-Policy", "strict-origin-when-cross-origin")
		c.Next()
	}
}

func Recovery() gin.HandlerFunc {
	return gin.CustomRecovery(func(c *gin.Context, recovered interface{}) {
		utils.Error(c, http.StatusInternalServerError, "Unexpected server error", gin.H{
			"panic": recovered,
		})
	})
}

func RateLimit() gin.HandlerFunc {
	limiter := rate.NewLimiter(rate.Every(time.Second), 20)
	return func(c *gin.Context) {
		if !limiter.Allow() {
			utils.Error(c, http.StatusTooManyRequests, "Too many requests", gin.H{})
			c.Abort()
			return
		}
		c.Next()
	}
}

func Auth(jwtService *auth.JWTService) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if header == "" || !strings.HasPrefix(header, "Bearer ") {
			utils.Unauthorized(c, "Missing bearer token")
			c.Abort()
			return
		}

		claims, err := jwtService.Parse(strings.TrimPrefix(header, "Bearer "))
		if err != nil {
			utils.Unauthorized(c, "Invalid or expired token")
			c.Abort()
			return
		}

		c.Set(ContextUserID, claims.UserID)
		c.Set(ContextRole, claims.Role)
		c.Set(ContextEmail, claims.Email)
		c.Next()
	}
}

func Role(allowed ...models.Role) gin.HandlerFunc {
	return func(c *gin.Context) {
		value, exists := c.Get(ContextRole)
		if !exists {
			utils.Forbidden(c, "Role required")
			c.Abort()
			return
		}
		role, ok := value.(models.Role)
		if !ok {
			utils.Forbidden(c, "Invalid role")
			c.Abort()
			return
		}
		for _, item := range allowed {
			if role == item {
				c.Next()
				return
			}
		}
		utils.Forbidden(c, "Insufficient permission")
		c.Abort()
	}
}
