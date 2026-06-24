# Known Issues & Technical Debt

Catatan jujur tentang keterbatasan, technical debt, dan area yang perlu diperhatikan di VeroAiTravelAgents. Ditujukan untuk agent AI berikutnya agar tidak salah asumsi tentang apa yang "sudah jalan" vs "masih placeholder".

> Prinsip: dokumen ini sengaja menyoroti yang BELUM beres. Untuk gambaran fitur yang sudah aktif, lihat `architecture.md` dan `api.md`.

---

## 1. MCP Tools Masih Mock (Bukan Integrasi Nyata)

**Lokasi:** `backend/internal/services/services.go` -> `MCPService.mock()`

Semua tool MCP mengembalikan data dummy hardcoded, bukan hasil pencarian/komputasi nyata:

- `search_destination` -> selalu `["Tokyo", "Kyoto", "Osaka", "Bali"]`
- `search_hotels` -> selalu `["Aman Kyoto", "Hoshinoya Tokyo", "Bali Ocean Villa"]`
- `calculate_budget` -> selalu `5400 USD`
- `generate_itinerary` -> 3 hari statis

**Dampak:** Workflow chat terlihat "pintar" tapi konteks tool tidak mencerminkan input user. Yang benar-benar dinamis hanyalah respons LLM akhir (`generateWithAI`) dan pemilihan paket dari katalog DB (`selectRecommendedPackages`).

**Yang perlu dilakukan:** Ganti `mock()` dengan implementasi nyata (panggil API destinasi/hotel, hitung budget dari data paket). Pertahankan signature `Execute()` agar logging/retry tetap jalan.

---

## 2. `create_payment` Sengaja Dinonaktifkan

**Lokasi:** `backend/internal/services/services.go` (workflow steps), `backend/internal/mcp/tools.go` (`Enabled: false`)

Ini **keputusan desain, bukan bug**. Tool `create_payment` dikeluarkan dari pipeline chat agar AI tidak menjanjikan/menyebut pembayaran (QRIS) sebelum ada booking nyata. `send_whatsapp` juga `Enabled: false`.

**Jangan** mengaktifkan kembali tanpa lebih dulu menyambungkan alur booking end-to-end di frontend. Lihat komentar di `mcp/tools.go` `Catalog()`.

---

## 3. Tidak Ada Automated Test

**Lokasi:** seluruh repo

Tidak ada `*_test.go` maupun test JS/TS. Verifikasi saat ini hanya `go build`, `gofmt`, dan `tsc --noEmit`.

**Area paling berisiko tanpa test (prioritas bila menambah test):**
1. `AuthService.Refresh()` — rotasi token, reuse detection, revoke-all.
2. `PaymentService.Webhook()` — verifikasi HMAC signature.
3. `AIService.Chat()` — orkestrasi workflow + fallback.

---

## 4. Booking & Payment: Backend Siap, Frontend Belum

**Lokasi:** `frontend/src/app/trip/[id]/page.tsx`

Backend punya endpoint `POST /api/v1/bookings`, `POST /api/v1/payments/create`, dan webhook DOKU yang berfungsi. Namun:

- Tombol "Book This Trip" dan "Add to Plan" di customer frontend **tidak punya handler** — tidak memanggil API.
- Teks "Secure AI-powered checkout" hanya hiasan.
- Tidak ada UI checkout/QRIS di mana pun.

**Dampak:** Booking hanya bisa dibuat lewat API langsung (mis. Postman), bukan dari UI. Alur revenue belum tersambung end-to-end.

---

## 5. Backoffice: Banyak Halaman Placeholder

**Lokasi:** `backoffice-frontend/src/app/`

- **Dashboard** (`on-development-panel.tsx`) -> layar "On Development", tidak memanggil `analytics/dashboard`.
- **`/orders`, `/settings`, `/trips/[id]`** -> semuanya me-render `CurrentTripsScreen` (layar list trip yang sama), belum punya implementasi sendiri.
- **Mock data** di `backoffice-frontend/src/lib/data.ts` (`travelCards`, `orders`, `payments`, `workflowSteps`) **tidak dipakai** komponen mana pun.

