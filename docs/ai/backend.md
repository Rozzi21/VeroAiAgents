# Backend - Service Layer, Business Logic, dan Integrasi

Dokumen ini menjelaskan lapisan backend Go: service layer, logika bisnis inti, mekanisme realtime, dan integrasi eksternal. Untuk arsitektur umum lihat [architecture.md](architecture.md); untuk endpoint lihat [api.md](api.md); untuk skema data lihat [database.md](database.md).

## Lokasi Kode Inti

| Path | Isi |
|---|---|
| `backend/cmd/server/main.go` | Entry point, wiring dependency, graceful shutdown |
| `backend/internal/services/services.go` | SEMUA service dalam satu file (~960 baris) |
| `backend/internal/ai/openclaw.go` | Klien AI OpenAI-compatible + fallback lokal |
| `backend/internal/mcp/tools.go` | Katalog definisi tool MCP |
| `backend/internal/events/bus.go` | Event bus in-memory untuk SSE |
| `backend/internal/auth/` | JWTService, cookie refresh, audit log |

## Service Layer

Semua service didefinisikan di `backend/internal/services/services.go` dan di-wiring di `services.New()`. Container `Services` berisi: `Auth`, `AI`, `MCP`, `Trips`, `Bookings`, `Payments`, `Logs`, `Analytics`.

Pola umum: tiap service adalah struct dengan dependency `repo` (repository), dan opsional `bus` (event), `cfg` (config), `jwt`, `mcp`, `client` (AI). Dependency di-inject manual via `services.New()`.

```go
func New(cfg config.Config, repo *repositories.Repository, jwt *auth.JWTService, bus *events.Bus) *Services {
    s := &Services{Config: cfg, Repo: repo, JWT: jwt, Events: bus}
    s.Auth = &AuthService{repo: repo, jwt: jwt, cfg: cfg}
    s.MCP = &MCPService{repo: repo, bus: bus}
    aiClient := ai.NewClient(cfg.AIAPIKey, cfg.AIBaseURL, cfg.AIModel, cfg.AITemperature, cfg.AITimeout)
    s.AI = &AIService{repo: repo, mcp: s.MCP, bus: bus, client: aiClient, cfg: cfg}
    // ...
}
```

### AuthService

Tanggung jawab: register, login, refresh, logout, profil, guest user.

Poin penting:
- `issueSession()` menghasilkan token pair (access + refresh) dan menyimpan refresh JTI sebagai `AuthSession` di DB.
- `Refresh()` mengimplementasikan **rotasi token** + **reuse detection**: token refresh yang sudah dirotasi (revoked) bila dipakai lagi memicu `RevokeAllActiveSessionsByUser()` (cabut semua sesi user) dan log `refresh_token_reuse_detected`.
- `GuestUser()` membuat/menemukan user "Guest Traveler" (`guest@vero.local`) via `FirstOrCreateUser` untuk guest chat.
- Semua aksi auth mencatat audit via `auth.LogSecurity()`.

### AIService - Inti Produk

`AIService.Chat()` adalah jantung platform. Alur (lihat `services.go`):

1. Buat/lanjutkan `ChatSession`, simpan pesan user.
2. Jalankan pipeline workflow MCP berurutan, tiap langkah publish event SSE:
   - `ai_thinking` -> `search_destination`
   - `searching_destination` -> `search_hotels`
   - `calculating_budget` -> `calculate_budget`
   - `generating_itinerary` -> `generate_itinerary`
   - `create_payment` SENGAJA DINONAKTIFKAN (lihat known-issues.md)
3. Ambil katalog paket published dari DB (`publishedPackagesForAI`, limit 20).
4. Kirim prompt + workflow context + memory + N pesan terakhir ke LLM via `generateWithAI()`.
5. Bila AI gagal/empty -> fallback response lokal, log kegagalan.
6. Simpan pesan assistant, refresh memory summary, publish `workflow_completed`.
7. `selectRecommendedPackages()` memilih hingga 3 paket via scoring kata kunci.

Memory management: `refreshMemorySummary()` membuat ringkasan percakapan setelah >= `AI_MEMORY_SUMMARY_AFTER` (default 12) pesan, dibatasi `AI_MEMORY_MAX_CHARS` (default 1800).

### MCPService

`Execute()` menjalankan tool dengan **retry 3x**, mencatat ke `ToolCall` + `AILog`, lalu publish event `mcp_tool_executed`. Semua tool saat ini **mock** (`mock()` mengembalikan data dummy). Katalog di `mcp/tools.go` punya field `Enabled` per-tool; `ActiveCatalog()` mengembalikan tool yang aktif saja.

