package repositories

import (
	"context"

	"github.com/rozzi/vero-ai-travel-agents/backend/internal/models"
)

// Aggregate query methods for the analytics dashboard.
// Service depends only on the AnalyticsRepository interface for unit testing.
// Aggregate SQL stays inside the repository layer where it belongs.

func (r *Repository) CountBookings(ctx context.Context) (int64, error) {
	var count int64
	err := r.DB.WithContext(ctx).Model(&models.Booking{}).Count(&count).Error
	return count, err
}

func (r *Repository) SumBookingRevenue(ctx context.Context) (float64, error) {
	var revenue float64
	err := r.DB.WithContext(ctx).Model(&models.Booking{}).
		Select("COALESCE(SUM(total_price), 0)").Scan(&revenue).Error
	return revenue, err
}

func (r *Repository) CountTrips(ctx context.Context) (int64, error) {
	var count int64
	err := r.DB.WithContext(ctx).Model(&models.Trip{}).Count(&count).Error
	return count, err
}

func (r *Repository) CountAILogs(ctx context.Context) (int64, error) {
	var count int64
	err := r.DB.WithContext(ctx).Model(&models.AILog{}).Count(&count).Error
	return count, err
}

func (r *Repository) CountPayments(ctx context.Context) (int64, error) {
	var count int64
	err := r.DB.WithContext(ctx).Model(&models.Payment{}).Count(&count).Error
	return count, err
}

// CountSuccessfulPayments counts payments whose status is in the canonical
// success set (models.PaymentSuccessStatuses).
func (r *Repository) CountSuccessfulPayments(ctx context.Context) (int64, error) {
	var count int64
	err := r.DB.WithContext(ctx).Model(&models.Payment{}).
		Where("status IN ?", models.PaymentSuccessStatuses()).Count(&count).Error
	return count, err
}
