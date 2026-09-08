# Audit Stream Recovery Chat SSE — B-GENUI-1 (READ-ONLY, 9 Sep 2026)

Audit read-only terhadap apa yang **tepat terjadi** saat stream SSE chat
terputus sebelum event `done` tiba di frontend. Tidak ada kode diubah.
Laporan ini memperdalam residual B-GENUI-1 yang tercatat di
[GENUI_TRAVEL_PACKAGE_AUDIT.md](GENUI_TRAVEL_PACKAGE_AUDIT.md) §4.1 dan
[known-issues.md](known-issues.md), dan menentukan mekanisme recovery minimal
yang bisa dibangun TANPA framework streaming generik, TANPA retry LLM, dan
TANPA retry otomatis `search_trips`.

> **Status 9 Sep 2026:** mekanisme minimal §6–§7 sudah diimplementasikan di
> frontend. Dokumen ini tetap merekam kondisi sebelum fix dan alasan desain.
> Recovery melakukan satu fetch history, tidak me-retry LLM/chat/`search_trips`.
> Implementasi kemudian di-harden dengan guard terminal per-turn dan replacement
> berbasis `message_id` yang idempoten; late `done`, callback berulang, rerender,
> serta Strict Mode tidak membuat pesan atau blok rekomendasi kedua.

## File yang Diaudit

| Lapisan | File |
|---|---|
| Frontend SSE client | `frontend/src/lib/api.ts` (`streamChat`, `parseSSEBlock`, `ChatStreamHandlers`, `ChatResponse`) |
| Frontend UI chat | `frontend/src/components/chat/ChatInterface.tsx` (`handleSubmit`, `onDelta`/`onDone`/`onError`, history `useEffect`) |
| Rekonstruksi history | `frontend/src/lib/chatHistory.ts` (`mapHistoryMessages`), `frontend/src/lib/packageSelection.ts` (`selectionSynced`) |
| Proxy SSE Next.js | `frontend/src/app/api/v1/chat/route.ts`, `frontend/src/lib/chatProxy.ts`, `frontend/next.config.mjs` (rewrites) |
| Backend handler SSE | `backend/internal/handlers/chat_stream_handlers.go` (`streamChat`, `send`, `chatStreamWriteDeadline`) |
| Backend handler chat/history | `backend/internal/handlers/chat_handlers.go` (`GuestChat`, `Chat`, `GuestHistory`, `ChatMessages`) |
| Backend service | `backend/internal/services/ai_service.go` (`ChatStream`, `prepareChatPreLLM`, `generateWithToolLoopStream`, `finalizeChat`, `GetGuestHistory`, `GetSessionMessages`, `ChatResult`) |
| Persistensi | `backend/internal/models/models.go` (`BaseModel.BeforeCreate`, `ChatMessage`, `ChatRecommendation`, `ChatSession.SelectedTripID`), `backend/internal/repositories/chat_repository.go` (`AddChatMessage`, `ListChatMessages`, `UpdateChatSessionSelectedTrip`) |
| Tool side-effect | `backend/internal/services/mcp_service.go` (`executeSelectPackage`, `executeCreateBooking`) |

---

## 1. Alur Saat Ini (happy path + titik kematian)

```
User submit prompt (ChatInterface.handleSubmit)
  -> id user msg  = msg-N (counter lokal, module-scope)
  -> id assistant = msg-M (placeholder, streaming:true, content:"")
  -> POST /api/v1/chat {prompt, stream:true}  (streamChat, fetch + reader)
       -> Next route handler app/api/v1/chat/route.ts (pipe, forward cookie/auth)
       -> Handler GuestChat/Chat -> streamChat handler (chat_stream_handlers.go):
            headers SSE + ResponseController + per-write deadline 10s + flush
            -> AIService.ChatStream:
                 1. FindChatSession + ownership check + slide expires_at
                 2. prepareChatPreLLM (errgroup):
                      - UpdateChatSessionActivity (slide expiry)
                      - AddChatMessage USER  (persist prompt SEBELUM LLM)
                 3. generateWithToolLoopStream:
                      tiap round GenerateStream(..., onDelta=nil) [BUG-12]
                      -> executeToolCall -> MCPService.Execute
                         (select_package / create_booking persist
                          SIDE-EFFECT ke DB SEGERA saat tool jalan)
                 4. finalizeChat:
                      - genErr -> teks fallback + AILog
                      - re-fetch session (BUG-5 fail-closed) -> selectedTripID
                      - extractRecommendedPackages + guard BUG-13
                        + create_booking guard
                      - AddChatMessage ASSISTANT + Recommendation jsonb
                        (SATU insert; id dibuat hook BeforeCreate uuid.New())
                      - refreshMemorySummary + bus.Publish workflow_completed
                      -> ChatResult{message, message_id, workflow,
                          show_recommendations, recommendation_reason,
                          recommended_packages, order_gate, selected_trip_id}
            -> send("done", result)     // SATU-satunya pembawa message_id
  -> frontend onDone: id msg-M diganti message_id server; packages/orderGate/
     workflow dipasang; completedTyping[id]=true -> kartu render
```