### TripService

CRUD trip + transformasi DTO. Pola penting:
- `buildTripFromRequest()` menormalkan field (slug auto, dual field destination/location, default category/status).
- Saat status `published` dan `PublishedAt` kosong, set timestamp.
- Itinerary di-replace via `ReplaceTripItineraries()` (hapus + insert ulang dalam transaksi).

### BookingService & PaymentService

- `BookingService.Create()`: booking baru selalu `booking_status=pending`, `payment_status=waiting_payment`.
- `PaymentService.Create()`: payment intent dengan `ExternalID=DOKU-<uuid>`, expired 15 menit.
- `PaymentService.Webhook()`: verifikasi HMAC-SHA256 (bila `DOKU_SECRET` di-set), update status, dan bila `paid`/`settlement` -> publish `booking_confirmed` + trigger N8N.

### AnalyticsService

`Dashboard()` mengagregasi metrik via query GORM langsung (`db.Model().Count()`, `Select("COALESCE(SUM...)")`): total bookings, revenue, active trips, AI usage, payment success rate.

## Mekanisme Realtime (Event Bus + SSE)

Bukan queue/message broker eksternal. Implementasi in-memory di `backend/internal/events/bus.go`:

- `Bus` menyimpan `map[chan Event]struct{}` dengan `sync.RWMutex`.
- `Subscribe()` membuat channel buffered (kapasitas 32).
- `Publish()` **non-blocking**: pakai `select` dengan `default`, jadi event di-drop bila channel penuh (tidak memblok publisher).
- Handler `EventStream` (di `handlers.go`) men-stream via SSE dengan heartbeat 25 detik.

Implikasi penting untuk AI: karena in-memory, event TIDAK persisten dan TIDAK survive restart atau multi-instance. Untuk horizontal scaling perlu diganti Redis pub/sub atau sejenis (lihat known-issues.md).

## Background Jobs, Queue, Cache, Scheduler

Saat ini **TIDAK ADA**:
- Tidak ada background worker / cron / scheduler di backend.
- Tidak ada queue (RabbitMQ/Kafka/dll).
- Tidak ada cache (Redis/Memcached).

Satu-satunya "asinkron" adalah goroutine di `Bus.Publish` (implisit lewat channel) dan goroutine health check di `database.Health()`. Semua proses lain sinkron dalam request lifecycle.

Catatan: N8N (eksternal) yang berperan sebagai automation/scheduler di luar aplikasi Go ini.

## Integrasi Eksternal

| Integrasi | Lokasi | Fungsi | Fallback |
|---|---|---|---|
| AI Provider (OpenAI-compatible / OpenClaw) | `ai/openclaw.go` | Generasi respons chat via `POST {AI_BASE_URL}/chat/completions` | Bila `AI_API_KEY` kosong atau gagal -> respons lokal |
| DOKU (payment gateway) | `services.go` PaymentService | Webhook pembayaran, verifikasi HMAC-SHA256 | Bila `DOKU_SECRET` kosong, signature tidak diverifikasi |
| N8N (automation) | `services.go` `triggerN8N()` | Webhook pasca-pembayaran (`payment_success`) | Bila `N8N_WEBHOOK` kosong, di-skip |

### Klien AI (`ai/openclaw.go`)

- `NewClient()` set default: baseURL `https://api.openai.com/v1`, model `gpt-4o-mini`, timeout 35s.
- `Generate()`: bila API key kosong -> langsung return fallback. Jika ada key -> POST ke `/chat/completions`.
- `extractText()` parsing fleksibel: coba `choices[0].message.content`, lalu `choices[0].text`, lalu top-level keys (`text`, `output`, `content`, `message`).

## Pola Penting untuk Diingat

1. **Semua service di satu file** (`services.go`). Saat menambah fitur, ikuti pola struct + method yang ada.
2. **Event-driven via publish**: aksi penting (trip_created, booking_created, payment_updated, dll) selalu `bus.Publish()`.
3. **Fallback-first untuk integrasi eksternal**: tiap integrasi punya jalur degradasi supaya demo tetap jalan.
4. **Logging audit untuk auth**: tiap aksi auth memanggil `auth.LogSecurity()`.
5. **Retry untuk operasi tak stabil**: MCP tool (3x), koneksi DB (5x).