**Yang benar-benar jalan di backoffice:** auth + CRUD paket + upload media. Selain itu placeholder.

---

## 6. Endpoint Backend yang Belum Dikonsumsi Frontend

Backend mengekspos endpoint yang belum dipakai UI mana pun:

- `GET /api/v1/events/stream` (SSE) — **tidak ada** EventSource di kedua frontend. Padahal seluruh mekanisme event bus + publish dibangun untuk ini.
- `GET /api/v1/analytics/dashboard` — tidak dipanggil backoffice.
- `GET /api/v1/logs`, `/logs/workflows`, `/logs/tool-calls` — tidak dipanggil.
- `GET /api/v1/bookings`, `/bookings/:id` — tidak dipanggil.
- `GET /api/v1/chat/sessions`, `/chat/:id/messages` — tidak dipanggil (customer chat menyimpan session_id hanya di state React).

**Dampak:** Effort SSE realtime saat ini "terbuang" dari sisi UX karena tidak ada konsumen. Peluang besar: sambungkan SSE ke customer chat untuk progress workflow realtime.

---

## 7. Event Bus In-Memory: Tidak Tahan Restart & Tidak Multi-Instance

**Lokasi:** `backend/internal/events/bus.go`

Event bus memakai map channel in-memory:
- Event **hilang saat restart** (tidak ada persistensi).
- **Tidak bisa multi-instance** — kalau backend di-scale horizontal, klien SSE di instance A tidak menerima event dari instance B.
- Publish **non-blocking** (`select { case ch <- event: default: }`) — jika channel buffer (32) penuh, event **di-drop diam-diam**.

**Yang perlu dilakukan bila scale:** ganti ke Redis Pub/Sub atau message broker. Untuk sekarang (single instance) cukup.

---

## 8. Guest Chat: Satu User "Guest Traveler" Dibagi Semua Tamu

**Lokasi:** `backend/internal/services/services.go` -> `AuthService.GuestUser()`

`GuestUser()` memakai `FirstOrCreateUser` dengan email tetap `guest@vero.local`. Artinya **semua tamu berbagi satu record user**. ChatSession dibedakan per session_id, tapi semua dimiliki user guest yang sama.

**Dampak:** `GET /api/v1/chat/sessions` untuk guest akan mengembalikan sesi semua tamu bila endpoint itu nanti dipakai. Privasi/isolasi antar-tamu belum ada.

---

## 9. Konfigurasi Secret di `.env.example` adalah Nilai Dev

**Lokasi:** `backend/.env.example`

`DATABASE_PASSWORD=password_aman`, `JWT_SECRET=super_secret_vero_travel` adalah nilai dev. Sejak hardening, `Config.Validate()` menolak start bila `APP_ENV=production` dan `JWT_SECRET` kosong/default — tapi `DATABASE_PASSWORD` default **tidak** divalidasi.

**Catatan:** `.env` aktual milik developer berisi AI key nyata (provider sumopod, model qwen). Jangan commit `.env`.

---

## 10. AI Memory Summary: Masih Truncation (Bukan LLM Summarization)

**Lokasi:** `backend/internal/services/services.go` -> `refreshMemorySummary()`

Ringkasan memory bukan hasil summarization LLM — hanya **potong string** mentah ambil `AI_MEMORY_MAX_CHARS` (1800) karakter terakhir dari gabungan pesan. Konteks lama bisa terpotong di tengah kalimat.

**Sudah dioptimasi:** method ini sekarang memakai `TailChatMessages()` untuk mengambil hanya pesan terakhir (estimasi `AIMemoryMaxChars / 200` pesan) alih-alih memuat SEMUA pesan sesi. Ini menghindari loading ribuan row pada sesi panjang. Namun, pendekatan truncation-nya sendiri belum diganti.

