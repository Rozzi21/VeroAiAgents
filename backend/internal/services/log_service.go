package services

import (
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/dto"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/models"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/repositories"
)

type LogService struct{ repo *repositories.Repository }

func (s *LogService) Logs(query dto.ListQuery) ([]models.AILog, error) {
	return s.repo.ListAILogs(query)
}
func (s *LogService) ToolCalls(query dto.ListQuery) ([]models.ToolCall, error) {
	return s.repo.ListToolCalls(query)
}
