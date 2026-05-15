package utils

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

type APIResponse struct {
	Success bool        `json:"success"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
	Error   interface{} `json:"error,omitempty"`
}

func Success(c *gin.Context, status int, message string, data interface{}) {
	c.JSON(status, APIResponse{
		Success: true,
		Message: message,
		Data:    data,
	})
}

func Error(c *gin.Context, status int, message string, err interface{}) {
	c.JSON(status, APIResponse{
		Success: false,
		Message: message,
		Error:   err,
	})
}

func BadRequest(c *gin.Context, message string, err interface{}) {
	Error(c, http.StatusBadRequest, message, err)
}

func Unauthorized(c *gin.Context, message string) {
	Error(c, http.StatusUnauthorized, message, gin.H{})
}

func Forbidden(c *gin.Context, message string) {
	Error(c, http.StatusForbidden, message, gin.H{})
}

func NotFound(c *gin.Context, message string) {
	Error(c, http.StatusNotFound, message, gin.H{})
}

func ServerError(c *gin.Context, err error) {
	Error(c, http.StatusInternalServerError, "Internal server error", gin.H{
		"detail": err.Error(),
	})
}
