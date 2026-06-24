# Vero Travel Agents Backend

API Golang berorientasi produksi untuk platform travel otonom berbasis AI. Backend ini menjadi orkestrator inti: chat AI, manajemen paket trip, booking, pembayaran (DOKU), logging tool MCP, analytics, dan event realtime via SSE.

- Modul: `github.com/rozzi/vero-ai-travel-agents/backend`
- Go: `1.25.5`
- Framework: Gin + GORM (PostgreSQL 16)

## Fitur

- HTTP API Gin dengan struktur modular (handler → service → repository → GORM)
- PostgreSQL 16 via GORM: connection pooling, retry koneksi, auto migration
- JWT access/refresh terpisah by audience, password bcrypt, otorisasi berbasis peran (user/operator/admin)
- Refresh token disimpan sebagai session di DB (bisa di-revoke) dan dikirim via cookie HttpOnly
- Audit log keamanan (login, refresh, logout, deteksi penyalahgunaan token); deteksi reuse refresh token (token yang sudah dirotasi dipakai lagi) otomatis mencabut SEMUA sesi aktif user sebagai proteksi pencurian token
- Orkestrasi chat AI otonom dengan tool MCP (saat ini mock) + memory ringkasan percakapan
- Adapter AI OpenAI-compatible untuk respons akhir, dengan fallback lokal
- Event realtime SSE untuk workflow AI, pembayaran, booking, dan log operator
- API trips, bookings, payments, AI logs, tool calls, analytics
- Verifikasi signature webhook pembayaran DOKU (HMAC-SHA256) + trigger webhook N8N
- Dokumentasi API: Scalar UI di `/docs` dan OpenAPI 3.1 JSON di `/openapi.json`
- Dockerfile + docker-compose (Postgres 16 + API)

## Status Fitur Penting

- **`create_payment` (MCP) dinonaktifkan secara sengaja.** Tool ini tidak ikut di workflow chat agar AI tidak pernah menyebut QRIS/pembayaran sebelum ada booking sungguhan. Lihat `internal/mcp/tools.go` (`Enabled: false`) dan komentar di `internal/services/services.go`.
- **Tool MCP masih mock.** `search_destination`, `search_hotels`, `calculate_budget`, `generate_itinerary` mengembalikan data dummy. `send_whatsapp` terdefinisi tapi belum dipakai di workflow.
- **Integrasi LLM nyata sudah ada** lewat endpoint OpenAI-compatible. Jika `AI_API_KEY` kosong atau provider gagal, backend memakai fallback lokal supaya demo tetap jalan.

## Arsitektur

```
cmd/server            → entry point, wiring, graceful shutdown
internal/
  config/             → load env → struct Config
  database/           → koneksi GORM, retry, AutoMigrate, health
  models/             → skema GORM (User, ChatSession, Trip, Booking, Payment, dst)
  repositories/       → akses data (CRUD)
  services/           → logika bisnis (Auth, AI, MCP, Trip, Booking, Payment, Log, Analytics)
  handlers/           → handler HTTP + OpenAPI/Scalar docs
  routes/             → registrasi rute + middleware per-grup
  middlewares/        → RequestID, SecureHeaders, CORS, RateLimit, Auth, Role
  auth/               → JWTService, cookie refresh, audit log
  ai/                 → klien AI OpenAI-compatible + fallback
  mcp/                → katalog definisi tool MCP
  events/             → event bus in-memory untuk SSE
  utils/              → envelope respons API standar
  dto/                → request/response + validasi binding
```

Semua respons memakai envelope seragam: `{ success, message, data, error }`.

### Workflow Chat AI

`POST /api/v1/chat` (guest, tanpa login) menjalankan pipeline berikut, masing-masing mem-publish event SSE:

1. `ai_thinking` → tool `search_destination`
2. `searching_destination` → tool `search_hotels`
3. `calculating_budget` → tool `calculate_budget`
4. `generating_itinerary` → tool `generate_itinerary`

Setelah workflow, backend mengambil katalog paket published dari DB, mengirim prompt + konteks workflow + memory ke LLM, lalu memilih hingga 3 paket rekomendasi (scoring kata kunci) untuk ditampilkan sebagai kartu di frontend. Tool `create_payment` sengaja tidak dijalankan di pipeline ini.

## Setup