Titik kematian stream (semua jalur bermuara ke handler `send`):

1. `send` mengecek `ctx.Err()` dulu — request context Go **dibatalkan saat
   koneksi TCP mati**, jadi `send("done", ...)` return false tanpa menulis.
2. `c.Writer.WriteString`/`rc.Flush()` error atau timeout 10 detik
   (koneksi setengah-putus, buffer TCP penuh) → `send` return false.
3. Browser/proxy menutup response → `reader.read()` di frontend throw
   (onError) ATAU reader berakhir bersih (EOF) — lihat §2.

Kuncinya: `ChatStream` **menyelesaikan seluruh finalizeChat (termasuk INSERT
assistant message) SEBELUM handler mengirim `done`**. Urutan persist-then-done
ini bersifat satu arah: `done` terkirim ⇒ pesan pasti sudah ter-persist.
Kebalikannya TIDAK berlaku — pesan bisa ter-persist tanpa `done` pernah sampai
ke browser.


## 2. Titik Kegagalan Eksak per Lapisan

### 2.1 Frontend `streamChat` (`frontend/src/lib/api.ts`)

- fetch throw `AbortError` (user cancel / unmount) →
  `onError("Permintaan dibatalkan.")`.
- fetch throw lain → `onError("Tidak dapat terhubung ke server...")`.
- `!response.ok` / tanpa body → `onError(envelope.message)` (proxy 502 dsb.).
- `reader.read()` throw mid-stream →
  `onError("Koneksi terputus saat memuat respons. Coba lagi.")`.
- **[GAP KRITIS] Reader berakhir BERSIH (EOF) tanpa event `done`** → loop
  `for(;;){... if (done) break;}` keluar diam-diam. `streamChat` resolve,
  `finally` di `handleSubmit` menyalakan input lagi, dan **TIDAK ADA handler
  yang dipanggil**. Pesan placeholder tetap `streaming:true` dengan teks
  parsial + caret berkedut selamanya, tanpa kartu, tanpa pesan error, id tetap
  `msg-M`. Sisa blok SSE parsial di `buffer` juga dibuang diam-diam.
- Payload JSON event malformed → `catch` internal melewatkan event (stream
  lanjut) — event `done` yang corrupt pun hilang tanpa jejak (berujung ke
  kasus EOF di atas).
- **Tidak ada retry, resume, reconnect, atau Last-Event-ID apa pun.** Satu
  fetch = satu nyawa turn.

### 2.2 Proxy Next.js (`frontend/src/app/api/v1/chat/route.ts`)

- `fetch` server-side ke backend; `backendResponse.body` di-pipe langsung
  sebagai body response. Saat browser memutus koneksi, Next merobek stream
  dan (Node/undici umumnya) membatalkan fetch upstream — Go lalu melihat
  koneksi mati dan request context ter-cancel. Tapi ada jendela di mana
  backend **tidak menyadari** browser sudah pergi: backend tetap
  menyelesaikan seluruh workflow, INSERT pesan, lalu `send("done")` SUKSES
  ditulis ke socket proxy (masuk buffer) dan handler return normal. `done`
  mati di buffer proxy, browser tidak pernah menerimanya. **Topologi proxy
  ini menjadikan race A (persisted-tapi-done-hilang) jauh lebih umum
  daripada topologi direct.**

### 2.3 Backend `streamChat` handler (`chat_stream_handlers.go`)

