# Vero Travel Agents Backend

Production-oriented Golang API for an AI-powered autonomous travel platform.

## Features

- Gin HTTP API with clean modular structure
- PostgreSQL 16 via GORM, connection pooling, retry, auto migration
- JWT access/refresh tokens, bcrypt passwords, role authorization
- Autonomous AI chat orchestration with mock MCP tools
- SSE realtime events for AI workflow, payment, booking, and logs
- Trips, bookings, payments, AI logs, tool calls, analytics APIs
- DOKU-style payment webhook signature verification
- OpenClaw adapter for final AI response generation with local fallback
- Scalar API docs at `/docs` and OpenAPI 3.1 JSON at `/openapi.json`
- Dockerfile and docker-compose for backend-only deployment

## Setup

```bash
cp .env.example .env
# edit DATABASE_PASSWORD and external integration keys
go mod tidy
go run ./cmd/server
```

## OpenClaw Integration

Set these values in `.env`:

```env
OPENCLAW_API_KEY=your_openclaw_key
OPENCLAW_BASE_URL=https://api.openclaw.ai/v1/responses
```

The chat workflow runs MCP tools first, then sends the prompt plus workflow
context to OpenClaw. If the API key is empty or OpenClaw fails, the backend logs
the failure and returns a local fallback response so demos keep working.

API runs on `http://localhost:8080`.

## Important Routes

- `GET /health`
- `GET /health/database`
- `GET /docs`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/chat`
- `GET /api/v1/events/stream`
- `GET /api/v1/analytics/dashboard`

## Docker

```bash
docker compose up --build
```

PostgreSQL is external and should be configured through `.env`.