```bash
cp .env.example .env
# edit DATABASE_PASSWORD, JWT_SECRET, dan kunci integrasi eksternal
go mod tidy
go run ./cmd/server
```

API berjalan di `http://localhost:8080`.

## Konfigurasi Environment

| Variabel | Default | Keterangan |
|---|---|---|
| `APP_ENV` | `development` | Mode aplikasi (`production` mengaktifkan cookie secure by default) |
| `PORT` | `8080` | Port HTTP |
| `DATABASE_HOST` | `localhost` | Host PostgreSQL |
| `DATABASE_PORT` | `5432` | Port PostgreSQL |
| `DATABASE_USER` | `vero_user` | User DB |
| `DATABASE_PASSWORD` | _(kosong)_ | Password DB — wajib diisi |
| `DATABASE_NAME` | `vero_travel` | Nama database |
| `DATABASE_SSLMODE` | `disable` | Mode SSL koneksi DB |
| `DATABASE_URL` | _(kosong)_ | DSN penuh; jika kosong, dirakit dari field di atas |
| `JWT_SECRET` | `super_secret_vero_travel` | Secret JWT — wajib diganti di production. Saat `APP_ENV=production`, backend menolak start jika nilai ini kosong atau masih default (lihat `Config.Validate()`). |
| `JWT_ACCESS_TTL_MINUTES` | `15` | Masa hidup access token (pendek demi keamanan; refresh otomatis menangani perpanjangan) |
| `JWT_REFRESH_TTL_HOURS` | `720` | Masa hidup refresh token (30 hari) |
| `JWT_COOKIE_NAME` | `refresh_token` | Nama cookie refresh HttpOnly |
| `JWT_COOKIE_SECURE` | `APP_ENV==production` | Cookie hanya via HTTPS |
| `JWT_COOKIE_SAME_SITE` | `Strict` | Kebijakan SameSite cookie. Jika diisi `None` (mis. backoffice & API beda domain), backend otomatis memaksa cookie `Secure` (wajib HTTPS) karena browser menolak `SameSite=None` tanpa Secure. |
| `AI_API_KEY` | _(kosong)_ | Kunci provider AI; kosong → fallback lokal |
| `AI_BASE_URL` | `https://api.openai.com/v1` | Base URL provider OpenAI-compatible |
| `AI_MODEL` | `gpt-4o-mini` | Model AI |
| `AI_TEMPERATURE` | `0.4` | Temperature generasi |
| `AI_TIMEOUT_SECONDS` | `35` | Timeout permintaan AI |
| `AI_CONTEXT_RECENT_MESSAGES` | `8` | Jumlah pesan terakhir sebagai konteks |
| `AI_MEMORY_SUMMARY_AFTER` | `12` | Jumlah pesan sebelum ringkasan memory dibuat |
| `AI_MEMORY_MAX_CHARS` | `1800` | Batas panjang ringkasan memory |
| `DOKU_CLIENT_ID` | _(kosong)_ | Client ID DOKU |
| `DOKU_SECRET` | _(kosong)_ | Secret DOKU untuk verifikasi signature webhook |
| `N8N_WEBHOOK` | _(kosong)_ | URL webhook N8N untuk otomasi pasca-pembayaran |


## Endpoint API

Semua path diawali `http://localhost:8080`. Tanda 🔒 berarti butuh `Authorization: Bearer <access_token>`; (op/admin) berarti butuh peran operator atau admin.

### Health
- `GET /health` — status service
- `GET /health/database` — status koneksi DB

### Dokumentasi
- `GET /docs` — Scalar API reference (UI)
- `GET /openapi.json` — OpenAPI 3.1 JSON

### Auth
- `POST /api/v1/auth/register` — daftar user, mengeluarkan token + set cookie refresh
- `POST /api/v1/auth/login` — login via email/username + password
- `POST /api/v1/auth/refresh` — perbarui access token via cookie refresh HttpOnly
- `POST /api/v1/auth/logout` — revoke session + hapus cookie refresh
- `GET /api/v1/auth/me` 🔒 — profil user saat ini

### Publik (dipakai customer frontend)
- `GET /api/v1/packages` — daftar paket published
- `GET /api/v1/packages/:id` — detail paket published (by id atau slug)
- `POST /api/v1/chat` — workflow chat AI sebagai guest (tanpa login)

