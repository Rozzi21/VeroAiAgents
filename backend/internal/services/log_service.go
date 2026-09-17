package services

import (
	"context"

	"github.com/rozzi/vero-ai-travel-agents/backend/internal/dto"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/models"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/repositories"
)

// LogService depends on the LogRepository interface.
type LogService struct{ repo repositories.LogRepository }

func (s *LogService) Logs(ctx context.Context, query dto.ListQuery) ([]models.AILog, error) {
	repoQuery := repositories.RepositoryFilter{
		Limit:  query.Limit,
		Offset: query.Offset,
	}
	return s.repo.ListAILogs(ctx, repoQuery)
}
func (s *LogService) ToolCalls(ctx context.Context, query dto.ListQuery) ([]models.ToolCall, error) {
	repoQuery := repositories.RepositoryFilter{
		Limit:  query.Limit,
		Offset: query.Offset,
	}
	return s.repo.ListToolCalls(ctx, repoQuery)
}