- `ChatStream` return `err != nil` → `send("error", {...})` (kalau koneksi
  masih hidup). Catatan penting: event `error` HANYA muncul bila
  `finalizeChat` sendiri gagal — terutama INSERT assistant message gagal
  (context dibatalkan / DB error) — sehingga **event `error` ⇒ assistant
  message turn itu TIDAK ter-persist**. genErr dari LLM TIDAK memicu event
  `error`; itu diganti teks fallback di `finalizeChat` dan TETAP di-INSERT.
- Client disconnect mid-generation: request context Go ter-cancel →
  `GenerateStream` upstream ikut ter-cancel (SEC-26) → genErr →
  `finalizeChat` berjalan, TAPI semua repo call memakai ctx yang sama yang
  sudah dibatalkan → `AddChatMessage(ctx, ...)` GAGAL (`context canceled`)
  → assistant message **tidak ter-persist** (AILog juga gagal; hanya log
  server).

### 2.4 Frontend `ChatInterface` (`ChatInterface.tsx`)

- `onDone`: finalisasi + ganti id placeholder dengan `message_id`. Tidak
  idempoten — `done` ganda akan **menambah pesan duplikat** (setelah id
  berganti, `findIndex(assistantId)` gagal → cabang
  `return [...items, newMsg]` append baru). Backend hari ini mengirim `done`
  tepat sekali, jadi risiko teoretis (R-2 di audit GenUI), tapi MELEBIH
  ketika reconcile ditambahkan.
- `onError`: flush tail buffer, pertahankan teks parsial, jadikan pesan
  error, `streaming:false`. **Tidak ada fetch history. Tidak ada reconcile.
  Tidak ada flag turn-selesai.** Pesan error memakai id placeholder `msg-M`
  dan tidak terkorelasi ke baris DB mana pun.
- History `useEffect` (mount-only, deps `[]`): fetch `GET /api/v1/chat/history`
  → `mapHistoryMessages` → `setMessages` mengganti SELURUH array state. Aman
  saat mount, tapi berarti reconcile mid-session TIDAK boleh memakai efek
  ini begitu saja — replace-all akan menghapus pesan lokal yang belum
  ter-persist (guard `cancelled` StrictMode R-4 tetap aman).

## 3. Identifier yang Tersedia & Kapan Dibuat

| Identifier | Dibuat kapan | Sampai ke frontend kapan |
|---|---|---|
| `ChatMessage.ID` user | INSERT di `prepareChatPreLLM` (sebelum LLM), via `BeforeCreate` | Hanya via history (`id`), tidak pernah di SSE |
| `ChatMessage.ID` assistant (`message_id`) | INSERT di `finalizeChat` (setelah seluruh tool loop), via `BeforeCreate` | **HANYA di payload event `done`** — tidak pernah di `delta`, tidak di `error`, tidak ada event meta |
| `chat_sessions.selected_trip_id` | UPDATE SEGERA saat `executeSelectPackage` jalan (mid-loop, bukan di finalize) | Echo `done` (`selected_trip_id`) + history (`selected_trip_id`) |
| `ChatRecommendation` (jsonb) | INSERT bersama assistant message (satu baris, sekali, immutable) | `done` (`recommended_packages` dll.) + history (`recommendation`) |
| Placeholder frontend `msg-N` | Counter module-scope saat submit | Hanya lokal; TIDAK dikirim ke backend; TIDAK dipetakan ke baris DB mana pun sebelum `done` |

Konsekuensi: **sebelum `done`, frontend tidak punya cara apa pun untuk
menghubungkan pesan yang sedang di-stream dengan baris DB** — bahkan bila
backend sudah INSERT, id tidak diketahui klien. Satu-satunya korelasi yang
mungkin adalah posisional/konten: prompt user tersimpan verbatim, sehingga
"kemunculan TERAKHIR user message dengan `content` == teks prompt" di history
mengidentifikasi turn, dan assistant message SETELAHNYA adalah jawaban turn
itu.


## 4. Timing Persistensi (siapa bertahan saat putus)

