# Known Issues & Technical Debt

Catatan jujur tentang keterbatasan, technical debt, dan area yang perlu diperhatikan di VeroAiTravelAgents. Ditujukan untuk agent AI berikutnya agar tidak salah asumsi tentang apa yang "sudah jalan" vs "masih placeholder".

> Prinsip: dokumen ini sengaja menyoroti yang BELUM beres. Untuk gambaran fitur yang sudah aktif, lihat `architecture.md` dan `api.md`.

> Audit terakhir: 21 Jul 2026 (audit keamanan + bug menyeluruh). Audit menemukan **12 temuan BARU** (SEC-10..SEC-21) — SEC-11 & SEC-15 SUDAH DIPERBAIKI (21 Jul 2026), sisanya (SEC-10, SEC-12..SEC-14, SEC-16..SEC-21) BELUM — lihat bagian A2. Temuan lama SEC-1..SEC-9 tetap SELESAI (bagian A).

---

## A2. Celah Keamanan & Bug BARU — BELUM DIPERBAIKI (Batch Audit 21 Jul 2026)

Temuan hasil audit ulang seluruh kode. Diurutkan berdasarkan severity.

### SEC-10. 🔴 TINGGI — IDOR pada `GET /chat/:id/messages`

**Lokasi:** `backend/internal/handlers/handlers.go` → `ChatMessages()` (baris ~167) + `routes.go`.

Handler memanggil `Repo.ListChatMessages(id)` tanpa memverifikasi bahwa session milik `currentUserID(c)`. Siapa pun dengan JWT valid (user biasa) dapat membaca SELURUH isi pesan sesi milik user lain dengan menebak/menyalin UUID session. Parah dikombinasikan dengan #8 (semua guest berbagi user `guest@vero.local`): semua riwayat chat tamu bisa dibaca satu akun.

**Perbaikan:** tambah filter ownership (`FindChatSession(id)` → cocokkan `UserID`, atau query messages join session dengan `user_id = ?`), staff boleh akses semua.

### SEC-11. ✅ TINGGI — Validasi Pax Negatif pada Booking (FIXED 21 Jul 2026)

**Lokasi:** `backend/internal/services/booking_service.go` → `Create()`, `dto.go` → `BookingRequest` + konstanta `MaxBookingPax`.

Dulu `AdultPax`/`ChildPax` tanpa batas: nilai negatif menghasilkan `TotalPrice` negatif/nol dan nilai raksasa berisiko overflow. Kini dua lapis pertahanan:

1. DTO binding `gte=0,lte=20` pada `AdultPax`/`ChildPax` — menolak request HTTP (`POST /bookings`, `POST /orders`) di luar rentang.
2. Guard server-side di `BookingService.Create()`: tolak `pax < 0` atau `pax > dto.MaxBookingPax` (20). Menutup jalur non-HTTP yang bypass binding (tool MCP `create_booking` di `mcp_service.go` — cast `int(v)` tanpa clamp kini tertahan guard ini dan mengembalikan error ke tool result).

Verifikasi: `go build ./...` + `go vet` + `gofmt` bersih.

### SEC-12. 🔴 TINGGI — Replay Webhook Pembayaran (Tanpa Timestamp/Nonce)

**Lokasi:** `backend/internal/services/payment_service.go` → `Webhook()` (baris ~75), `dto.go` → `PaymentWebhookRequest`.

Signature diverifikasi terhadap pesan `ExternalID + Status` yang statis. Payload webhook valid bisa di-replay kapan pun (tidak ada timestamp, nonce, atau expiry). Meski idempotency mencegah downgrade `paid`→status lain, transisi status non-terminal (mis. `pending`→`failed`, lalu replay `pending`→`paid` lama) masih mungkin, dan replay memicu ulang `bus.Publish` + `triggerN8N` (notifikasi duplikat). Selain itu skema HMAC ini bukan skema asli DOKU (yang menandatangani digest body + headers) — integrasi nyata akan gagal verifikasi.

**Perbaikan:** saat payments diaktifkan, implementasi skema signature DOKU resmi (digest SHA-256 body + header timestamp), tolak request tanpa timestamp segar (±5 menit), catat nonce.

### SEC-13. 🟠 SEDANG — Endpoint Publik `POST /orders` Tanpa Proteksi Abuse

**Lokasi:** `routes.go` (baris 25), `handlers.go` → `GuestCreateOrder()`.

Endpoint order publik tanpa auth. Hanya dilindungi `RateLimit()` global 20 req/s per-IP — cukup untuk spam ribuan booking palsu ke DB (tiap request = 1 INSERT + SELECT trip + publish event). Dikombinasikan SEC-11, penyerang juga bisa membuat order bernilai negatif/nol. Tidak ada CAPTCHA/honeypot.

