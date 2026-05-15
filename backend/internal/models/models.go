package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Role string

const (
	RoleUser     Role = "user"
	RoleOperator Role = "operator"
	RoleAdmin    Role = "admin"
)

type BaseModel struct {
	ID        uuid.UUID      `json:"id" gorm:"type:uuid;primaryKey"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `json:"-" gorm:"index"`
}

func (m *BaseModel) BeforeCreate(_ *gorm.DB) error {
	if m.ID == uuid.Nil {
		m.ID = uuid.New()
	}
	return nil
}

type User struct {
	BaseModel
	Name         string        `json:"name" gorm:"size:120;not null"`
	Email        string        `json:"email" gorm:"size:180;uniqueIndex;not null"`
	Password     string        `json:"-" gorm:"not null"`
	Role         Role          `json:"role" gorm:"size:30;not null;default:user"`
	ChatSessions []ChatSession `json:"-" gorm:"foreignKey:UserID"`
	Bookings     []Booking     `json:"-" gorm:"foreignKey:UserID"`
}

type ChatSession struct {
	BaseModel
	UserID   uuid.UUID     `json:"user_id" gorm:"type:uuid;index;not null"`
	User     User          `json:"-" gorm:"foreignKey:UserID"`
	Title    string        `json:"title" gorm:"size:180;not null"`
	Messages []ChatMessage `json:"messages,omitempty" gorm:"foreignKey:SessionID"`
}

type ChatMessage struct {
	BaseModel
	SessionID uuid.UUID   `json:"session_id" gorm:"type:uuid;index;not null"`
	Session   ChatSession `json:"-" gorm:"foreignKey:SessionID"`
	Role      string      `json:"role" gorm:"size:30;not null"`
	Content   string      `json:"content" gorm:"type:text;not null"`
}

type Trip struct {
	BaseModel
	Title          string      `json:"title" gorm:"size:180;not null"`
	Destination    string      `json:"destination" gorm:"size:180;not null;index"`
	Overview       string      `json:"overview" gorm:"type:text"`
	Duration       string      `json:"duration" gorm:"size:80"`
	EstimatedPrice float64     `json:"estimated_price" gorm:"type:numeric(14,2);not null;default:0"`
	ImageURL       string      `json:"image_url" gorm:"type:text"`
	Itineraries    []Itinerary `json:"itineraries,omitempty" gorm:"foreignKey:TripID"`
}

type Itinerary struct {
	BaseModel
	TripID      uuid.UUID `json:"trip_id" gorm:"type:uuid;index;not null"`
	Trip        Trip      `json:"-" gorm:"foreignKey:TripID"`
	Day         int       `json:"day" gorm:"not null"`
	Title       string    `json:"title" gorm:"size:180;not null"`
	Description string    `json:"description" gorm:"type:text"`
}

type Booking struct {
	BaseModel
	UserID        uuid.UUID `json:"user_id" gorm:"type:uuid;index;not null"`
	User          User      `json:"user,omitempty" gorm:"foreignKey:UserID"`
	TripID        uuid.UUID `json:"trip_id" gorm:"type:uuid;index;not null"`
	Trip          Trip      `json:"trip,omitempty" gorm:"foreignKey:TripID"`
	BookingStatus string    `json:"booking_status" gorm:"size:40;not null;default:pending"`
	PaymentStatus string    `json:"payment_status" gorm:"size:40;not null;default:waiting_payment"`
	TotalPrice    float64   `json:"total_price" gorm:"type:numeric(14,2);not null"`
	BookingDate   time.Time `json:"booking_date" gorm:"not null"`
	Payments      []Payment `json:"payments,omitempty" gorm:"foreignKey:BookingID"`
}

type Payment struct {
	BaseModel
	BookingID     uuid.UUID `json:"booking_id" gorm:"type:uuid;index;not null"`
	Booking       Booking   `json:"-" gorm:"foreignKey:BookingID"`
	PaymentMethod string    `json:"payment_method" gorm:"size:50;not null"`
	ExternalID    string    `json:"external_id" gorm:"size:160;index"`
	Amount        float64   `json:"amount" gorm:"type:numeric(14,2);not null"`
	Status        string    `json:"status" gorm:"size:40;not null;default:pending"`
	ExpiredAt     time.Time `json:"expired_at"`
}

type AILog struct {
	BaseModel
	SessionID     *uuid.UUID `json:"session_id,omitempty" gorm:"type:uuid;index"`
	Workflow      string     `json:"workflow" gorm:"size:160;not null"`
	ToolName      string     `json:"tool_name" gorm:"size:120"`
	Status        string     `json:"status" gorm:"size:40;not null"`
	ExecutionTime int64      `json:"execution_time" gorm:"not null;default:0"`
	Response      string     `json:"response" gorm:"type:jsonb;default:'{}'"`
}

type ToolCall struct {
	BaseModel
	SessionID uuid.UUID `json:"session_id" gorm:"type:uuid;index;not null"`
	ToolName  string    `json:"tool_name" gorm:"size:120;not null"`
	Payload   string    `json:"payload" gorm:"type:jsonb;default:'{}'"`
	Result    string    `json:"result" gorm:"type:jsonb;default:'{}'"`
	Status    string    `json:"status" gorm:"size:40;not null"`
}