| Data | Waktu persist | Bertahan saat stream putus? |
|---|---|---|
| User prompt (`ChatMessage` role user) | `prepareChatPreLLM`, sebelum LLM dipanggil | **Ya**, selalu (kecuali insert gagal → event `error`) |
| Side-effect `select_package` | Saat tool jalan, mid-loop (`UpdateChatSessionSelectedTrip`) | **Ya** — ter-persist bahkan bila teks final tidak pernah sampai |
| Side-effect `create_booking` | Saat tool jalan | **Ya** — order bisa sudah dibuat di DB saat UI menampilkan error |
| Assistant text + `Recommendation` jsonb | SATU INSERT di `finalizeChat`, SEBELUM `done` dikirim | **Ya HANYA bila INSERT sukses sebelum ctx mati** (race A). Bila ctx sudah ter-cancel sebelum INSERT → gagal (`context canceled`) → tidak ter-persist (race B) |
| `order_gate`, `workflow` | Tidak dipersist sama sekali (B-GENUI-8) | **Tidak** — hilang permanen untuk turn itu (hanya di payload `done`) |
| `selected_trip_id` echo | Dibaca fresh di `finalizeChat`; echo di `done`; direturn via history | Ya (kolom DB); echo hilang bersama `done` tapi pulih via history |

Urutan penting di `finalizeChat`: (1) genErr → fallback teks, (2) re-fetch
session, (3) hitung rekomendasi + guard, (4) INSERT assistant+metadata,
(5) memory summary + event bus, (6) return ke handler, (7) `send("done")`.
Jadi jendela race A = antara langkah 4 sukses dan langkah 7 gagal — plus,
pada topologi proxy, jendela itu MELEBAR karena backend bisa menulis `done`
"sukses" ke socket proxy yang sudah tidak punya pembaca (§2.2).

## 5. Analisis Race Condition

### A. Disconnect sebelum `done`, backend SUDAH persist pesan final

Terjadi bila: INSERT assistant sukses, lalu `send("done")` gagal (ctx
ter-cancel / write error), ATAU `done` ditulis ke socket proxy yang
sebenarnya sudah ditinggalkan browser. Kondisi DB: user message + assistant
message + `recommendation` jsonb (+ mungkin `selected_trip_id` baru) lengkap.
Kondisi UI: teks parsial/placeholder (atau pesan error onError), kartu tidak
render, seleksi lokal tidak sinkron, `order_gate`/`workflow` hilang.

**Bisa direkonsiliasi: YA.** History memuat semua yang dibutuhkan: id,
konten utuh, `recommendation`, `selected_trip_id`. Tidak ada yang hilang
secara permanen kecuali `order_gate`/`workflow` (tidak dipersist — di luar
scope, B-GENUI-8). Ini SATU-satunya recovery yang sah tanpa memanggil ulang
LLM.

### B. Disconnect dan backend BELUM persist pesan final

Terjadi bila: ctx ter-cancel sebelum/menembus INSERT (user abort manual,
putus jaringan early), atau INSERT gagal (event `error` terkirim), atau
`prepareChatPreLLM` gagal. Kondisi DB: hanya user message (+ side-effect tool
yang sudah jalan — `selected_trip_id`, bahkan ORDER). Kondisi UI: teks
parsial + caret / pesan error.

**Bisa direkonsiliasi: TIDAK, dan memang tidak boleh.** Tidak ada baris
assistant untuk turn itu; satu-satunya cara "memulihkan" adalah memanggil
ulang LLM — **dilarang oleh task ini** dan memang benar (jawaban LLM tidak
deterministik, biaya ganda). Mekanisme recovery harus mendeteksi kondisi ini
(assistant message turn tidak ada di history) dan membiarkan pesan error
lokal tetap.

**Peringatan khusus:** turn yang menjalankan `create_booking` lalu putus
sebelum INSERT bisa meninggalkan ORDER ter-persist tanpa pesan assistant
apa pun. UI menampilkan error, user mungkin retry order → `order_gate`
duplicate tidak pernah sampai (butuh `done`). Ini gap nyata; recovery minimal
TIDAK memperbaikinya (tidak menyentuh booking — batas task), tapi
didokumentasikan agar tidak dianggap sudah tertangani.

### C. Disconnect, frontend mulai fetch history, lalu event SSE telat tiba

