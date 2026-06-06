package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func (h *Handler) OpenAPI(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"openapi": "3.1.0",
		"info": gin.H{
			"title":       "Vero Travel Agents API",
			"version":     "1.0.0",
			"description": "AI-native autonomous travel orchestration API with chat, MCP tools, bookings, payments, analytics, and realtime SSE events.",
		},
		"servers": []gin.H{{"url": "http://localhost:8080", "description": "Local development"}},
		"components": gin.H{
			"securitySchemes": gin.H{
				"BearerAuth": gin.H{
					"type":         "http",
					"scheme":       "bearer",
					"bearerFormat": "JWT",
				},
			},
		},
		"security": []gin.H{{"BearerAuth": []string{}}},
		"paths": gin.H{
			"/health":                    gin.H{"get": operation("Health check", false)},
			"/health/database":           gin.H{"get": operation("Database health check", false)},
			"/api/v1/auth/register":      gin.H{"post": operation("Register user", false)},
			"/api/v1/auth/login":         gin.H{"post": operation("Login user", false)},
			"/api/v1/auth/refresh":       gin.H{"post": operation("Refresh JWT token via HttpOnly cookie", false)},
			"/api/v1/auth/logout":        gin.H{"post": operation("Logout and revoke refresh session", false)},
			"/api/v1/auth/me":            gin.H{"get": operation("Current user profile", true)},
			"/api/v1/chat":               gin.H{"post": operation("Run autonomous AI chat workflow", true)},
			"/api/v1/chat/sessions":      gin.H{"get": operation("List chat sessions", true)},
			"/api/v1/chat/{id}/messages": gin.H{"get": operation("List chat messages", true)},
			"/api/v1/events/stream": gin.H{"get": gin.H{
				"summary":     "Server-Sent Events stream",
				"description": "Streams ai_thinking, searching_destination, calculating_budget, generating_itinerary, payment_created, booking_confirmed, workflow_completed, payment updates, and operator logs.",
				"security":    []gin.H{{"BearerAuth": []string{}}},
				"responses":   okResponse("text/event-stream"),
			}},
			"/api/v1/trips":               gin.H{"get": operation("List trips", true), "post": operation("Create trip", true)},
			"/api/v1/trips/{id}":          gin.H{"get": operation("Get trip", true), "put": operation("Update trip", true), "delete": operation("Delete trip", true)},
			"/api/v1/bookings":            gin.H{"post": operation("Create booking", true), "get": operation("List bookings", true)},
			"/api/v1/bookings/{id}":       gin.H{"get": operation("Get booking", true)},
			"/api/v1/payments/create":     gin.H{"post": operation("Create QRIS or Virtual Account payment", true)},
			"/api/v1/payments/webhook":    gin.H{"post": operation("DOKU payment webhook", false)},
			"/api/v1/payments/{id}":       gin.H{"get": operation("Get payment", true)},
			"/api/v1/logs":                gin.H{"get": operation("List AI logs", true)},
			"/api/v1/logs/workflows":      gin.H{"get": operation("List workflow logs", true)},
			"/api/v1/logs/tool-calls":     gin.H{"get": operation("List MCP tool calls", true)},
			"/api/v1/analytics/dashboard": gin.H{"get": operation("Admin analytics dashboard", true)},
		},
	})
}

func (h *Handler) ScalarDocs(c *gin.Context) {
	c.Header("Content-Type", "text/html; charset=utf-8")
	c.String(http.StatusOK, `<!doctype html>
<html>
  <head>
    <title>Vero Travel Agents API Docs</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>body{margin:0;background:#fafafa}</style>
  </head>
  <body>
    <script id="api-reference" data-url="/openapi.json"></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>`)
}

func operation(summary string, secured bool) gin.H {
	op := gin.H{
		"summary":   summary,
		"responses": okResponse("application/json"),
	}
	if secured {
		op["security"] = []gin.H{{"BearerAuth": []string{}}}
	}
	return op
}

func okResponse(contentType string) gin.H {
	return gin.H{
		"200": gin.H{
			"description": "Successful response",
			"content": gin.H{
				contentType: gin.H{
					"schema": gin.H{
						"type": "object",
					},
				},
			},
		},
	}
}