**Perbaikan:** rate limit khusus lebih ketat untuk `/orders` + `/chat` (mis. 5 req/menit per-IP), validasi pax (SEC-11), pertimbangkan Turnstile/CAPTCHA.

### SEC-14. 🟠 SEDANG — Rate Limiter `sync.Map` Tumbuh Tak Terbatas (Memory DoS)

**Lokasi:** `backend/internal/middlewares/middlewares.go` → `ipRateLimiter` (baris ~77-105).

Setiap IP baru membuat entry `*rate.Limiter` di `sync.Map` dan TIDAK PERNAH dihapus. Penyerang dengan banyak IP (botnet/spoof via header jika `TrustedProxies` salah konfigurasi) dapat mengisi memori server tanpa batas. Juga: `c.ClientIP()` memakai default Gin yang percaya `X-Forwarded-For` dari semua proxy — `router.SetTrustedProxies()` tidak dipanggil di `main.go`, sehingga rate limit per-IP mudah di-bypass dengan memutar header `X-Forwarded-For`.

**Perbaikan:** tambah janitor periodik (hapus limiter idle), batasi jumlah entry, dan set `router.SetTrustedProxies([]string{...})` sesuai reverse proxy deploy.

### SEC-15. ✅ SEDANG — Kebocoran Detail Error Internal ke Client (FIXED 21 Jul 2026)

**Lokasi:** `backend/internal/utils/response.go` → `ServerError()`; `backend/internal/handlers/handlers.go`.

Dulu respons 500/400 membawa pesan error Go/GORM mentah (nama tabel, constraint, DSN fragment). Kini:

1. `ServerError()` membalas pesan generik `"Internal server error"` dengan `error: {}`; error asli di-`log.Printf` ke server bersama `request_id`, method, path.
2. `/health/database` (`DatabaseHealth`) tidak lagi mengirim `detail` — error DB di-log server-side, client hanya menerima `"Database disconnected"`.
3. BadRequest yang membawa error service internal disapukan ke pesan statis + log server: `Register`, `AdminCreateUser`, `UpdateBooking`, `PaymentWebhook`, `UploadTripMedia` (form file + read file).
4. Disengaja dipertahankan: `bind()` (error validasi JSON per-field) dan `parseID()` (error parse UUID) masih mengirim `detail` — itu error input klien, bukan internal; berguna untuk UX form. `Login` tetap membalas `err.Error()` via `Unauthorized` (pesan kredensial-salah yang memang ditujukan ke user, bukan error DB).

Verifikasi: `go build ./...` + `go vet` + `gofmt` bersih.

### SEC-16. 🟠 SEDANG — Prompt Chat Tanpa Batas Ukuran (Biaya LLM / DoS)

**Lokasi:** `dto.go` → `ChatRequest` (`Prompt` hanya `binding:"required,min=2"`); `ai_service.go` → `Chat()`.

Tidak ada `max=` pada prompt. Request publik `/chat` bisa mengirim prompt ratusan KB → tiap kirim = 4 tool MCP + 1..5 round LLM (token cost) + tulis DB. Dikombinasikan rate limit 20/s, ini vektor pemborosan biaya API LLM.

**Perbaikan:** batasi `binding:"required,min=2,max=4000"`, batasi body size global (`http.MaxBytesReader`/middleware), rate limit ketat `/chat`.

### SEC-17. 🟠 SEDANG — Session ID Asing Diterima di Chat (Lintas-Sesi Tamu)

**Lokasi:** `backend/internal/services/ai_service.go` → `Chat()` (baris ~36-49).

Jika caller mengirim `session_id` milik sesi lain, service langsung `AddChatMessage` ke sesi itu tanpa cek kepemilikan. Karena semua guest memakai user yang sama, tamu A yang mengetahui `session_id` tamu B (bocor via SSE `mcp_tool_executed` yang broadcast payload berisi `session_id`, atau via SEC-10) bisa menitipkan pesan ke konteks B — prompt injection lintas sesi + polusi memory summary.

**Perbaikan:** `FindChatSession(sessionID)` → verifikasi `UserID == userID` sebelum menulis.

### SEC-18. 🟡 RENDAH — Event Bus Broadcast Data Sensitif ke Semua Subscriber SSE

**Lokasi:** `backend/internal/services/ai_service.go` (`bus.Publish(step.event, ...{"prompt": req.Prompt})`), `payment_service.go` (payload payment lengkap), `handlers.go` → `EventStream` (hanya butuh JWT apapun).

Setiap subscriber `/events/stream` (user biasa pun bisa) menerima SEMUA event: prompt mentah user lain, session_id, data payment (external_id, amount). Tidak ada kanal per-user/filter.

**Perbaikan:** batasi SSE ke role staff, atau kanal per-user; jangan publish prompt/payload penuh.

