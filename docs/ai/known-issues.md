# Known Issues & Technical Debt

Catatan jujur tentang keterbatasan, technical debt, dan area yang perlu diperhatikan di VeroAiTravelAgents. Ditujukan untuk agent AI berikutnya agar tidak salah asumsi tentang apa yang "sudah jalan" vs "masih placeholder".

> Prinsip: dokumen ini sengaja menyoroti yang BELUM beres. Untuk gambaran fitur yang sudah aktif, lihat `architecture.md` dan `api.md`.

> Audit terakhir: 25 Jun 2026 (analisis keamanan + optimasi lintas-komponen). Bagian "Celah Keamanan" di bawah adalah hasil audit tersebut dan **belum diperbaiki** kecuali ditandai sebaliknya.

---

## A. Celah Keamanan (Prioritas Audit 25 Jun 2026)

### SEC-1. 🔴 KRITIS — Privilege Escalation lewat `/auth/register`

**Lokasi:** `backend/internal/services/services.go` → `AuthService.Register()`, `backend/internal/dto/dto.go` → `RegisterRequest`, route publik di `backend/internal/routes/routes.go` (`authGroup.POST("/register")`).

Endpoint register bersifat **publik** dan menghormati field `role` dari body request:

```go
role := models.RoleUser
if req.Role == string(models.RoleOperator) || req.Role == string(models.RoleAdmin) {
    role = models.Role(req.Role)
}
```

Artinya siapa pun bisa membuat akun **admin/operator** tanpa otorisasi:

```bash
curl -X POST http://localhost:8080/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"x","email":"x@x.com","password":"12345678","role":"admin"}'
# → akun langsung berperan admin (terverifikasi saat audit)
```

**Dampak:** kontrol akses backoffice (CRUD paket, dashboard, logs, daftar booking) bisa diambil alih total oleh penyerang anonim.

**Perbaikan yang disarankan:** abaikan field `role` pada register publik (paksa `RoleUser`). Pembuatan operator/admin harus lewat endpoint terproteksi `Role(admin)` atau seeding manual. Hapus juga `Role` dari `RegisterRequest` atau tandai jelas hanya dipakai jalur admin.

---

### SEC-2. 🟠 TINGGI — IDOR pada `GET /bookings/:id` dan `GET /payments/:id`

**Lokasi:** `backend/internal/routes/routes.go` (`protected.GET("/bookings/:id")`, `protected.GET("/payments/:id")`), `BookingService.Find()` / `PaymentService.Find()` di `services.go`.

Kedua endpoint hanya butuh `Auth` (token valid) tanpa cek kepemilikan. `Find(id)` mengambil record by ID saja:

```go
func (s *BookingService) Find(id uuid.UUID) (models.Booking, error) { return s.repo.FindBooking(id) }
```

**Dampak:** user terotentikasi mana pun bisa membaca booking/payment milik user lain hanya dengan menebak/mengetahui UUID (Insecure Direct Object Reference). Termasuk detail harga dan `ExternalID` pembayaran.

**Perbaikan yang disarankan:** filter by `user_id` dari context untuk role non-operator/admin (mis. `FindBookingForUser(id, userID)`), atau verifikasi `booking.UserID == currentUserID(c)` di service.

---

### SEC-3. 🟠 TINGGI — Tampering Harga Booking & Jumlah Pembayaran

**Lokasi:** `backend/internal/dto/dto.go` (`BookingRequest.TotalPrice`, `PaymentCreateRequest.Amount`), `BookingService.Create()` / `PaymentService.Create()`.

`TotalPrice` booking dan `Amount` payment diambil **mentah dari client** lalu disimpan apa adanya — tidak divalidasi terhadap harga paket (`Trip.BasePrice`) atau total booking:

```go
booking := models.Booking{ ... TotalPrice: req.TotalPrice, ... }   // client-controlled
payment := models.Payment{ ... Amount: req.Amount, ... }            // client-controlled
```

**Dampak:** penyerang bisa membuat booking/payment dengan nominal sembarang (mis. `total_price: 1`). Alur revenue tidak bisa dipercaya.

**Perbaikan yang disarankan:** hitung harga di server dari `Trip` + jumlah pax saat membuat booking; untuk payment, ambil `Amount` dari `Booking.TotalPrice`, jangan dari body.

