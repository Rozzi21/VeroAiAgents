# Known Issues & Technical Debt

Catatan jujur tentang keterbatasan, technical debt, dan area yang perlu diperhatikan di VeroAiTravelAgents. Ditujukan untuk agent AI berikutnya agar tidak salah asumsi tentang apa yang "sudah jalan" vs "masih placeholder".

> Prinsip: dokumen ini sengaja menyoroti yang BELUM beres. Untuk gambaran fitur yang sudah aktif, lihat `architecture.md` dan `api.md`.

> Audit terakhir: 25 Jun 2026 (analisis keamanan + optimasi lintas-komponen). Seluruh temuan keamanan SEC-1..SEC-9 hasil audit tersebut **sudah diperbaiki** pada batch 25 Jun 2026 — lihat bagian A (status: SELESAI) untuk ringkasan implementasinya.

---

## A. Celah Keamanan — SELESAI (Batch 25 Jun 2026)

Seluruh sembilan temuan di bawah sudah diperbaiki dan diverifikasi `go build`/`go vet`. Dicatat di sini sebagai jejak audit + acuan regresi (lihat juga `#3` soal kebutuhan automated test untuk mengunci perbaikan ini).

### SEC-1. ✅ KRITIS — Privilege Escalation lewat `/auth/register` (FIXED)

**Lokasi:** `backend/internal/services/auth_service.go` → `AuthService.Register()`.

`Register()` kini **selalu** memaksa `models.RoleUser` dan tidak lagi membaca field `role` dari body. Field `Role` dihapus dari `dto.RegisterRequest`. Pembuatan akun operator/admin dipindah ke jalur resmi terproteksi: `POST /api/v1/admin/users` (guard `Role(admin)`) → `dto.AdminCreateUserRequest` → `AuthService.CreateStaff()`. Verifikasi: register dengan `role:"admin"` tetap menghasilkan user biasa.

### SEC-2. ✅ TINGGI — IDOR pada `GET /bookings/:id` & `GET /payments/:id` (FIXED)

**Lokasi:** `booking_service.go`/`payment_service.go` (`Find(id, userID, isStaff)`), `repositories.go` (`FindBookingForUser`, `FindPaymentForUser`), `handlers.go` (`isStaff(c)`).

`Find` kini menerima `userID` + `isStaff`. Caller non-staff hanya bisa mengambil record miliknya (query difilter `user_id`; payment via join ke `bookings`). Staff (operator/admin) tetap bisa mengakses semua. Record milik user lain membalas not found.

### SEC-3. ✅ TINGGI — Tampering Harga Booking & Jumlah Pembayaran (FIXED)

**Lokasi:** `dto.go` (`BookingRequest`, `PaymentCreateRequest`), `booking_service.go`, `payment_service.go`.

`BookingRequest.TotalPrice` dan `PaymentCreateRequest.Amount` **dihapus**. `BookingService.Create()` menghitung total server-side: `tripAdultPrice(trip)*adultPax + tripChildPrice(trip)*childPax` (menghormati diskon). `PaymentService.Create()` mengambil `Amount` dari `Booking.TotalPrice`. Body kini hanya menerima `trip_id`,`adult_pax`,`child_pax` (booking) dan `booking_id`,`payment_method` (payment).

### SEC-4. ✅ TINGGI — Webhook Pembayaran Bisa Dipalsukan (FIXED)

**Lokasi:** `payment_service.go` → `Webhook()`, `config.go` → `Validate()`.

Bila `PAYMENTS_ENABLED=true` dan `DOKU_SECRET` ter-set, webhook **wajib** signature valid (tolak bila kosong/salah). Bila secret kosong saat `APP_ENV=production` dan payments enabled, webhook ditolak; `Config.Validate()` juga mewajibkan `DOKU_SECRET` non-kosong di production hanya saat payments enabled. Ditambah validasi `amount` (jika dikirim) harus cocok dengan payment, dan idempotency: status yang sudah `paid`/`settlement` tidak bisa diturunkan dan tidak diproses ulang.

### SEC-5. ✅ SEDANG — Upload Media: Batas Ukuran & MIME Asli (FIXED)

**Lokasi:** `handlers.go` → `UploadTripMedia()` + `detectImageContentType()`, `cmd/server/main.go`.

`router.MaxMultipartMemory = 8<<20`. Upload dibatasi `maxUploadBytes = 5 MiB` (cek `file.Size`), dan content-type asli diverifikasi via `http.DetectContentType` pada 512 byte pertama — ditolak bila bukan `image/*`, meski ekstensi cocok.