### SEC-19. 🟡 RENDAH — Token Backoffice di `localStorage` + BroadcastChannel Tanpa Verifikasi Origin

**Lokasi:** `backoffice-frontend/src/lib/api.ts` (`localStorage.setItem(ACCESS_TOKEN_KEY, ...)`, `getAuthChannel().onmessage` tanpa cek `event.origin`).

Access token disimpan di `localStorage` → bisa dicuri payload XSS apa pun. BroadcastChannel meneruskan token antar-tab tanpa validasi pesan (meski BroadcastChannel same-origin, satu XSS di origin = token tersebar). Refresh token untungnya tetap cookie HttpOnly — risiko terbatas pada access token 15 menit.

**Perbaikan:** terima risiko (dokumentasikan) atau pindah access token ke cookie HttpOnly + BFF; tambah CSP ketat di `next.config.mjs` (belum ada header security di kedua frontend).

### SEC-20. 🟡 RENDAH — Docker/Deploy: Root User, `network_mode: host`, Credential Dev Ter-commit

**Lokasi:** `backend/Dockerfile` (tanpa `USER`, jalan sebagai root), `backend/docker-compose.yml` (`POSTGRES_PASSWORD: password_aman`, `network_mode: host`), `backend/.env.example` (JWT secret default ter-commit — diperlukan untuk dev, tapi pastikan tak pernah dipakai prod; `Config.Validate` sudah menjaga JWT), `backend/uploads/` file gambar ter-commit ke git (bloat; harusnya volume + `.gitignore`).

**Perbaikan:** tambah `USER nonroot` di Dockerfile, hindari `network_mode: host` di compose produksi, `.gitignore` `backend/uploads/`, dokumentasikan rotasi credential.

### SEC-21. 🟡 RENDAH — Bug Kecil Tersebar

- `handlers.go` → `UpdateBooking()`: membandingkan error dengan string `err.Error() == "Booking not found"` — rapuh; pakai sentinel error/`errors.Is`.
- `booking_service.go` → `UpdateStatus()`: `booking, _ = s.Find(...)` mengabaikan error re-fetch → bisa mengembalikan struct kosong ke client.
- `trip_service.go` → `Create()`: `bus.Publish("trip_created", trip)` dipanggil meski `err != nil` (event palsu untuk trip gagal dibuat).
- `ai_service.go` → `refreshMemorySummary()`: `summary[len(summary)-maxChars:]` memotong byte, bisa merusak rune UTF-8 multi-byte (karakter Indonesia/emoji) di batas potong.
- `mcp_service.go` → goroutine async persist menangkap variabel loop aman, tapi tanpa batas — flood chat = ledakan goroutine (minor, dibatasi rate limit).
- `frontend` & `backoffice`: `next@14.2.35` — ada beberapa CVE Next.js 14.x yang di-patch di rilis lebih baru; jadwalkan upgrade minor terbaru + `npm audit` berkala.
- `auth_service.go` → `Register()` membalas error DB mentah (`CreateUser` duplicate email → `err.Error()` ke client via `detail`) — user enumeration tipis + bocor skema (terkait SEC-15).
- `audit.go`/`LogSecurity`: periksa kebijakan retensi log keamanan (belum ada rotasi).

---

## A. Celah Keamanan — SELESAI (Batch 25 Jun 2026)

Seluruh sembilan temuan di bawah sudah diperbaiki dan diverifikasi `go build`/`go vet`. Dicatat di sini sebagai jejak audit + acuan regresi (lihat juga `#3` soal kebutuhan automated test untuk mengunci perbaikan ini).

### SEC-1. ✅ KRITIS — Privilege Escalation lewat `/auth/register` (FIXED)

**Lokasi:** `backend/internal/services/auth_service.go` → `AuthService.Register()`.

`Register()` kini **selalu** memaksa `models.RoleUser` dan tidak lagi membaca field `role` dari body. Field `Role` dihapus dari `dto.RegisterRequest`. Pembuatan akun operator/admin dipindah ke jalur resmi terproteksi: `POST /api/v1/admin/users` (guard `Role(admin)`) → `dto.AdminCreateUserRequest` → `AuthService.CreateStaff()`. Verifikasi: register dengan `role:"admin"` tetap menghasilkan user biasa.

### SEC-2. ✅ TINGGI — IDOR pada `GET /bookings/:id` & `GET /payments/:id` (FIXED)

**Lokasi:** `booking_service.go`/`payment_service.go` (`Find(id, userID, isStaff)`), `repositories.go` (`FindBookingForUser`, `FindPaymentForUser`), `handlers.go` (`isStaff(c)`).

`Find` kini menerima `userID` + `isStaff`. Caller non-staff hanya bisa mengambil record miliknya (query difilter `user_id`; payment via join ke `bookings`). Staff (operator/admin) tetap bisa mengakses semua. Record milik user lain membalas not found.

