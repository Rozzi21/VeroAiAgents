package services

import (
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/dto"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/events"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/models"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/repositories"
)

type BookingService struct {
	repo *repositories.Repository
	bus  *events.Bus
}

func (s *BookingService) Create(userID uuid.UUID, req dto.BookingRequest) (models.Booking, error) {
	// SEC-3: never trust a client-supplied price. Resolve the trip and compute
	// the total from the catalog price and the requested pax server-side.
	trip, err := s.repo.FindTrip(req.TripID)
	if err != nil {
		return models.Booking{}, errors.New("trip not found")
	}
	adultPax := req.AdultPax
	childPax := req.ChildPax
	if adultPax <= 0 && childPax <= 0 {
		adultPax = 1
	}
	total := tripAdultPrice(trip)*float64(adultPax) + tripChildPrice(trip)*float64(childPax)
	booking := models.Booking{
		UserID:        userID,
		TripID:        req.TripID,
		BookingStatus: "pending",
		// Payments are temporarily disabled. New orders stay pending for manual
		// backoffice/admin processing. Re-enable DOKU by restoring the old
		// waiting_payment status alongside PAYMENTS_ENABLED=true.
		PaymentStatus: "pending_admin_processing",
		AdultPax:      adultPax,
		ChildPax:      childPax,
		ContactName:   req.ContactName,
		ContactEmail:  req.ContactEmail,
		ContactPhone:  req.ContactPhone,
		TravelDate:    parseDate(req.TravelDate),
		TotalPrice:    total,
		BookingDate:   time.Now(),
	}
	if err := s.repo.CreateBooking(&booking); err != nil {
		return booking, err
	}
	s.bus.Publish("booking_created", booking)
	return booking, nil
}
func (s *BookingService) List(query dto.ListQuery) ([]models.Booking, error) {
	return s.repo.ListBookings(query)
}

// Find enforces ownership for non-staff callers (SEC-2 anti-IDOR).
func (s *BookingService) Find(id, userID uuid.UUID, isStaff bool) (models.Booking, error) {
	if isStaff {
		return s.repo.FindBooking(id)
	}
	return s.repo.FindBookingForUser(id, userID)
}

// tripAdultPrice/tripChildPrice resolve the effective price honoring discounts.
func tripAdultPrice(trip models.Trip) float64 {
	if trip.DiscountEnabled && trip.DiscountPrice > 0 {
		return trip.DiscountPrice
	}
	return firstNonZero(trip.BasePrice, trip.EstimatedPrice)
}

func tripChildPrice(trip models.Trip) float64 {
	if trip.ChildDiscountEnabled && trip.ChildDiscount > 0 {
		return trip.ChildDiscount
	}
	return trip.ChildPrice
}