**Yang bisa ditingkatkan:** panggil LLM untuk meringkas, bukan slice string.

---

## 11. `services.go` Monolitik (~940 baris)

**Lokasi:** `backend/internal/services/services.go`

Semua service (Auth, MCP, AI, Trip, Booking, Payment, Log, Analytics) ada di satu file. Sudah cukup besar dan akan makin sulit dirawat.

**Saran refactor (low-risk):** pecah per domain jadi `auth_service.go`, `ai_service.go`, `payment_service.go`, dst dalam package `services` yang sama. Tidak mengubah API, hanya memindah kode.

---

## 12. ✅ Pagination di List Endpoint (RESOLVED)

**Lokasi:** `backend/internal/repositories/repositories.go`, `backend/internal/dto/dto.go`

**Sebelumnya:** `ListBookings`, `ListAILogs`, `ListToolCalls` mengembalikan semua row tanpa batas.

**Sekarang:** ketiga method menerima `dto.ListQuery` (`Limit`/`Offset`) yang dinormalisasi via `Normalize()` — default 50, maks 200. Handler memanggil `ShouldBindQuery` + `Normalize()` sebelum meneruskan ke repo. `TripListQuery` punya `Limit`/`Offset` sendiri (belum memakai `Normalize()`, backward-compatible).

**Catatan:** belum ada total count di response, jadi frontend belum bisa menghitung jumlah halaman total. Bila perlu, tambahkan method `Count*()` di repo dan field `total` di envelope.

---

## 13. ✅ Async Logging MCP: Fire-and-Forget (RESOLVED)

**Lokasi:** `backend/internal/services/services.go` -> `MCPService.Execute()`

**Masalah sebelumnya:** goroutine fire-and-forget mengabaikan semua error DB — log tool call dan AI log bisa hilang diam-diam.

**Sekarang:** goroutine tetap async (tidak memblokir chat), tetapi:
1. Error di-**log via audit log** (`auth.LogSecurity`) dengan event `tool_call_persist_failed` / `ai_log_persist_failed` sehingga operator bisa mendeteksi kegagalan persistensi.
2. **Single retry** dengan delay 500ms untuk menangani transient DB issue.

**Catatan:** ini bukan solusi sempurna — tetap bukan replacement untuk proper test dan persistent queue. Tapi log tidak lagi hilang "diam-diam" tanpa jejak audit.

---

## 14. Rate Limiter Global (Bukan Per-IP/Client)

**Lokasi:** `backend/internal/middlewares/middlewares.go` -> `RateLimit()`

```go
limiter := rate.NewLimiter(rate.Every(time.Second), 20)
```

Satu `Limiter` dibagi **seluruh client**. Artinya 20 req/detik adalah batas **kumulatif** — satu client bisa menghabiskan kuota semua user. Seharusnya per-IP atau per-user menggunakan `sync.Map` of `*rate.Limiter`.

**Dampak di production:** traffic wajar dari beberapa user concurrent bisa memicu `429 Too Many Requests` secara tidak adil.

---

## 15. CORS Origins Hardcoded ke `localhost`

**Lokasi:** `backend/internal/middlewares/middlewares.go` -> `CORS()`

```go
AllowOrigins: []string{"http://localhost:3000", "http://localhost:3001", "http://localhost:5173"},
```

Origin hanya `localhost` — **tidak ada production domain**. Backend tidak bisa menerima request dari domain production manapun tanpa mengubah kode. Seharusnya dibaca dari environment variable (mis. `CORS_ALLOWED_ORIGINS`).

**Dampak:** deploy production tanpa mengubah kode ini = frontend tidak bisa memanggil API (CORS blocked).

---

## 16. Recovery Middleware Mengekspos Detail Panic

**Lokasi:** `backend/internal/middlewares/middlewares.go` -> `Recovery()`

```go
utils.Error(c, http.StatusInternalServerError, "Unexpected server error", gin.H{
    "panic": recovered,
})
```

Detail panic (stack trace, nama file, baris kode) dikirim ke client dalam response JSON. Ini **information disclosure** — attacker mendapat insight internal aplikasi.

