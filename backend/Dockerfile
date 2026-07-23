FROM golang:1.25-alpine AS builder

WORKDIR /app
RUN apk add --no-cache git ca-certificates

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/vero-travel-api ./cmd/server

FROM alpine:3.20

WORKDIR /app
RUN apk add --no-cache ca-certificates \
    && addgroup -S app && adduser -S app -G app

COPY --from=builder /out/vero-travel-api /app/vero-travel-api

# Uploads dir: owned by app user; mount a volume here in production.
RUN mkdir -p /app/uploads/trips && chown -R app:app /app

USER app

EXPOSE 8080
CMD ["/app/vero-travel-api"]