---

### SEC-4. 🟠 TINGGI — Webhook Pembayaran Bisa Dipalsukan Saat `DOKU_SECRET` Kosong

**Lokasi:** `backend/internal/services/services.go` → `PaymentService.Webhook()`, route publik `api.POST("/payments/webhook")`.

Verifikasi signature hanya berjalan bila `DOKU_SECRET` **dan** `req.Signature` terisi:

```go
if s.cfg.DOKUSecret != "" && req.Signature != "" && !s.verifySignature(...) {
    return ..., errors.New("invalid payment signature")
}
```

Bila `DOKU_SECRET` kosong (default dev) atau penyerang mengirim body tanpa `signature`, status pembayaran langsung diterima. Tidak ada validasi nominal maupun proteksi replay.

**Dampak:** siapa pun yang tahu/menebak `external_id` (format `DOKU-<uuid>`) bisa menandai pembayaran `paid`/`settlement` → memicu `booking_confirmed` + trigger N8N. Penipuan pembayaran.

**Perbaikan yang disarankan:** wajibkan `DOKU_SECRET` di production via `Config.Validate()`, tolak webhook tanpa signature valid, validasi `amount` cocok dengan payment, dan tambah idempotency/replay guard (mis. tolak transisi status mundur).

---

### SEC-5. 🟡 SEDANG — Upload Media: Tanpa Batas Ukuran & MIME Hanya dari Ekstensi

**Lokasi:** `backend/internal/handlers/handlers.go` → `UploadTripMedia()`, `backend/cmd/server/main.go` (tidak set `router.MaxMultipartMemory`).

Validasi tipe file hanya berdasarkan **ekstensi nama file** (`filepath.Ext`), bukan sniffing magic bytes. Tidak ada batas ukuran per-file eksplisit, dan `MaxMultipartMemory` dibiarkan default Gin (32 MB di memori).

**Dampak:** file berbahaya bisa diberi ekstensi `.png`; upload besar berulang bisa menekan memori/disk (DoS ringan). File disajikan publik via `router.Static("/uploads", ...)`.

**Perbaikan yang disarankan:** batasi ukuran (`c.Request.Body = http.MaxBytesReader(...)` atau cek `file.Size`), verifikasi content-type via `http.DetectContentType` pada beberapa byte pertama, dan pertimbangkan menyajikan upload dengan `Content-Disposition`/`X-Content-Type-Options`.

---

### SEC-6. 🟡 SEDANG — Recovery Middleware Mengekspos Detail Panic

**Lokasi:** `backend/internal/middlewares/middlewares.go` → `Recovery()`

```go
utils.Error(c, http.StatusInternalServerError, "Unexpected server error", gin.H{
    "panic": recovered,
})
```

Detail panic (pesan, kadang path/baris) dikirim ke client. **Information disclosure** — penyerang mendapat insight internal.

**Perbaikan yang disarankan:** log panic + stack ke server log, balas pesan generik tanpa detail ke client.

---

### SEC-7. 🟡 SEDANG — Rate Limiter Global (Bukan Per-IP/Client)

**Lokasi:** `backend/internal/middlewares/middlewares.go` → `RateLimit()`

```go
limiter := rate.NewLimiter(rate.Every(time.Second), 20)
```

Satu `Limiter` dibagi **seluruh client** (20 req/detik kumulatif). Satu client bisa menghabiskan kuota semua user; sebaliknya, tidak melindungi endpoint sensitif (login/register) dari brute force per-IP.

**Perbaikan yang disarankan:** `sync.Map` of `*rate.Limiter` per-IP/per-user; limiter lebih ketat khusus `/auth/*`.

---

### SEC-8. 🟡 SEDANG — CORS Origins Hardcoded ke `localhost`

**Lokasi:** `backend/internal/middlewares/middlewares.go` → `CORS()`

```go
AllowOrigins: []string{"http://localhost:3000", "http://localhost:3001", "http://localhost:5173"},
```

Tidak ada domain production; `AllowCredentials=true`. Deploy production = frontend ter-block CORS tanpa ubah kode.

**Perbaikan yang disarankan:** baca dari env `CORS_ALLOWED_ORIGINS`.

---

### SEC-9. 🟡 SEDANG — AI Client: Response Body Tidak Dibatasi Ukurannya

