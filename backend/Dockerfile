FROM golang:1.25-alpine AS builder

WORKDIR /app
RUN apk add --no-cache git ca-certificates

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/vero-travel-api ./cmd/server

FROM alpine:3.20

WORKDIR /app
RUN apk add --no-cache ca-certificates

COPY --from=builder /out/vero-travel-api /app/vero-travel-api
COPY .env.example /app/.env.example

EXPOSE 8080
CMD ["/app/vero-travel-api"]