### Chat (riwayat)
- `GET /api/v1/chat/sessions` 🔒 — daftar sesi chat user
- `GET /api/v1/chat/:id/messages` 🔒 — daftar pesan dalam sesi

### Realtime
- `GET /api/v1/events/stream` 🔒 — SSE stream event workflow/pembayaran/log

### Trips
- `GET /api/v1/trips` 🔒 — daftar trip
- `GET /api/v1/trips/:id` 🔒 — detail trip by id
- `POST /api/v1/trips` 🔒 (op/admin) — buat trip
- `PUT /api/v1/trips/:id` 🔒 (op/admin) — update trip
- `DELETE /api/v1/trips/:id` 🔒 (op/admin) — hapus trip

### Admin (dipakai backoffice frontend)
- `GET /api/v1/admin/packages` 🔒 (op/admin) — daftar paket (mendukung `?category=&search=`)
- `POST /api/v1/admin/packages` 🔒 (op/admin) — buat paket
- `PUT /api/v1/admin/packages/:id` 🔒 (op/admin) — update paket
- `DELETE /api/v1/admin/packages/:id` 🔒 (op/admin) — hapus paket
- `POST /api/v1/admin/uploads` 🔒 (op/admin) — upload media gambar (FormData `file`)
- `GET /api/v1/admin/dashboard` 🔒 (op/admin) — analytics dashboard

### Bookings
- `POST /api/v1/bookings` 🔒 — buat booking
- `GET /api/v1/bookings` 🔒 (op/admin) — daftar booking
- `GET /api/v1/bookings/:id` 🔒 — detail booking

### Payments
- `POST /api/v1/payments/create` 🔒 — buat payment intent (QRIS / Virtual Account)
- `GET /api/v1/payments/:id` 🔒 — detail payment
- `POST /api/v1/payments/webhook` — webhook DOKU (verifikasi HMAC-SHA256; tanpa auth)

### Logs & Analytics (op/admin)
- `GET /api/v1/logs` 🔒 — daftar AI log
- `GET /api/v1/logs/workflows` 🔒 — log workflow
- `GET /api/v1/logs/tool-calls` 🔒 — daftar pemanggilan tool MCP
- `GET /api/v1/analytics/dashboard` 🔒 — analytics dashboard

## Event SSE

Stream `/api/v1/events/stream` mengirim event berikut:

- Workflow chat: `ai_thinking`, `searching_destination`, `calculating_budget`, `generating_itinerary`, `ai_response`, `workflow_completed`
- Tool & data: `mcp_tool_executed`, `trip_created`, `booking_created`
- Pembayaran: `payment_created`, `payment_updated`, `booking_confirmed`
- Keep-alive: `heartbeat` (tiap 25 detik)

Catatan: `payment_created` dan `booking_confirmed` berasal dari API booking/payment, bukan dari workflow chat (karena `create_payment` dinonaktifkan di chat).

## Alur Pembayaran

1. `POST /api/v1/bookings` → booking dibuat (`booking_status=pending`, `payment_status=waiting_payment`)
2. `POST /api/v1/payments/create` → payment intent (`ExternalID=DOKU-...`, kedaluwarsa 15 menit)
3. DOKU memanggil `POST /api/v1/payments/webhook` → signature diverifikasi HMAC-SHA256 (`message = external_id + status`)
4. Jika status `paid`/`settlement` → publish `booking_confirmed` + trigger webhook N8N (`payment_success`)

## Integrasi AI (OpenAI-compatible)

Set di `.env`:

```env
AI_API_KEY=your_provider_key
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-4o-mini
```

Klien memanggil `POST {AI_BASE_URL}/chat/completions`. Bila `AI_API_KEY` kosong atau provider gagal, backend mencatat kegagalan dan mengembalikan respons fallback lokal agar demo tetap berjalan.

## Docker

```bash
docker compose up --build
```

Menjalankan PostgreSQL 16 + API. Konfigurasi via `.env` (compose meng-override `DATABASE_HOST`/`DATABASE_URL` ke service `postgres`).

## Deployment

Lihat `docs/server-deploy.md` untuk panduan deploy ke server (systemd, firewall, dan penempatan di belakang Nginx/Caddy untuk HTTPS).

## Testing

Belum ada automated test di repo ini. Saat menambah test, gunakan `go test ./...`.