**Lokasi:** `backend/internal/ai/ai_client.go` → `Generate()`

```go
json.NewDecoder(res.Body).Decode(&raw)
```

Tanpa `io.LimitReader`/`http.MaxBytesReader`. Provider yang membalas body sangat besar (HTML error, stream macet) bisa menghabiskan memori.

**Perbaikan yang disarankan:** bungkus `res.Body` dengan `io.LimitReader(res.Body, maxBytes)` sebelum decode.

---

## B. Placeholder & Integrasi Belum Selesai

### 1. MCP Tools Masih Mock (Bukan Integrasi Nyata)

**Lokasi:** `backend/internal/services/services.go` → `MCPService.mock()`

Semua tool MCP mengembalikan data dummy hardcoded, bukan hasil pencarian/komputasi nyata:

- `search_destination` → selalu `["Tokyo", "Kyoto", "Osaka", "Bali"]`
- `search_hotels` → selalu `["Aman Kyoto", "Hoshinoya Tokyo", "Bali Ocean Villa"]`
- `calculate_budget` → selalu `5400 USD`
- `generate_itinerary` → 3 hari statis

**Dampak:** Workflow chat terlihat "pintar" tapi konteks tool tidak mencerminkan input user. Yang benar-benar dinamis hanyalah respons LLM akhir (`generateWithAI`) dan pemilihan paket dari katalog DB (`selectRecommendedPackages`).

**Yang perlu dilakukan:** Ganti `mock()` dengan implementasi nyata. Pertahankan signature `Execute()` agar logging/retry tetap jalan.

---

### 2. `create_payment` Sengaja Dinonaktifkan

**Lokasi:** `backend/internal/services/services.go` (workflow steps), `backend/internal/mcp/tools.go` (`Enabled: false`)

Ini **keputusan desain, bukan bug**. Tool `create_payment` dikeluarkan dari pipeline chat agar AI tidak menjanjikan/menyebut pembayaran (QRIS) sebelum ada booking nyata. `send_whatsapp` juga `Enabled: false`.

**Jangan** mengaktifkan kembali tanpa lebih dulu menyambungkan alur booking end-to-end di frontend. Lihat komentar di `mcp/tools.go` `Catalog()`.

---

### 3. Tidak Ada Automated Test

**Lokasi:** seluruh repo

Tidak ada `*_test.go` maupun test JS/TS. Verifikasi saat ini hanya `go build`, `gofmt`, dan `tsc --noEmit`.

**Area paling berisiko tanpa test (prioritas bila menambah test):**
1. `AuthService.Register()`/`Login()`/`Refresh()` — rotasi token, reuse detection, revoke-all, **dan regresi SEC-1**.
2. `PaymentService.Webhook()` — verifikasi HMAC signature (lihat SEC-4).
3. `AIService.Chat()` — orkestrasi workflow + fallback.

---

### 4. Booking & Payment: Backend Siap, Frontend Belum

**Lokasi:** `frontend/src/app/trip/[id]/page.tsx`

Backend punya endpoint `POST /api/v1/bookings`, `POST /api/v1/payments/create`, dan webhook DOKU. Namun:

- Tombol "Book This Trip" dan "Add to Plan" di customer frontend **tidak punya handler** (terverifikasi masih placeholder).
- Teks "Secure AI-powered checkout" hanya hiasan.
- Tidak ada UI checkout/QRIS di mana pun.

**Dampak:** Booking hanya bisa dibuat lewat API langsung. Alur revenue belum tersambung end-to-end. (Catatan: bila nanti disambung, perbaiki dulu SEC-2 & SEC-3.)

---

### 5. Backoffice: Banyak Halaman Placeholder

**Lokasi:** `backoffice-frontend/src/app/`

- **Dashboard** (`on-development-panel.tsx`) → layar "On Development", tidak memanggil `analytics/dashboard`.
- **`/orders`, `/settings`, `/trips/[id]`** → semuanya me-render `CurrentTripsScreen` (list trip yang sama).
- **Mock data** di `backoffice-frontend/src/lib/data.ts` (`travelCards`, `orders`, `payments`, `workflowSteps`) **tidak dipakai** komponen mana pun.

**Yang benar-benar jalan di backoffice:** auth + CRUD paket + upload media. Selain itu placeholder.