> Verifikasi ulang 21 Jul 2026: fix utuh, tidak ada regresi. Rute `GET /bookings/:id` & `GET /payments/:id` tetap di grup protected (JWT); handler membalas 404 generik; `go build ./...` + `go vet` + `gofmt` bersih.

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

### 14. ✅ Backoffice: Error Response HTML Saat JSON Diharapkan (FIXED)

**Lokasi:** `backoffice-frontend/src/lib/api.ts` → `parseJsonEnvelope()`, `request()`.

Request sekarang memeriksa `Content-Type` dan membungkus `response.json()` dalam try-catch. Jika backend membalas HTML (502/504/nginx timeout) atau JSON rusak, client mendapat pesan user-friendly: "Server merespons dengan format yang tidak dikenal" / "Gagal membaca respons dari server".

### 15. ✅ Backoffice: Refresh Token Promise Tanpa Timeout (FIXED)

**Lokasi:** `backoffice-frontend/src/lib/api.ts` → `refreshAccessToken()`.

Refresh request kini menggunakan `AbortController` dengan timeout `10_000` ms. Jika backend hang, refresh akan abort dan request menunggu dapat reject, sehingga tidak menggantung seluruh antrean request.

---

## Ringkasan Prioritas

**Sisa pekerjaan (belum selesai):**

| Prioritas | Item | Alasan |
|---|---|---|
| 🔴 **Tinggi** | SEC-10 IDOR chat messages | Semua chat tamu/user bisa dibaca lintas akun |
| 🔴 **Tinggi** | SEC-12 Replay webhook | Wajib beres sebelum `PAYMENTS_ENABLED=true` |
| 🟠 Sedang | SEC-13/14/16/17 abuse/kebocoran | Spam order, memory DoS limiter, prompt raksasa, lintas-sesi |
| 🟠 **Tinggi** | #3 Test auth/payment/AI | Tidak ada safety net untuk kode sensitif (kini juga untuk mengunci SEC-1..SEC-4) |
| 🟡 Sedang | #4 Re-enable payment UI saat siap | Alur revenue/payment belum jalan dari UI (ikuti kontrak baru pasca SEC-3 dan set `PAYMENTS_ENABLED=true`) |
| 🟡 Sedang | #8 Isolasi guest user | Privasi antar-tamu |
| Rendah | #13 Uang float64 | Presisi (makin relevan setelah harga server-side SEC-3) |
| Rendah | #10 LLM summarization memory | Masih truncation string |

**Sudah selesai (jejak audit):**

| Item | Status |
|---|---|
| SEC-1 Privilege escalation `/auth/register` | ✅ Register paksa `RoleUser` + endpoint `admin/users` |
| SEC-2 IDOR booking/payment | ✅ `Find(id,userID,isStaff)` + repo scoped per-owner |
| SEC-11 Pax negatif booking | ✅ DTO `gte=0,lte=20` + guard `MaxBookingPax` di service |
| SEC-15 Kebocoran error internal | ✅ `ServerError` generik + log; `/health/database` & BadRequest tanpa `detail` mentah |
| SEC-3 Tampering harga/amount | ✅ Harga & amount dihitung server-side |
| SEC-4 Webhook dipalsukan | ✅ Signature wajib + `DOKU_SECRET` prod + idempotency |
| SEC-5 Upload tanpa batas + MIME ekstensi | ✅ Batas 5 MiB + sniff `DetectContentType` |
| SEC-6 Recovery info disclosure | ✅ Log ke server, pesan generik ke client |
| SEC-7 Rate limiter global | ✅ Per-IP + `AuthRateLimit` ketat untuk `/auth` |
| SEC-8 CORS hardcoded | ✅ Dari env `CORS_ALLOWED_ORIGINS` |
| SEC-9 AI body tanpa limit | ✅ `io.LimitReader` 1 MiB |
| #11 Pecah services.go | ✅ Dipecah per-domain (satu package) |
| #12 Duplikasi prompt LLM | ✅ Urutan pesan dirapikan + workflow diringkas |
| #14 Error HTML Saat JSON | ✅ Cek `Content-Type` + try-catch di `api.ts` |
| #15 Refresh Promise Timeout | ✅ AbortController 10s di `refreshAccessToken` |

> Catatan: item lama (pagination list endpoint & async logging MCP + retry) sudah selesai lebih dulu: `dto.ListQuery.Normalize()` (default 50, maks 200) dan audit log + single retry di `MCPService.Execute()`.

---

## Lihat Juga
- `architecture.md` — gambaran sistem & fitur aktif
- `backend.md` — detail service layer & integrasi
- `coding-rules.md` — konvensi agar perubahan konsisten
