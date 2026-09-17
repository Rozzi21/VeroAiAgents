package repositories

import (
	"gorm.io/gorm"
)

// Repository is the single data-access object for all domains. Method
// implementations are split per-domain (same package, separate files):
//
//	user_repository.go    — users
//	chat_repository.go    — chat sessions & messages
//	trip_repository.go    — trips & itineraries
//	booking_repository.go — bookings (incl. FindBookingBySession, atomic status)
//	payment_repository.go — payments
//	log_repository.go     — AI logs & tool calls
//	auth_sessions.go      — auth session (JWT refresh) store
//
// RepositoryFilter is a generic pagination filter for list queries.
type RepositoryFilter struct {
	Limit  int
	Offset int
}

// TripRepositoryFilter is the query filter for trip listing.
type TripRepositoryFilter struct {
	Category      string
	Status        string
	Search        string
	PublishedOnly bool
	Limit         int
	Offset        int
}

type Repository struct {
	DB *gorm.DB
}

func New(db *gorm.DB) *Repository {
	return &Repository{DB: db}
}