---

### 6. Endpoint Backend yang Belum Dikonsumsi Frontend

- `GET /api/v1/events/stream` (SSE) — **tidak ada** EventSource di kedua frontend.
- `GET /api/v1/analytics/dashboard` — tidak dipanggil backoffice.
- `GET /api/v1/logs`, `/logs/workflows`, `/logs/tool-calls` — tidak dipanggil.
- `GET /api/v1/bookings`, `/bookings/:id` — tidak dipanggil.
- `GET /api/v1/chat/sessions`, `/chat/:id/messages` — tidak dipanggil.

**Dampak:** Effort SSE realtime saat ini "terbuang" dari sisi UX. Peluang: sambungkan SSE ke customer chat untuk progress workflow realtime.

---

## C. Arsitektur & Skalabilitas

### 7. Event Bus In-Memory: Tidak Tahan Restart & Tidak Multi-Instance

**Lokasi:** `backend/internal/events/bus.go`

- Event **hilang saat restart** (tidak ada persistensi).
- **Tidak bisa multi-instance** — klien SSE di instance A tidak menerima event dari instance B.
- Publish **non-blocking** — jika buffer (32) penuh, event **di-drop diam-diam**.

**Yang perlu dilakukan bila scale:** ganti ke Redis Pub/Sub atau message broker. Untuk single instance cukup.

---

### 8. Guest Chat: Satu User "Guest Traveler" Dibagi Semua Tamu

**Lokasi:** `backend/internal/services/services.go` → `AuthService.GuestUser()`

`GuestUser()` memakai `FirstOrCreateUser` dengan email tetap `guest@vero.local`. **Semua tamu berbagi satu record user**. ChatSession dibedakan per session_id, tapi semua dimiliki user guest yang sama.

**Dampak:** `GET /api/v1/chat/sessions` untuk guest akan mengembalikan sesi semua tamu bila dipakai. Privasi antar-tamu belum ada.

---

### 9. Konfigurasi Secret di `.env.example` adalah Nilai Dev

**Lokasi:** `backend/.env.example`

`DATABASE_PASSWORD=password_aman`, `JWT_SECRET=super_secret_vero_travel` adalah nilai dev. `Config.Validate()` menolak start bila `APP_ENV=production` dan `JWT_SECRET` kosong/default — tapi `DATABASE_PASSWORD` dan `DOKU_SECRET` **tidak** divalidasi (lihat SEC-4).

**Catatan:** `.env` aktual developer berisi AI key nyata. Jangan commit `.env`.

---

### 10. AI Memory Summary: Masih Truncation (Bukan LLM Summarization)

**Lokasi:** `backend/internal/services/services.go` → `refreshMemorySummary()`

Ringkasan memory bukan hasil summarization LLM — hanya **potong string** ambil `AI_MEMORY_MAX_CHARS` (1800) karakter terakhir. Konteks lama bisa terpotong di tengah kalimat.

**Sudah dioptimasi:** memakai `TailChatMessages()` untuk mengambil hanya pesan terakhir (estimasi `AIMemoryMaxChars / 200`) alih-alih memuat SEMUA pesan sesi.

**Yang bisa ditingkatkan:** panggil LLM untuk meringkas, bukan slice string.

---

## D. Kualitas Kode & Optimasi

### 11. `services.go` Monolitik (~970 baris)

**Lokasi:** `backend/internal/services/services.go`

Semua service (Auth, MCP, AI, Trip, Booking, Payment, Log, Analytics) ada di satu file (~971 baris dan terus tumbuh).

**Saran refactor (low-risk):** pecah per domain jadi `auth_service.go`, `ai_service.go`, `payment_service.go`, dst dalam package `services` yang sama. Tidak mengubah API, hanya memindah kode.

---

### 12. Duplikasi Prompt User di Konteks LLM

**Lokasi:** `backend/internal/services/services.go` → `AIService.Chat()` + `generateWithAI()`

Pesan user disimpan ke DB **sebelum** `generateWithAI()`, lalu di dalam `generateWithAI()` `ListRecentChatMessages()` sudah memuat pesan terakhir (termasuk pesan user tadi) — namun prompt yang sama **ditambahkan lagi** sebagai message `user` di akhir array. Akibatnya prompt terkirim dua kali ke LLM.

