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

## 10. AI Memory Summary: Truncation Kasar

**Lokasi:** `backend/internal/services/services.go` -> `refreshMemorySummary()`

Ringkasan memory bukan hasil summarization LLM — hanya **potong string** mentah ambil `AI_MEMORY_MAX_CHARS` (1800) karakter terakhir dari gabungan semua pesan. Konteks lama bisa terpotong di tengah kalimat.

**Yang bisa ditingkatkan:** panggil LLM untuk meringkas, bukan slice string.

---

## 11. `services.go` Monolitik (~940 baris)

**Lokasi:** `backend/internal/services/services.go`

Semua service (Auth, MCP, AI, Trip, Booking, Payment, Log, Analytics) ada di satu file. Sudah cukup besar dan akan makin sulit dirawat.

**Saran refactor (low-risk):** pecah per domain jadi `auth_service.go`, `ai_service.go`, `payment_service.go`, dst dalam package `services` yang sama. Tidak mengubah API, hanya memindah kode.

---

## 12. Tidak Ada Pagination Nyata di List Endpoint

**Lokasi:** `backend/internal/repositories/repositories.go` -> `ListTrips`, `ListBookings`, dll

`TripListQuery` punya `Limit`/`Offset` tapi `ListBookings`, `ListAILogs`, `ListToolCalls` mengembalikan semua row tanpa batas. Akan jadi masalah saat data tumbuh.

---

## Ringkasan Prioritas

| Prioritas | Item | Alasan |
|---|---|---|
| Tinggi | #3 Test untuk auth/payment/AI | Tidak ada safety net untuk kode keamanan-sensitif |
| Tinggi | #4 Sambungkan booking UI | Alur revenue belum jalan dari UI |
| Sedang | #6+#1 Sambungkan SSE + tool MCP nyata | Effort besar yang belum berbuah UX |
| Sedang | #8 Isolasi guest user | Privasi antar-tamu |
| Rendah | #11 Pecah services.go | Maintainability |
| Rendah | #10, #12 | Peningkatan kualitas |

---

## Lihat Juga
- `architecture.md` — gambaran sistem & fitur aktif
- `backend.md` — detail service layer & integrasi
- `coding-rules.md` — konvensi agar perubahan konsisten
