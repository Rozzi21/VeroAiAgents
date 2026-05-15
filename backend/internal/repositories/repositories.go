package repositories

import (
	"github.com/google/uuid"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/models"
	"gorm.io/gorm"
)

type Repository struct {
	DB *gorm.DB
}

func New(db *gorm.DB) *Repository {
	return &Repository{DB: db}
}

func (r *Repository) CreateUser(user *models.User) error {
	return r.DB.Create(user).Error
}

func (r *Repository) FindUserByEmail(email string) (models.User, error) {
	var user models.User
	err := r.DB.Where("email = ?", email).First(&user).Error
	return user, err
}

func (r *Repository) FindUserByID(id uuid.UUID) (models.User, error) {
	var user models.User
	err := r.DB.First(&user, "id = ?", id).Error
	return user, err
}

func (r *Repository) CreateChatSession(session *models.ChatSession) error {
	return r.DB.Create(session).Error
}

func (r *Repository) ListChatSessions(userID uuid.UUID) ([]models.ChatSession, error) {
	var sessions []models.ChatSession
	err := r.DB.Where("user_id = ?", userID).Order("created_at desc").Find(&sessions).Error
	return sessions, err
}

func (r *Repository) AddChatMessage(message *models.ChatMessage) error {
	return r.DB.Create(message).Error
}

func (r *Repository) ListChatMessages(sessionID uuid.UUID) ([]models.ChatMessage, error) {
	var messages []models.ChatMessage
	err := r.DB.Where("session_id = ?", sessionID).Order("created_at asc").Find(&messages).Error
	return messages, err
}

func (r *Repository) CreateTrip(trip *models.Trip) error {
	return r.DB.Create(trip).Error
}

func (r *Repository) ListTrips() ([]models.Trip, error) {
	var trips []models.Trip
	err := r.DB.Preload("Itineraries").Order("created_at desc").Find(&trips).Error
	return trips, err
}

func (r *Repository) FindTrip(id uuid.UUID) (models.Trip, error) {
	var trip models.Trip
	err := r.DB.Preload("Itineraries").First(&trip, "id = ?", id).Error
	return trip, err
}

func (r *Repository) UpdateTrip(trip *models.Trip) error {
	return r.DB.Save(trip).Error
}

func (r *Repository) DeleteTrip(id uuid.UUID) error {
	return r.DB.Delete(&models.Trip{}, "id = ?", id).Error
}

func (r *Repository) CreateBooking(booking *models.Booking) error {
	return r.DB.Create(booking).Error
}

func (r *Repository) ListBookings() ([]models.Booking, error) {
	var bookings []models.Booking
	err := r.DB.Preload("User").Preload("Trip").Preload("Payments").Order("created_at desc").Find(&bookings).Error
	return bookings, err
}

func (r *Repository) FindBooking(id uuid.UUID) (models.Booking, error) {
	var booking models.Booking
	err := r.DB.Preload("User").Preload("Trip").Preload("Payments").First(&booking, "id = ?", id).Error
	return booking, err
}

func (r *Repository) CreatePayment(payment *models.Payment) error {
	return r.DB.Create(payment).Error
}

func (r *Repository) FindPayment(id uuid.UUID) (models.Payment, error) {
	var payment models.Payment
	err := r.DB.Preload("Booking").First(&payment, "id = ?", id).Error
	return payment, err
}

func (r *Repository) FindPaymentByExternalID(externalID string) (models.Payment, error) {
	var payment models.Payment
	err := r.DB.Preload("Booking").First(&payment, "external_id = ?", externalID).Error
	return payment, err
}

func (r *Repository) UpdatePayment(payment *models.Payment) error {
	return r.DB.Save(payment).Error
}

func (r *Repository) CreateAILog(log *models.AILog) error {
	return r.DB.Create(log).Error
}

func (r *Repository) ListAILogs() ([]models.AILog, error) {
	var logs []models.AILog
	err := r.DB.Order("created_at desc").Limit(200).Find(&logs).Error
	return logs, err
}

func (r *Repository) CreateToolCall(call *models.ToolCall) error {
	return r.DB.Create(call).Error
}

func (r *Repository) ListToolCalls() ([]models.ToolCall, error) {
	var calls []models.ToolCall
	err := r.DB.Order("created_at desc").Limit(200).Find(&calls).Error
	return calls, err
}