Dengan transport hari ini **kasus ini nyaris mustahil**: `onError` hanya
dipicu setelah `reader.read()` throw, yang berarti reader mati — tidak ada
event yang bisa tiba lagi dari response yang sama; tidak ada koneksi SSE
kedua (tidak ada retry/reconnect). Varian nyata yang ADA hari ini:
EOF-tanpa-`done` (§2.1) yang TIDAK memicu callback apa pun. Kalau nanti
reconcile dipasang di jalur EOF/onError, dan ternyata `done` sempat lolos
sebelum EOF diproses (race render), finalisasi ganda harus tidak merusak.
Desain guard: flag per-turn "sudah difinalisasi/direkonsiliasi" + dedup by
`message_id` server, dan `onDone` idempoten. Scenario C adalah alasan guard
itu wajib ada SEBELUM menambah mekanisme retry apa pun di masa depan — bukan
alasan menunda reconcile.

### D. Stream sukses normal

`done` tiba → `onDone` finalisasi: id placeholder → `message_id`, teks utuh,
packages/orderGate/workflow dipasang, `completedTyping[finalId]=true`,
seleksi sinkron dari `selected_trip_id` echo. Tidak ada fetch history. Id
identik dengan yang akan dikeluarkan history → reload mulus. **Reconcile
yang ditambahkan ke onError tidak boleh menyentuh jalur ini** (jangan fetch
history setelah done sukses).

### E. Rekomendasi alternatif (4C) ter-persist, lalu stream putus

Turn alternatif: `search_trips(alternative=true)` sukses → guard BUG-13
tidak suppress (`hasSearchTripsAlternative`) → `Recommendation` dengan
`recommendation_reason:"alternative"` INSERT bersama pesan → (disconnect) →
`done` (yang membawa paket alternatif + echo `selected_trip_id`) hilang.

**Bisa direkonsiliasi: YA, penuh.** History mengembalikan `recommendation`
pesan itu (set kartu alternatif) DAN `selected_trip_id` sesi — pilihan lama
**tetap utuh** karena kolom `chat_sessions.selected_trip_id` tidak
tersentuh oleh turn alternatif. `mapHistoryMessages` + `selectionSynced`
merekonstruksi kartu alternatif + status kartu terpilih tanpa
`search_trips`/LLM. Set rekomendasi turn SEBELUMNYA juga tetap utuh
(metadata per-pesan, immutable). Yang hilang hanya `workflow`/`order_gate`
(tidak dipersist) — sama dengan keterbatasan reload.

### Ringkasan race

| Race | Pesan assistant di DB? | Kartu? | Seleksi? | Recovery yang mungkin |
|---|---|---|---|---|
| A | Ya (utuh + metadata) | Ya via history | Ya via history | Reconcile history — ganti pesan error lokal |
| B | Tidak | Tidak | Mungkin (side-effect) | Tidak ada (jangan reconstruct); pertahankan error lokal |
| C | Tergantung A/B | — | — | Guard idempotensi + dedup id; tak ada late-event nyata hari ini |
| D | Ya | Ya via `done` | Ya via echo | Tidak perlu; jangan sentuh jalur sukses |
| E | Ya (+reason alternative) | Ya via history | Utuh (selected_trip_id tak berubah) | Reconcile history — sama dengan A |

## 6. Mekanisme Recovery Minimal yang Direkomendasikan

Prinsip: **reconcile state saja, bukan resume stream.** Satu fetch history
setelah kegagalan, logika merge murni di client, nol perubahan schema, nol
endpoint baru, nol framework. Tidak ada retry LLM, tidak ada retry
`search_trips`, tidak menyentuh booking/auth.

1. **Deteksi EOF-tanpa-`done`** (`frontend/src/lib/api.ts`). Saat reader
   berakhir tanpa `done` pernah diproses, panggil `onError` (pesan seperti
   "Koneksi terputus sebelum respons selesai.") — atau callback terpisah bila
   ingin membedakan. Ini menutup gap §2.1: hari ini kasus ini diam total.
2. **Reconcile on-error** (`frontend/src/components/chat/ChatInterface.tsx`).
   Di `onError` (dan jalur EOF baru), fetch `GET /api/v1/chat/history` SEKALI.
   Identifikasi turn: cari KEMUNCULAN TERAKHIR user message di history dengan
   `content === teks prompt turn ini`; pesan assistant SETELAHNYA (bila ada)
   adalah jawaban turn ini.