### SEC-6. ✅ SEDANG — Recovery Tidak Bocorkan Detail Panic (FIXED)

**Lokasi:** `middlewares.go` → `Recovery()`.

Detail panic + `request_id` + path di-`log.Printf` ke server log; client hanya menerima pesan generik tanpa field `panic`.

### SEC-7. ✅ SEDANG — Rate Limiter Per-IP + Ketat untuk `/auth` (FIXED)

**Lokasi:** `middlewares.go` → `ipRateLimiter`, `RateLimit()`, `AuthRateLimit()`.

Rate limit kini per-IP via `sync.Map` of `*rate.Limiter` (`c.ClientIP()`). Global 20 req/detik per-IP; grup `/auth` memakai `AuthRateLimit()` lebih ketat (5 req/detik) untuk meredam brute force.

### SEC-8. ✅ SEDANG — CORS dari Env (FIXED)

**Lokasi:** `config.go` (`CORSAllowedOrigins`, `parseCSVEnv`), `middlewares.go` → `CORS(allowedOrigins)`, `main.go`.

Origins dibaca dari env `CORS_ALLOWED_ORIGINS` (CSV), fallback ke localhost dev. `CORS()` menerima daftar dari config.

### SEC-9. ✅ SEDANG — AI Client: Body Dibatasi (FIXED)

**Lokasi:** `ai/ai_client.go` → `Generate()`.

`res.Body` dibungkus `io.LimitReader(res.Body, maxAIResponseBytes)` (1 MiB) sebelum decode JSON.

---

## B. Placeholder & Integrasi Belum Selesai

### 1. Sebagian MCP Tools Masih Mock (Bukan Integrasi Nyata)

**Lokasi:** `backend/internal/services/mcp_service.go` → `MCPService.mock()`

Sebagian tool MCP masih mengembalikan data dummy hardcoded, bukan hasil pencarian/komputasi nyata:

- `search_destination` → selalu `["Tokyo", "Kyoto", "Osaka", "Bali"]`
- `search_hotels` → selalu `["Aman Kyoto", "Hoshinoya Tokyo", "Bali Ocean Villa"]`
- `calculate_budget` → selalu `5400 USD`
- `generate_itinerary` → 3 hari statis

Tool yang sudah nyata:
- `create_booking` → memanggil `BookingService.Create()` dan menyimpan booking/order ke DB.
- `update_order_draft` → lightweight success response untuk validasi tool call UI/draft.

**Dampak:** Workflow rekomendasi masih terlihat "pintar" tapi konteks search/budget/itinerary tool tidak mencerminkan input user. Yang benar-benar dinamis adalah respons LLM akhir (`generateWithToolLoop`), pemilihan paket dari katalog DB (`selectRecommendedPackages`), dan order creation via `create_booking`.

**Yang perlu dilakukan:** Ganti `mock()` dengan implementasi nyata. Pertahankan signature `Execute()` agar logging/retry tetap jalan.

---

### 2. `create_payment` Sengaja Dinonaktifkan

**Lokasi:** `backend/internal/services/ai_service.go` (workflow steps di `Chat()`), `backend/internal/mcp/tools.go` (`Enabled: false`)

Ini **keputusan desain, bukan bug**. Tool `create_payment` dikeluarkan dari pipeline chat dan diblok di `MCPService.Execute()` agar AI tidak menjanjikan/menyebut pembayaran (QRIS/DOKU) selama `PAYMENTS_ENABLED=false`. `send_whatsapp` juga `Enabled: false`.

**Jangan** mengaktifkan kembali tanpa lebih dulu menyambungkan alur booking end-to-end di frontend. Lihat komentar di `mcp/tools.go` `Catalog()`.

---

### 3. Automated Test Masih Minim

**Lokasi:** seluruh repo

Backend sudah memiliki test minimal untuk `internal/ai`, tetapi belum ada coverage memadai untuk service/repository dan belum ada test JS/TS. Verifikasi utama masih `go build`, `go test ./...`, `gofmt`, dan `tsc --noEmit`.

**Area paling berisiko tanpa test (prioritas bila menambah test):**
1. `AuthService.Register()`/`Login()`/`Refresh()`/`CreateStaff()` — rotasi token, reuse detection, revoke-all, **dan regresi SEC-1** (register tidak boleh bisa set role).
2. `PaymentService.Webhook()` — verifikasi HMAC signature + idempotency + amount mismatch (SEC-4).
3. `BookingService.Create()`/`PaymentService.Create()` — harga server-side (SEC-3), dan `Find()` ownership (SEC-2).
4. `AIService.Chat()` — orkestrasi workflow, function calling loop, guard agar AI tidak mengklaim order berhasil tanpa `create_booking` success.