**Perbaikan yang disarankan:** jangan append prompt manual bila sudah termuat di `recent`, atau exclude pesan terakhir dari `recent`.

---

### 13. Uang Disimpan sebagai `float64`

**Lokasi:** `backend/internal/models/models.go` (`BasePrice`, `TotalPrice`, `Amount`, dll bertipe `float64`; kolom DB `numeric(14,2)`).

Aritmetika `float64` rawan galat presisi untuk nominal uang. DB sudah `numeric`, tapi nilai di Go tetap float.

**Perbaikan yang disarankan:** pertimbangkan integer (satuan terkecil/sen) atau tipe decimal saat ada kalkulasi harga server-side (relevan dengan SEC-3).

---

### 14. Backoffice: Error Handling Mengasumsi Response Selalu JSON

**Lokasi:** `backoffice-frontend/src/lib/api.ts` → `request()` & `refreshAccessToken()`

```ts
const payload = (await response.json()) as Envelope<T>;
```

Response dipaksa parse JSON tanpa try-catch. Jika backend membalas HTML (nginx 502, proxy timeout), `response.json()` throw `SyntaxError` yang tidak ramah user.

> Catatan: customer frontend (`frontend/src/lib/api.ts`) **sudah** membungkus `response.json()` dalam try-catch — pola ini tinggal diterapkan ke backoffice.

**Saran:** cek `Content-Type` sebelum parse, atau bungkus try-catch → pesan user-friendly.

---

### 15. Backoffice: Refresh Token Promise Shared Tanpa Timeout

**Lokasi:** `backoffice-frontend/src/lib/api.ts` → `refreshAccessToken()`

`refreshPromise` di-share antar pemanggil, tapi `fetch` refresh tidak punya timeout. Jika endpoint refresh hang (backend mati), promise tidak pernah resolve dan semua request yang menunggu ikut hang.

**Saran:** tambahkan `AbortController` + timeout (mis. 10 detik) yang me-reject promise.

---

## Ringkasan Prioritas

| Prioritas | Item | Alasan |
|---|---|---|
| 🔴 **Kritis** | SEC-1 Privilege escalation `/auth/register` | Anonim bisa jadi admin — terverifikasi live |
| 🟠 **Tinggi** | SEC-2 IDOR booking/payment | Akses data lintas-user |
| 🟠 **Tinggi** | SEC-3 Tampering harga/amount | Revenue tidak tepercaya |
| 🟠 **Tinggi** | SEC-4 Webhook dipalsukan | Penipuan status pembayaran |
| 🟠 **Tinggi** | #3 Test auth/payment/AI | Tidak ada safety net untuk kode sensitif |
| 🟡 Sedang | SEC-5 Upload tanpa batas + MIME ekstensi | DoS ringan / file menyesatkan |
| 🟡 Sedang | SEC-6 Recovery info disclosure | Detail panic bocor |
| 🟡 Sedang | SEC-7 Rate limiter global | Brute force & abuse tak adil |
| 🟡 Sedang | SEC-8 CORS hardcoded | Deploy production terblokir |
| 🟡 Sedang | SEC-9 AI body tanpa limit | Potensi memory exhaustion |
| 🟡 Sedang | #4 Sambungkan booking UI | Alur revenue belum jalan dari UI |
| 🟡 Sedang | #8 Isolasi guest user | Privasi antar-tamu |
| 🟡 Sedang | #14/#15 Backoffice api.ts (JSON & timeout) | Error/hang tidak tertangani |
| Rendah | #11 Pecah services.go | Maintainability |
| Rendah | #12 Duplikasi prompt LLM | Token boros |
| Rendah | #13 Uang float64 | Presisi |
| Rendah | #10 LLM summarization memory | Masih truncation string |

> Catatan: item lama #12 (pagination list endpoint) dan #13 (async logging MCP + retry) sudah **selesai diperbaiki** dan dihapus dari daftar ini per audit 25 Jun 2026. Implementasinya: `dto.ListQuery.Normalize()` (default 50, maks 200) dan audit log + single retry di `MCPService.Execute()`.

---

## Lihat Juga
- `architecture.md` — gambaran sistem & fitur aktif
- `backend.md` — detail service layer & integrasi
- `coding-rules.md` — konvensi agar perubahan konsisten
