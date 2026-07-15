# Vero Travel — Customer Frontend

Antarmuka chat AI untuk pelanggan/tamu. Pengunjung mengobrol dengan asisten travel otonom (Vero) dan mendapatkan rekomendasi paket trip berikut halaman detailnya.

- Framework: Next.js 14 (App Router) + React 18 + TypeScript
- Styling: TailwindCSS, ikon lucide-react
- Port dev: `http://localhost:3000`

## Fitur Aktif

Aplikasi ini sengaja ringkas dan hanya memakai **dua endpoint backend**:

| Fitur | Endpoint | Lokasi |
|---|---|---|
| Chat AI (guest, tanpa login) | `POST /api/v1/chat` | `src/components/chat/ChatInterface.tsx` |
| Detail paket trip | `GET /api/v1/packages/:id` | `src/app/trip/[id]/page.tsx` |

Alur singkat:

1. Pengguna mengetik prompt di halaman utama. `ChatInterface` mengirim `{ prompt, session_id? }` ke `POST /api/v1/chat`.
2. Respons berisi `{ session_id, message, recommended_packages[] }`. `session_id` disimpan di state untuk melanjutkan percakapan.
3. Pesan asisten ditampilkan dengan efek mengetik (animasi client-side; bukan streaming/SSE), dan paket rekomendasi dirender sebagai kartu inline.
4. Membuka `/trip/[id]` memuat detail paket via `GET /api/v1/packages/:id`. Panel detail di dalam chat memakai objek paket dari respons chat, jadi tidak memanggil endpoint lagi.

## Yang Belum Aktif (UI saja / placeholder)

Agar dokumentasi jujur, berikut elemen UI yang tampil tapi belum tersambung ke backend:

- **Tombol "Book This Trip" dan "Add to Plan"** di halaman detail trip — belum ada handler, belum memanggil API booking.
- **Teks "Secure AI-powered checkout"** — hanya hiasan; tidak ada flow pembayaran/QRIS di frontend. Ini selaras dengan backend yang sengaja menonaktifkan `create_payment` di workflow chat.
- **Link sidebar** "Past Journeys", "Saved Places", "Settings", dan "My Profile" — masih `href="#"` / tanpa handler.
- **Tombol "+" di input chat** — belum ada handler.
- **Tidak ada** auth, EventSource/SSE, maupun checkout di aplikasi customer ini.

## Konfigurasi & Proxy API

- Permintaan client memakai path relatif `/api/...`. `next.config.mjs` mem-proxy `/api/:path*` ke `http://localhost:8080/api/:path*`, sehingga aman dari CORS saat dev.
- `NEXT_PUBLIC_API_BASE_URL` (default `http://localhost:8080`) dipakai untuk membangun URL aset gambar paket dan untuk pemanggilan sisi server.

Pastikan backend berjalan di `http://localhost:8080` sebelum menjalankan frontend.

## Menjalankan

```bash
npm install
npm run dev
```

Buka `http://localhost:3000`.

Skrip lain:

```bash
npm run build   # build produksi
npm run start   # jalankan hasil build
npm run lint    # ESLint
```
