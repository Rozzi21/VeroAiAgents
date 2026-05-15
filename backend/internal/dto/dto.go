package dto

import "github.com/google/uuid"

type RegisterRequest struct {
	Name     string `json:"name" binding:"required,min=2"`
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=8"`
	Role     string `json:"role"`
}

type LoginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

type RefreshRequest struct {
	RefreshToken string `json:"refresh_token" binding:"required"`
}

type AuthResponse struct {
	AccessToken  string      `json:"access_token"`
	RefreshToken string      `json:"refresh_token"`
	TokenType    string      `json:"token_type"`
	ExpiresIn    int64       `json:"expires_in"`
	User         interface{} `json:"user"`
}

type ChatRequest struct {
	SessionID *uuid.UUID `json:"session_id"`
	Prompt    string     `json:"prompt" binding:"required,min=2"`
	Stream    bool       `json:"stream"`
}

type TripRequest struct {
	Title          string  `json:"title" binding:"required"`
	Destination    string  `json:"destination" binding:"required"`
	Overview       string  `json:"overview"`
	Duration       string  `json:"duration"`
	EstimatedPrice float64 `json:"estimated_price"`
	ImageURL       string  `json:"image_url"`
}

type BookingRequest struct {
	TripID     uuid.UUID `json:"trip_id" binding:"required"`
	TotalPrice float64   `json:"total_price" binding:"required"`
}

type PaymentCreateRequest struct {
	BookingID     uuid.UUID `json:"booking_id" binding:"required"`
	PaymentMethod string    `json:"payment_method" binding:"required,oneof=QRIS VA VIRTUAL_ACCOUNT"`
	Amount        float64   `json:"amount" binding:"required"`
}

type PaymentWebhookRequest struct {
	ExternalID string `json:"external_id" binding:"required"`
	Status     string `json:"status" binding:"required"`
	Signature  string `json:"signature"`
}