---

### 4. Booking & Payment: Backend Siap, Frontend Belum

**Lokasi:** `frontend/src/app/trip/[id]/page.tsx`

Backend punya endpoint `POST /api/v1/bookings`, `POST /api/v1/payments/create`, dan webhook DOKU. Namun:

- Tombol customer sudah membuat order manual via `POST /api/v1/orders`, tanpa payment otomatis.
- Teks checkout sudah diganti menjadi manual admin processing.
- Tidak ada UI checkout/QRIS di mana pun.

**Dampak:** Order manual sudah bisa dibuat dari customer UI, tetapi revenue/payment DOKU belum tersambung end-to-end karena payment sengaja dinonaktifkan.

> Catatan kontrak (pasca SEC-3): `POST /bookings` kini menerima `{trip_id, adult_pax, child_pax}` (tanpa `total_price`); `POST /payments/create` menerima `{booking_id, payment_method}` (tanpa `amount`). Saat menyambungkan UI, ikuti kontrak baru ini — harga dihitung server-side.

---

### 5. Backoffice: Banyak Halaman Placeholder

**Lokasi:** `backoffice-frontend/src/app/`

- **Dashboard** (`on-development-panel.tsx`) → layar "On Development", tidak memanggil `analytics/dashboard`.
- **`/settings`, `/trips/[id]`** → masih me-render `CurrentTripsScreen` placeholder.
- **`/orders`** → sudah memiliki antarmuka lengkap (Order Management) sesuai desain Stitch.
- **Mock data** di `backoffice-frontend/src/lib/data.ts` (`travelCards`, `orders`, `payments`, `workflowSteps`) **tidak dipakai** komponen mana pun.

**Yang benar-benar jalan di backoffice:** auth + CRUD paket + upload media + list order manual. Selain itu placeholder.

---

### 6. Endpoint Backend yang Belum Dikonsumsi Frontend

- `GET /api/v1/events/stream` (SSE) — **tidak ada** EventSource di kedua frontend.
- `GET /api/v1/analytics/dashboard` — tidak dipanggil backoffice.
- `GET /api/v1/logs`, `/logs/workflows`, `/logs/tool-calls` — tidak dipanggil.
- `GET /api/v1/bookings/:id` — tidak dipanggil.
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

**Lokasi:** `backend/internal/services/auth_service.go` → `AuthService.GuestUser()`

`GuestUser()` memakai `FirstOrCreateUser` dengan email tetap `guest@vero.local`. **Semua tamu berbagi satu record user**. ChatSession dibedakan per session_id, tapi semua dimiliki user guest yang sama.

**Dampak:** `GET /api/v1/chat/sessions` untuk guest akan mengembalikan sesi semua tamu bila dipakai. Privasi antar-tamu belum ada.

---

### 9. Konfigurasi Secret di `.env.example` adalah Nilai Dev

**Lokasi:** `backend/.env.example`

`DATABASE_PASSWORD=password_aman`, `JWT_SECRET=super_secret_vero_travel` adalah nilai dev. `Config.Validate()` menolak start bila `APP_ENV=production` dan `JWT_SECRET` kosong/default; sejak DOKU disabled, `DOKU_SECRET` hanya wajib non-kosong di production saat `PAYMENTS_ENABLED=true`. `DATABASE_PASSWORD` masih **belum** divalidasi.

**Catatan:** `.env` aktual developer berisi AI key nyata. Jangan commit `.env`.

---

### 10. AI Memory Summary: Masih Truncation (Bukan LLM Summarization)

**Lokasi:** `backend/internal/services/ai_service.go` → `refreshMemorySummary()`

Ringkasan memory bukan hasil summarization LLM — hanya **potong string** ambil `AI_MEMORY_MAX_CHARS` (1800) karakter terakhir. Konteks lama bisa terpotong di tengah kalimat.

**Sudah dioptimasi:** memakai `TailChatMessages()` untuk mengambil hanya pesan terakhir (estimasi `AIMemoryMaxChars / 200`) alih-alih memuat SEMUA pesan sesi.

**Yang bisa ditingkatkan:** panggil LLM untuk meringkas, bukan slice string.

---

## D. Kualitas Kode & Optimasi

### 11. ✅ `services.go` Monolitik — SUDAH DIPECAH (Batch 25 Jun 2026)

**Lokasi:** `backend/internal/services/`