3. **Merge, bukan replace-all** (helper murni baru di
   `frontend/src/lib/chatHistory.ts`, sekelas `mapHistoryMessages`):
   - Assistant message turn ditemukan (race A/E) → GANTI pesan error/parsial
     lokal pada posisi itu dengan versi server: id server sebagai React key,
     konten utuh, `packages`/`showRecommendations`/`recommendationReason`
     dari `recommendation`, `shouldAnimate:false`,
     `completedTyping[id]=true`. Sinkron seleksi via
     `selectionSynced(s, data.selected_trip_id ?? null)`.
   - Tidak ditemukan (race B) → biarkan pesan error lokal; jangan coba apa
     pun lagi otomatis (satu fetch saja; tanpa polling).
   - Pesan lain (lebih lama) tidak boleh tersentuh; pesan yang sudah punya
     id server dikecualikan dari kandidat merge (dedup by id).
4. **Guard idempotensi** untuk race C: flag per-turn "sudah difinalisasi/
   direkonsiliasi"; `onDone` yang telat setelah reconcile harus no-op bila
   `message_id` sudah ada di state (menutup juga celah R-2 double-`done`
   saat menambah mekanisme ini).
5. **Opsional (bukan kebutuhan minimal)**: kirim `message_id` lebih awal —
   backend men-generate uuid assistant SEBELUM tool loop dan memancarkannya
   di event SSE kecil (mis. `meta`) + memakai uuid itu saat INSERT. Ini
   menghapus heuristik match-by-prompt, tapi menyentuh
   `ai_service.go`/`chat_stream_handlers.go`/kontrak SSE — hanya lakukan
   bila heuristik konten terbukti tidak cukup. Prompt user disimpan verbatim,
   jadi match konten (kemunculan terakhir) + posisi sudah deterministik;
   prompt duplikat persis dua kali berurutan tetap aman bila match selalu
   pada kemunculan terakhir.

Batas recovery yang jujur (tidak dikejar mekanisme minimal): `order_gate`
dan `workflow` tetap hilang untuk turn yang putus (B-GENUI-8 — pekerjaan
terpisah); order yang sudah ter-create saat race B tetap tidak terlihat di
chat (butuh solusi sisi booking, di luar scope); user abort disengaja tetap
direkonsiliasi bila backend sempat selesai (perilaku yang diinginkan —
jawaban tidak hilang hanya karena user menekan cancel ketika backend hampir
selesai).

## 7. File yang Benar-Benar Perlu Dimodifikasi (untuk recovery minimal)

| File | Perubahan | Wajib? |
|---|---|---|
| `frontend/src/lib/api.ts` | `streamChat`: deteksi EOF-tanpa-`done` → panggil `onError`/callback; (opsional) laporkan apakah `done` pernah diproses | Wajib |
| `frontend/src/components/chat/ChatInterface.tsx` | `onError`: fetch history sekali + helper merge + guard flag per-turn; jangan ubah `onDone` jalur sukses | Wajib |
| `frontend/src/lib/chatHistory.ts` | Helper merge murni baru (mis. `reconcileFailedTurn`) — ganti pesan error lokal dengan baris server, dedup by id, pertahankan pesan lama | Wajib |
| `frontend/src/lib/chatHistory.test.ts` | Kasus: race A (reconcile sukses), race B (tidak ada baris → error tetap), race E (alternatif + seleksi utuh), prompt duplikat, dedup id | Wajib |
| `backend/internal/handlers/chat_stream_handlers.go` + `backend/internal/services/ai_service.go` | HANYA untuk opsi `message_id` awal via event `meta` (§6 butir 5) | Opsional |
| Backend lainnya (routes/models/repo) | **Tidak ada** — endpoint history sudah mengembalikan semua data yang dibutuhkan | Tidak |

## 8. Yang Sengaja TIDAK Dilakukan (batas task ini)

- Tidak ada framework/retry/resume/reconnect SSE generik.
- Tidak ada retry LLM atau `search_trips` otomatis.
- Tidak ada perubahan booking, order, atau authentication.
- Saat audit dibuat belum ada perubahan kode; status implementasi terbaru ada
  pada catatan di bagian awal dokumen.


