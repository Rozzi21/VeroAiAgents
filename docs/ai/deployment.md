# Deployment

Panduan deployment, environment variables, infrastruktur, dan integrasi pihak ketiga untuk VeroAiTravelAgents. Hanya backend yang punya pipeline deploy formal; kedua frontend Next.js di-deploy terpisah (belum ada konfigurasi deploy khusus di repo).

## Komponen yang Di-deploy

| Komponen | Artefak | Status deploy |
|---|---|---|
| `backend/` | Binary Go statis (`vero-travel-api`) | Punya Dockerfile + docker-compose + panduan systemd (`backend/docs/server-deploy.md`) |
| `frontend/` | Next.js build (`next build` → `next start`) | Belum ada konfigurasi deploy di repo |
| `backoffice-frontend/` | Next.js build | Belum ada konfigurasi deploy di repo |
| PostgreSQL 16 | Container / instance server | Via docker-compose atau instance eksternal |

## Environment Variables (Backend)

Sumber kebenaran: `backend/internal/config/config.go` (fungsi `Load()`), contoh di `backend/.env.example`.

### Aplikasi
| Variabel | Default | Keterangan |
|---|---|---|
| `APP_ENV` | `development` | `production` mengaktifkan gin release mode, cookie secure default, dan guard `Config.Validate()` |
| `PORT` | `8080` | Port HTTP |

### Database
| Variabel | Default | Keterangan |
|---|---|---|
| `DATABASE_HOST` | `localhost` | Host PostgreSQL |
| `DATABASE_PORT` | `5432` | Port |
| `DATABASE_USER` | `vero_user` | User |
| `DATABASE_PASSWORD` | _(kosong)_ | Wajib diisi |
| `DATABASE_NAME` | `vero_travel` | Nama DB |
| `DATABASE_SSLMODE` | `disable` | Mode SSL |
| `DATABASE_URL` | _(kosong)_ | DSN penuh; jika kosong dirakit dari field di atas. Jika mengandung `YOUR_PASSWORD` juga dirakit ulang |

### JWT / Auth
| Variabel | Default | Keterangan |
|---|---|---|
| `JWT_SECRET` | `super_secret_vero_travel` | **Wajib diganti di production.** `Config.Validate()` menolak start jika kosong/default saat `APP_ENV=production` |
| `JWT_ACCESS_TTL_MINUTES` | `15` | Masa hidup access token |
| `JWT_REFRESH_TTL_HOURS` | `720` | Masa hidup refresh token (30 hari) |
| `JWT_COOKIE_NAME` | `refresh_token` | Nama cookie refresh HttpOnly |
| `JWT_COOKIE_SECURE` | `APP_ENV==production` | Cookie hanya via HTTPS |
| `JWT_COOKIE_SAME_SITE` | `Strict` | `Lax`/`None`/`Strict`. `None` otomatis memaksa `Secure=true` |

### AI (OpenAI-compatible)
| Variabel | Default | Keterangan |
|---|---|---|
| `AI_API_KEY` | _(kosong)_ | Kosong → fallback lokal (demo tetap jalan) |
| `AI_BASE_URL` | `https://api.openai.com/v1` | Endpoint provider; klien memanggil `{AI_BASE_URL}/chat/completions` |
| `AI_MODEL` | `gpt-4o-mini` | Nama model |
| `AI_TEMPERATURE` | `0.4` | Temperature |
| `AI_TIMEOUT_SECONDS` | `35` | Timeout request AI |
| `AI_CONTEXT_RECENT_MESSAGES` | `8` | Jumlah pesan terakhir sebagai konteks |
| `AI_MEMORY_SUMMARY_AFTER` | `12` | Ambang pesan sebelum ringkasan memory dibuat |
| `AI_MEMORY_MAX_CHARS` | `1800` | Batas panjang ringkasan memory |

### Integrasi Eksternal
| Variabel | Default | Keterangan |
|---|---|---|
| `DOKU_CLIENT_ID` | _(kosong)_ | Client ID DOKU |
| `PAYMENTS_ENABLED` | `false` | Feature flag DOKU/payment flow. Default `false` keeps manual admin order processing and makes payment endpoints return 503. Set `true` only when re-enabling DOKU. |
| `DOKU_SECRET` | _(kosong)_ | Secret verifikasi signature webhook HMAC-SHA256. **Wajib di production hanya saat `PAYMENTS_ENABLED=true`** — `Config.Validate()` menolak start bila kosong saat DOKU diaktifkan (SEC-4) |
| `N8N_WEBHOOK` | _(kosong)_ | URL webhook N8N untuk otomasi pasca-pembayaran |
| `CORS_ALLOWED_ORIGINS` | _(localhost dev)_ | Daftar origin diizinkan CORS, dipisah koma (mis. `https://app.vero.com,https://admin.vero.com`). Fallback ke `http://localhost:3000,:3001,:5173` bila kosong (SEC-8) |


### Environment Variables (Frontend)
Kedua Next.js app memakai satu variabel publik opsional:

| Variabel | Default | Dipakai untuk |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:8080` | Base URL aset gambar + pemanggilan sisi server. Request browser tetap relatif (`/api/...`) lewat proxy `next.config.mjs` |

## Build & Release Flow

### Backend (lokal)
```bash
cd backend
cp .env.example .env       # isi DATABASE_PASSWORD, JWT_SECRET, AI_*
go mod tidy
go run ./cmd/server        # atau: go build -o vero-travel-api ./cmd/server
```

### Backend (Docker)
`backend/Dockerfile` adalah multi-stage build (CGO_ENABLED=0, binary statis). `backend/docker-compose.yml` menjalankan API saja; **default dev memakai PostgreSQL lokal di host `:5432`** (via `host.docker.internal`):

```bash
cd backend
docker compose up --build
```

Pastikan Postgres lokal sudah jalan di `:5432` dan kredensial di `.env` cocok. API container memakai `network_mode: host` (Linux) sehingga `localhost:5432` di `.env` langsung terbaca — Postgres lokal yang hanya bind `127.0.0.1` tetap bisa diakses.

Jika ingin Postgres bawaan Docker (port host `:5433`), jalankan dengan profile:

```bash
docker compose --profile docker-db up --build
```

Lalu override env API ke service `postgres` (lihat komentar di `docker-compose.yml`).

### Backend (server / systemd)
Panduan lengkap di `backend/docs/server-deploy.md`:
1. Install Go 1.25.x di server.
2. Clone/rsync repo ke `/opt/vero-travel-agents`.
3. `cp .env.example .env` lalu set `APP_ENV=production`, `JWT_SECRET` kuat, koneksi DB ke `127.0.0.1`.
4. `go build -o vero-travel-api ./cmd/server`.
5. Pasang systemd unit dari `backend/scripts/vero-travel-api.service`.
6. `systemctl enable --now vero-travel-api`.
7. Untuk production: taruh Nginx/Caddy di depan untuk HTTPS, jangan ekspos `:8080` langsung.

### Frontend (kedua app)
```bash
npm install
npm run build
npm run start    # production
# atau npm run dev untuk development
```
Keduanya default ke port 3000 — jalankan salah satu dengan `--port` berbeda (mis. backoffice di 3001) untuk menghindari bentrok.

## Infrastruktur

```mermaid
flowchart LR
  subgraph client [Browser]
    FE[Customer FE :3000]
    BO[Backoffice FE :3001]
  end
  subgraph server [Server]
    API[vero-travel-api :8080]
    PG[(PostgreSQL 16 :5432)]
    UP[/uploads volume/]
  end
  EXT_AI[AI Provider (OpenAI-compatible)]
  EXT_DOKU[DOKU Payment]
  EXT_N8N[N8N Automation]

  FE -->|"proxy /api/*"| API
  BO -->|"proxy /api/*"| API
  API --> PG
  API --> UP
  API -->|chat completions| EXT_AI
  EXT_DOKU -->|webhook| API
  API -->|trigger| EXT_N8N
```

- **Uploads**: backend menyimpan file ke `./uploads/trips/` dan menyajikannya via `router.Static("/uploads", ...)`. Di server, folder ini perlu persistensi (volume) dan kepemilikan yang benar (`chown www-data` di panduan systemd).
- **CORS**: origin dibaca dari env `CORS_ALLOWED_ORIGINS` (CSV) via `config.go` lalu diteruskan ke `middlewares.CORS(cfg.CORSAllowedOrigins)`. Fallback ke `http://localhost:3000`, `:3001`, `:5173` bila env kosong. Set origin production via env saat deploy (tidak perlu ubah kode lagi — SEC-8).

## Service Pihak Ketiga

| Service | Peran | Titik integrasi |
|---|---|---|
| **PostgreSQL 16** | Database utama | `database/database.go` |
| **AI Provider (OpenAI-compatible)** | Generasi respons chat AI | `ai/ai_client.go`, `services.go` `generateWithAI()` |
| **DOKU** | Payment gateway (QRIS/VA) | `services.go` `PaymentService.Webhook()` + verifikasi HMAC |
| **N8N** | Otomasi workflow pasca-pembayaran | `services.go` `triggerN8N()` |

## Checklist Production

1. `APP_ENV=production`.
2. `JWT_SECRET` panjang dan acak (backend menolak start jika tidak).
3. `DATABASE_PASSWORD` kuat; pertimbangkan `DATABASE_SSLMODE=require`.
4. `DOKU_SECRET` **wajib** diisi di production saat `PAYMENTS_ENABLED=true` (backend menolak start bila kosong); webhook tanpa signature valid ditolak (SEC-4). Default `PAYMENTS_ENABLED=false` untuk flow order manual.
5. HTTPS via reverse proxy; set `JWT_COOKIE_SECURE=true`.
6. Jika frontend beda domain dari API: `JWT_COOKIE_SAME_SITE=None` (otomatis Secure) + tambahkan origin ke CORS.
7. Volume persisten untuk `uploads/`.
8. Ganti semua nilai dev default di `.env.example`.