**Yang perlu dilakukan:** log panic ke server log, kirim generic message ke client tanpa detail.

---

## 17. AI Client: Response Body Tidak Dibatasi Ukurannya

**Lokasi:** `backend/internal/ai/ai_client.go` -> `Generate()`

```go
json.NewDecoder(res.Body).Decode(&raw)
```

Seluruh response body di-decode tanpa `http.MaxBytesReader` atau limit lain. Jika AI provider mengembalikan response sangat besar (error page HTML, streaming stuck), ini bisa menghabiskan memory.

**Saran:** gunakan `io.LimitReader(res.Body, maxBytes)` sebelum decode, atau set `http.Client` timeout yang lebih ketat.

---

## 18. `services.go` Sudah ~971 Baris (Lebih Besar dari Catatan #11)

**Lokasi:** `backend/internal/services/services.go`

Update dari #11: file sekarang **971 baris** (sebelumnya dicatat ~940). Pertumbuhan terus-menerus. Prioritas refactor tetap rendah tapi akan makin mahal bila ditunda.

---

## 19. Backoffice: Error Handling Mengasumsi Response Selalu JSON

**Lokasi:** `backoffice-frontend/src/lib/api.ts` -> `request()`

```go
const payload = (await response.json()) as Envelope<T>;
```

Semua response dipaksa parse sebagai JSON. Jika backend mengembalikan HTML error page (nginx 502, timeout proxy), `response.json()` akan throw `SyntaxError` yang tidak ter-handle dengan baik — user melihat error teknis bukan pesan yang bermakna.

**Saran:** cek `Content-Type` header sebelum parse, atau wrap dalam try-catch yang menghasilkan pesan user-friendly.

---

## 20. Backoffice: Refresh Token Promise Shared Tanpa Timeout

**Lokasi:** `backoffice-frontend/src/lib/api.ts` -> `refreshAccessToken()`

```go
if (refreshPromise) {
    return refreshPromise;
}
```

Jika refresh endpoint hang (mis. backend mati), `refreshPromise` tidak pernah resolve. Semua request berikutnya yang menunggu promise ini juga hang tanpa batas waktu.

**Saran:** tambahkan timeout (mis. 10 detik) yang me-reject promise jika refresh belum selesai.

---

## Ringkasan Prioritas

| Prioritas | Item | Alasan |
|---|---|---|
| **Tinggi** | #3 Test untuk auth/payment/AI | Tidak ada safety net untuk kode keamanan-sensitif |
| **Tinggi** | #4 Sambungkan booking UI | Alur revenue belum jalan dari UI |
| **Tinggi** | #15 CORS hardcoded localhost | Deploy production terblokir tanpa ubah kode |
| **Tinggi** | #16 Recovery middleware info disclosure | Panic detail dikirim ke client |
| Sedang | #6+#1 Sambungkan SSE + tool MCP nyata | Effort besar yang belum berbuah UX |
| Sedang | #8 Isolasi guest user | Privasi antar-tamu |
| Sedang | #14 Rate limiter global | Traffic multi-user terbatasi secara tidak adil |
| Sedang | #17 AI response body tanpa limit | Potensi memory exhaustion |
| Sedang | #20 Refresh promise tanpa timeout | UI bisa hang tanpa batas |
| Sedang | #19 Backoffice error handling asumsi JSON | Error teknis bocor ke user |
| Rendah | #11/#18 Pecah services.go (971 baris) | Maintainability |
| Rendah | #10 LLM summarization untuk memory | Masih truncation string |
| ✅ Selesai | #12 Pagination list endpoint | Sudah diimplementasi |
| ✅ Selesai | #13 Async logging MCP + retry | Sudah ada audit log + single retry |

---

## Lihat Juga
- `architecture.md` — gambaran sistem & fitur aktif
- `backend.md` — detail service layer & integrasi
- `coding-rules.md` — konvensi agar perubahan konsisten