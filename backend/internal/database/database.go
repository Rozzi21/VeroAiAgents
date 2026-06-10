package database

import (
	"context"
	"errors"
	"log"
	"time"

	"github.com/rozzi/vero-ai-travel-agents/backend/internal/config"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/models"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

type Database struct {
	DB *gorm.DB
}

func Connect(cfg config.Config) (*Database, error) {
	var db *gorm.DB
	var err error

	gormLogger := logger.Default.LogMode(logger.Warn)
	if cfg.AppEnv == "development" {
		gormLogger = logger.Default.LogMode(logger.Info)
	}

	for attempt := 1; attempt <= 5; attempt++ {
		db, err = gorm.Open(postgres.Open(cfg.DatabaseURL), &gorm.Config{
			Logger: gormLogger,
		})
		if err == nil {
			sqlDB, sqlErr := db.DB()
			if sqlErr == nil && sqlDB.Ping() == nil {
				sqlDB.SetMaxOpenConns(25)
				sqlDB.SetMaxIdleConns(10)
				sqlDB.SetConnMaxLifetime(time.Hour)
				return &Database{DB: db}, nil
			}
			if sqlErr != nil {
				err = sqlErr
			}
		}

		log.Printf("database connection attempt %d failed: %v", attempt, err)
		time.Sleep(time.Duration(attempt) * time.Second)
	}

	return nil, err
}

func (d *Database) AutoMigrate() error {
	if err := d.DB.AutoMigrate(
		&models.User{},
		&models.AuthSession{},
		&models.ChatSession{},
		&models.ChatMessage{},
		&models.Trip{},
		&models.Itinerary{},
		&models.Booking{},
		&models.Payment{},
		&models.AILog{},
		&models.ToolCall{},
	); err != nil {
		return err
	}

	return d.migrateLegacySlots()
}

func (d *Database) migrateLegacySlots() error {
	if !d.DB.Migrator().HasColumn("trips", "slots") {
		return nil
	}

	return d.DB.Exec(`
		UPDATE trips
		SET adult_pax = slots
		WHERE slots > 0 AND adult_pax = 0 AND child_pax = 0
	`).Error
}

func (d *Database) Health(ctx context.Context) error {
	sqlDB, err := d.DB.DB()
	if err != nil {
		return err
	}
	done := make(chan error, 1)
	go func() { done <- sqlDB.PingContext(ctx) }()

	select {
	case err := <-done:
		return err
	case <-ctx.Done():
		return errors.New("database health check timed out")
	}
}

func (d *Database) Close() error {
	sqlDB, err := d.DB.DB()
	if err != nil {
		return err
	}
	return sqlDB.Close()
}