Dulu semua service di satu file `services.go` (~970 baris). Kini sudah dipecah per-domain dalam package `services` yang sama (API publik tidak berubah):

- `services.go` → `Services` struct, `New()`, tipe bersama (`AuthRequestMeta`, `AuthIssueResult`, error vars).
- `auth_service.go`, `ai_service.go`, `mcp_service.go`, `trip_service.go`, `booking_service.go`, `payment_service.go`, `log_service.go`, `analytics_service.go`.
- `helpers.go` → util bersama (`slugify`, `normalize`, `firstNonEmpty`, `firstNonZero`, `parseDate`).

---

### 12. ✅ Duplikasi Prompt User di Konteks LLM — SUDAH DIPERBAIKI (Batch 25 Jun 2026)

**Lokasi:** `backend/internal/services/ai_service.go` → `generateWithAI()`

Dulu prompt user terkirim dua kali ke LLM (sekali via `ListRecentChatMessages`, sekali di-append manual). Kini urutan pesan: `system → catalog → memory → workflow_context → recent_messages`. Append manual prompt dihapus (hanya fallback bila `recent` kosong). Selain itu konteks workflow diringkas via `summarizeWorkflow()` (hanya `tool`+`status`, bukan seluruh data dummy) untuk menghemat token.

---

### 13. Uang Disimpan sebagai `float64`

**Lokasi:** `backend/internal/models/models.go` (`BasePrice`, `TotalPrice`, `Amount`, dll bertipe `float64`; kolom DB `numeric(14,2)`).

Aritmetika `float64` rawan galat presisi untuk nominal uang. DB sudah `numeric`, tapi nilai di Go tetap float. **Makin relevan** sejak SEC-3: kalkulasi harga booking kini dilakukan server-side (`tripAdultPrice*pax + tripChildPrice*pax`) memakai `float64`.

**Perbaikan yang disarankan:** pertimbangkan integer (satuan terkecil/sen) atau tipe decimal untuk kalkulasi harga server-side.

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

**Sisa pekerjaan (belum selesai):**

| Prioritas | Item | Alasan |
|---|---|---|
| 🟠 **Tinggi** | #3 Test auth/payment/AI | Tidak ada safety net untuk kode sensitif (kini juga untuk mengunci SEC-1..SEC-4) |
| 🟡 Sedang | #4 Re-enable payment UI saat siap | Alur revenue/payment belum jalan dari UI (ikuti kontrak baru pasca SEC-3 dan set `PAYMENTS_ENABLED=true`) |
| 🟡 Sedang | #8 Isolasi guest user | Privasi antar-tamu |
| 🟡 Sedang | #14/#15 Backoffice api.ts (JSON & timeout) | Error/hang tidak tertangani |
| Rendah | #13 Uang float64 | Presisi (makin relevan setelah harga server-side SEC-3) |
| Rendah | #10 LLM summarization memory | Masih truncation string |

**Sudah selesai (jejak audit):**

| Item | Status |
|---|---|
| SEC-1 Privilege escalation `/auth/register` | ✅ Register paksa `RoleUser` + endpoint `admin/users` |
| SEC-2 IDOR booking/payment | ✅ `Find(id,userID,isStaff)` + repo scoped per-owner |
| SEC-3 Tampering harga/amount | ✅ Harga & amount dihitung server-side |
| SEC-4 Webhook dipalsukan | ✅ Signature wajib + `DOKU_SECRET` prod + idempotency |
| SEC-5 Upload tanpa batas + MIME ekstensi | ✅ Batas 5 MiB + sniff `DetectContentType` |
| SEC-6 Recovery info disclosure | ✅ Log ke server, pesan generik ke client |
| SEC-7 Rate limiter global | ✅ Per-IP + `AuthRateLimit` ketat untuk `/auth` |
| SEC-8 CORS hardcoded | ✅ Dari env `CORS_ALLOWED_ORIGINS` |
| SEC-9 AI body tanpa limit | ✅ `io.LimitReader` 1 MiB |
| #11 Pecah services.go | ✅ Dipecah per-domain (satu package) |
| #12 Duplikasi prompt LLM | ✅ Urutan pesan dirapikan + workflow diringkas |

> Catatan: item lama (pagination list endpoint & async logging MCP + retry) sudah selesai lebih dulu: `dto.ListQuery.Normalize()` (default 50, maks 200) dan audit log + single retry di `MCPService.Execute()`.

---

## Lihat Juga
- `architecture.md` — gambaran sistem & fitur aktif
- `backend.md` — detail service layer & integrasi
- `coding-rules.md` — konvensi agar perubahan konsisten
