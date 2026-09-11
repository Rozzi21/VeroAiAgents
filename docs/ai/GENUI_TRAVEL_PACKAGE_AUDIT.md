# Audit GenUI Travel Package — Chat & Komponen Rekomendasi (refresh 9 Sep 2026)

Dokumen ini me-refresh audit 6 Sep 2026 terhadap cara komponen Travel Package
(kartu rekomendasi, panel detail, order gate) **dihasilkan, ditransport,
disimpan, dan dirender** oleh kode saat ini. Audit lama mendahului fondasi
persistensi GenUI yang dikerjakan di hari yang sama
(`chat_messages.recommendation`, `message_id`, `mapHistoryMessages`); temuan
lamanya dicatat ulang di §5 beserta statusnya. Cleanup 9 Sep 2026 kemudian
menghapus pembacaan `update_order_draft` yang sudah mati dari panel detail.
Tetap tidak ada "GenUI protocol" generik di repo — yang ada adalah flag +
payload spesifik (`show_recommendations` + `recommended_packages` +
`order_gate`) plus metadata persisten per pesan, dirender kondisional di
`ChatInterface`.

## File yang Diaudit

| Lapisan | File |
|---|---|
| Skema respons AI | `backend/internal/services/ai_service.go` (`ChatResult`, `ChatOrderGate`, `MessageID`) |
| DTO request | `backend/internal/dto/dto.go` (`ChatRequest{session_id, prompt, stream}`) |
| Tool loop & finalisasi | `ai_service.go` (`Chat`, `ChatStream`, `generateWithToolLoop*`, `finalizeChat`, `extractRecommendedPackages`, `chatOrderGateFromToolResults`) |
| Tool MCP | `backend/internal/mcp/tools.go`, `backend/internal/services/mcp_service.go` (`executeSearchTrips`, `executeSelectPackage`, `executeCollectOrderDetail`, `executeCreateBooking`) |
| Handler HTTP/SSE | `backend/internal/handlers/chat_handlers.go`, `chat_stream_handlers.go`, `sse_handlers.go` |
| Persistensi | `backend/internal/models/models.go` (`ChatSession.SelectedTripID`, `ChatMessage.Recommendation`, `ChatRecommendation`) |
| Frontend | `frontend/src/components/chat/ChatInterface.tsx`, `frontend/src/lib/api.ts` (`streamChat`, `ChatResponse`), `frontend/src/lib/chatHistory.ts`, `frontend/src/lib/orderGate.ts`, `frontend/src/lib/chatProxy.ts`, `frontend/src/app/api/v1/chat/route.ts`, `frontend/src/components/cards/RecommendationCard.tsx` |

---

## 1. Arsitektur Saat Ini

### 1.1 Tidak ada dispatcher GenUI generik

Tidak ada registry/dispatcher komponen, tidak ada tipe `component`, tidak ada
`component_id` dari backend. UI dinamis muncul lewat **tiga mekanisme hardcoded**:

1. **Kartu rekomendasi** — flag `show_recommendations` + array
   `recommended_packages` di `ChatResult`; persist di
   `chat_messages.recommendation` (jsonb). Dirender `PackageRecommendations` →
   `RecommendationCard` (grid 3 kolom).
2. **Order gate** — `order_gate {code, auth_required, order_id?}` di
   `ChatResult`. Dirender `OrderGateBlock` via `orderGateView()`
   (`lib/orderGate.ts`). Pola GenUI paling matang yang ada: code stabil milik
   backend, UI hanya branch pada code, teks LLM tidak pernah di-parse, code tak
   dikenal → render nothing.
3. **Panel detail paket** — `PackageDetailPanel` (state lokal
   `selectedPackage`), dibuka dari klik kartu. Murni client-side; membaca
   `msg.workflow` hanya untuk status order dari `create_booking`. Tampilan
   tanggal/pax memakai default paket karena draft tidak dipersist.

### 1.2 Alur data end-to-end

```
User prompt
  -> POST /api/v1/chat {prompt, stream:true}        (frontend: streamChat, lib/api.ts)
  -> Next.js route proxy (app/api/v1/chat/route.ts; forwardedChatHeaders: authorization/cookie/x-request-id)
  -> Handler GuestChat/Chat (OptionalAuth + cookie vero_chat_session)
  -> AIService.ChatStream
       -> prepareChatPreLLM (tulis user ChatMessage + slide expiry, errgroup)
       -> generateWithToolLoopStream:
            tiap round: GenerateStream(messages, tools, onDelta=nil)  [BUG-12: delta round tool-selection sengaja dibuang]
            -> executeToolCall -> MCPService.Execute -> ToolResult{tool,status,data}
            bila LLM berhenti minta tool: return TANPA streaming live — teks utuh baru tiba di event `done`
            (delta live HANYA mengalir bila MaxToolCallRounds (5) habis: forced-final GenerateStream(..., onDelta))
       -> finalizeChat:
            - fallback text bila genErr (+AILog tracking code)
            - booking-claim guard (responseClaimsOrderCreated)
            - backstop "already selected" (failedSearchTripsAlreadySelected, AIW-7)
            - re-fetch session (BUG-5 fail-closed) -> selectedTripID
            - extractRecommendedPackages(toolResults, selectedTripID)
            - guard BUG-13: selectedTripID != nil -> suppress rekomendasi, kecuali hasil alternative eksplisit
            - guard: create_booking sukses -> suppress rekomendasi
            - persist assistant ChatMessage + Recommendation (jsonb) bila ada paket
            - ChatResult{message, message_id, workflow, show_recommendations, recommendation_reason, recommended_packages, order_gate, selected_trip_id}
  -> SSE `done` membawa ChatResult utuh (SessionID json:"-" tidak dikirim)
  -> frontend onDone: ganti id placeholder dengan message_id server, pasang packages/orderGate/workflow, set completedTyping
  -> render: teks (caret/TypingText) -> kartu (gated completedTyping) -> OrderGateBlock
```
### 1.3 Skema respons AI (`ChatResult`, `ai_service.go:52`)

```go
type ChatResult struct {
    SessionID            uuid.UUID      `json:"-"`                     // TIDAK pernah sampai ke client
    Message              string         `json:"message"`
    MessageID            uuid.UUID      `json:"message_id,omitempty"`  // id stabil ChatMessage (6 Sep 2026)
    Workflow             []ToolResult   `json:"workflow"`
    ShowRecommendations  bool           `json:"show_recommendations"`
    RecommendationReason string         `json:"recommendation_reason"` // "initial"|"alternative"|""
    RecommendedPackages  []models.Trip  `json:"recommended_packages"`
    OrderGate            *ChatOrderGate `json:"order_gate,omitempty"`
}
```

`recommended_packages` diisi `extractRecommendedPackages` dari
`Data["packages"]` hasil `search_trips` — hanya subset field (id, title, slug,
destination, location, category, duration, summary, price→BasePrice,
highlights, image_url). Field pricing AIW-5 (`adult_price`, `discount_price`,
`child_price`, dst.) yang dikirim ke LLM **tidak** ikut ke kartu (B-GENUI-5).

### 1.4 Event SSE

- **Chat SSE** (`POST /chat`, stream): `delta` (fragmen teks — dalam praktik
  nyaris tidak pernah mengalir, lihat B-GENUI-7), `done` (ChatResult), `error`
  (pesan ramah). Komponen (kartu/gate) **selalu** datang di `done`, tidak
  pernah saat streaming.
- **Event bus SSE** (`GET /events/stream`): operator-only (SEC-18), event
  `ai_response`/`workflow_completed`/`mcp_tool_executed`/heartbeat/`reconnect`.
  Frontend customer **tidak subscribe** (tidak ada `EventSource` di
  `frontend/src`). Bus ini tidak mempengaruhi render komponen chat.

### 1.5 Persistensi (fondasi GenUI, 6 Sep 2026)

- `chat_messages.recommendation` (jsonb, `models.ChatRecommendation`) menyimpan
  `{show_recommendations, recommendation_reason, recommended_packages}` per
  pesan assistant; ditulis sekali di `finalizeChat` bersama insert pesan,
  immutable setelahnya. Pesan lama/tanpa rekomendasi ber-NULL (backward
  compatible).
- `ChatMessage.ID` (uuid server) dikirim sebagai `message_id` di `done` dan
  `id` di history → React key + anchor stabil yang identik setelah reload.
- `GuestHistory` mengembalikan `{id, role, content, recommendation?}`
  (SessionID sengaja tidak dikirim). `GetSessionMessages` (authenticated)
  mengembalikan `ChatMessage` utuh — `recommendation` ikut via serializer json.
- Reload: `mapHistoryMessages` (`lib/chatHistory.ts`, PURE) memasang kembali
  kartu pada pesan yang sama — tanpa `search_trips`, tanpa LLM, tanpa fetch
  tambahan.
- **Yang BELUM dipersist:** `workflow` dan `order_gate` per pesan. Keduanya
  hilang saat reload (B-GENUI-8).

---

## 2. Jawaban atas 13 Pertanyaan

1. **Bagaimana AI "meminta" komponen Travel Package?**
   Tidak secara langsung. LLM memanggil tool `search_trips` (OpenAI function
   calling, katalog di `mcp/tools.go`). Backend (`finalizeChat` +
   `extractRecommendedPackages`) mengonversi `ToolResult` sukses menjadi
   `show_recommendations:true` + `recommended_packages`. Komponen adalah
   keputusan backend dari tool result, BUKAN permintaan eksplisit LLM dan
   BUKAN parse teks.

2. **Komponen dibuat saat streaming atau setelah `done`?**
   Setelah `done`. Selama stream hanya ada `delta` teks (itupun jarang).
   `recommended_packages`, `show_recommendations`, `order_gate`, `workflow`,
   `message_id` semuanya hanya ada di payload `done`.

3. **Bisakah komponen muncul sebelum teks AI selesai?**
   Tidak. Ganda-terkunci: (a) transport — data komponen baru tiba di event
   `done`; (b) render — `PackageRecommendations` di-gate `completedTyping`,
   yang hanya diset di `onDone` (atau setelah `TypingText` selesai pada jalur
   fallback). `OrderGateBlock` tidak di-gate `completedTyping`, tapi datanya
   juga baru ada di `done`, jadi tetap setelah teks.

4. **Bisakah komponen yang sama muncul beberapa kali?**
   Ya, dalam dua arti: (a) tiap turn yang memanggil `search_trips` sukses
   menghasilkan blok kartu baru pada pesan assistant turn itu — percakapan bisa
   berisi banyak blok kartu; (b) paket yang sama bisa muncul di beberapa blok
   turn berbeda (tidak ada dedup antar-turn; dedup AIW-3 hanya intra-loop).
   Suppressor: `selectedTripID != nil` (BUG-13), create_booking sukses, dan
   fail-closed bila state sesi tak diketahui (BUG-5).

5. **Apakah setiap respons AI otomatis memicu rekomendasi?**
   Tidak. Hanya bila LLM memanggil `search_trips` dan tool sukses. Bila paket
   sudah terpilih, hanya hasil dengan `alternative=true` yang boleh tampil.
   Pemicu tetap judgment LLM, bukan parse teks di frontend.

6. **Bagaimana pemilihan paket disimpan?**
   Dua state dengan fungsi berbeda:
   - **Server-side**: tool `select_package(trip_id)` → `executeSelectPackage` →
     `UpdateChatSessionSelectedTrip` → kolom `chat_sessions.selected_trip_id`
     (nullable uuid, index). Overwrite tanpa syarat — pindah paket diizinkan.
     Tidak ada cara mengosongkan (tidak ada tool "cancel selection").
   - **Client-side**: `selectedPackage` hanya mengontrol panel detail. Aksi
     terpisah "Pilih Paket Ini" memanggil `POST /chat/select-package`, lalu
     state kartu berubah hanya setelah backend mengembalikan
     `selected_trip_id`. History dan event `done` menyinkronkan state itu.

7. **Apakah memilih paket mencegah kartu rekomendasi berikutnya?**
   Ya untuk pencarian biasa. `executeSearchTrips` menolak pencarian
   non-alternatif ketika paket sudah terpilih; `finalizeChat` juga men-suppress
   hasil biasa. Hasil eksplisit `alternative=true` tetap boleh menjadi set
   rekomendasi baru tanpa menghapus pilihan aktif.
8. **Bagaimana sistem mendeteksi permintaan paket lain?**
   System prompt menyuruh LLM memanggil
   `search_trips(query, alternative=true)` saat user eksplisit meminta
   alternatif. Tool result membawa `reason:"alternative"`; backend memakai
   sinyal terstruktur itu untuk mengizinkan set baru. Frontend tidak melakukan
   keyword matching. Tetap tidak ada tool "cancel selection".

9. **Apakah teks assistant di-parse untuk memicu UI?**
   Tidak, dan ini prinsip yang ditegakkan: `orderGateView` hanya membaca
   `code`; `PackageRecommendations` hanya membaca flag backend. Satu-satunya
   parse teks adalah arah terbalik: backend mem-parse teks LLM untuk *menekan*
   klaim berbahaya (`responseClaimsOrderCreated`,
   `responseMentionsSelectionOptions`) — guard defensif, bukan trigger UI.
   `PackageDetailPanel` membaca `msg.workflow` (payload tool, bukan prosa)
   hanya untuk status `create_booking`.

10. **Identifier stabil apa yang ada?**
    - `ChatMessage.ID` (uuid, server-owned) — kini sampai ke client:
      `message_id` di payload `done` dan `id` di history. Dipakai sebagai React
      key dan anchor rekomendasi persisten. Fallback `msg-N` (counter modul
      `nextMessageId()`) hanya untuk payload lama tanpa id.
    - `Trip.ID` (uuid) — key kartu; stabil per paket, bukan per-instance
      komponen.
    - `ChatSession.ID` — tidak pernah dikirim (`json:"-"`; cookie HttpOnly
      `vero_chat_session` adalah satu-satunya bukti ownership guest).
    - Tetap tidak ada `component_id`, `instance_id`, atau `render_key` dari
      backend.

11. **Bagaimana retry/reconnect SSE mempengaruhi komponen?**
    Chat SSE tidak punya retry/reconnect/resume. EOF atau error sebelum `done`
    memicu satu fetch history; `reconcileFailedTurn` mengganti placeholder bila
    pesan assistant sudah persisten. Bila belum persisten, teks parsial + error
    lokal dipertahankan tanpa polling atau retry LLM/`search_trips`. Guard
    terminal membuat late `done` dan callback berulang no-op. `/events/stream`
    tetap tidak dipakai frontend customer.

12. **Bagaimana reload percakapan mempengaruhi komponen?**
    - **Kartu rekomendasi: pulih** dari `chat_messages.recommendation` via
      `GET /api/v1/chat/history` + `mapHistoryMessages` (pure, idempoten;
      pesan lama tanpa metadata tetap text-only).
    - **`order_gate`: hilang** — tidak dipersist dan tidak dikembalikan
      history; blok auth-gate/tracking lenyap setelah reload.
    - **`workflow`: hilang** — `PackageDetailPanel` kehilangan status
      "Order Berhasil"; tanggal/pax memang memakai default paket.
    - Id pesan stabil (`ChatMessage.ID`), animasi mengetik dimatikan untuk
      history (`shouldAnimate:false`, semua `completedTyping:true`) sehingga
      kartu history langsung tampil tanpa menunggu.

13. **Protokol GenUI apa yang sudah ada dan harus dipakai ulang?**
    Pola **`order_gate`** (4 Sep 2026): structured code backend-owned
    (`code` + field minimal), diturunkan murni dari tool result
    (`chatOrderGateFromToolResults`, precedence eksplisit
    created > limited > duplicate), dikirim di payload `done`, UI branch pada
    code via view-mapper murni (`orderGateView`), code tak dikenal → render
    nothing, teks LLM tidak pernah jadi sinyal. Ditambah pola persistensi
    **`ChatRecommendation`** (6 Sep 2026): metadata komponen ditulis bersama
    pesan (satu baris DB, immutable) dan direkonstruksi murni dari payload
    history. Keduanya adalah template untuk komponen GenUI baru.
---

## 3. Lifecycle Komponen Saat Ini (ringkas)

1. User kirim prompt → pesan user + placeholder assistant kosong
   (`streaming:true`).
2. Round tool (`GenerateStream` dengan `onDelta=nil` — delta dibuang, BUG-12):
   LLM panggil `search_trips`/`select_package`/dst.
3. Setelah `search_trips`, event `recommendation` dapat memasang kartu segera.
4. Round final: provider content diteruskan sebagai `delta` dan dirender live.
5. `done`: id placeholder diganti `message_id`; persist/workflow/orderGate
   difinalkan tanpa animasi teks lokal.
6. Klik kartu → panel detail (client-only; tidak mengubah state server).
7. Reload → kartu pulih dari DB; `order_gate` + `workflow` hilang.

---

## 4. Bug & Risiko Saat Ini

### 4.1 Bug/gap fungsional

- **B-GENUI-1: tertutup 9 Sep 2026.** Stream putus setelah persist direkonsiliasi
  sekali dari history; stream putus sebelum persist tetap menampilkan error
  lokal tanpa retry.
- **B-GENUI-3: tertutup 9 Sep 2026.** Tombol pilih menjalankan endpoint
  backend-authoritative; buka detail tetap tidak memilih.
- **B-GENUI-4: tertutup 9 Sep 2026.** Hasil `alternative=true` tetap tampil
  sambil mempertahankan pilihan aktif. Cancel selection tetap tidak ada.
- **B-GENUI-5: tertutup 9 Sep 2026.** Field pricing dewasa/anak, diskon,
  destination, dan duration mengalir ke kartu dan persistensi.
- **B-GENUI-6: tertutup 9 Sep 2026.** Pembacaan `update_order_draft` yang
  disabled dihapus. Panel tetap menampilkan default `1 Dewasa` dan durasi
  paket; tidak ada kontrak draft persisten yang bisa dipulihkan.
- **B-GENUI-7: tertutup P1.1 (11 Sep 2026).** `GenerateStreamEvents` meneruskan
  content delta provider nyata pada round final; sinyal tool-call menjaga
  preamble/argumen tool tidak tampil. Event `recommendation` dapat merender
  kartu segera setelah `search_trips`, sementara round final masih streaming.
  Live request tidak lagi menjalankan `TypingText`; persist assistant tetap
  selesai sebelum `done`.
- **B-GENUI-8 (sedang): `order_gate` dan `workflow` tidak dipersist.** Reload
  menghilangkan auth-gate/tracking block dan konteks panel (§2.12). Backend
  punya `check_order_status` tapi tidak diekspos ke history.
### 4.2 Risiko duplicate-render

- **R-1 (lintas-turn, by design):** dua turn berurutan dapat merender blok kartu
  identik (paket sama) — duplikasi visual lintas-pesan; tidak ada dedup
  antar-turn. Intra-turn aman: `extractRecommendedPackages` mengambil result
  `search_trips` pertama yang cocok lalu return.
- **R-2 (tertutup 9 Sep 2026):** guard terminal + replacement by `message_id`
  membuat `done` ganda/terlambat no-op.
- **R-3 (reload + stream baru):** namespace id kini campuran — pesan history
  memakai uuid server, pesan baru memakai `msg-N` sampai `done` menggantinya
  dengan `message_id`. Tidak konflik (counter monotonik + uuid unik), tapi
  selama jendela pre-`done` pesan assistant belum punya id stabil; bila stream
  gagal total, pesan error memakai id placeholder dan tidak terkorelasi dengan
  baris DB mana pun.
- **R-4 (StrictMode):** history-load `useEffect` punya guard `cancelled`, aman
  dari double-fetch React 18 StrictMode. Streaming tidak di-effect, aman.

### 4.3 Risiko state-management

- **S-1 (tertutup 9 Sep 2026):** `selected_trip_id` backend adalah sumber
  kebenaran state kartu; `selectedPackage` hanya state panel detail.
- **S-2 (tertutup 6 Sep 2026):** id pesan kini stabil (`message_id`);
  komponen tertaut ke baris DB. Fallback `msg-N` hanya untuk data legacy.
- **S-3 (masih terbuka):** `workflow` hanya di memori; hilang saat reload.
  `PackageDetailPanel` meng-scan seluruh `messages` untuk hasil aktif
  `create_booking` (O(n·m) per render panel).
- **S-4 (masih terbuka):** `order_gate` per pesan hilang saat reload; tidak ada
  endpoint untuk mengambil ulang "gate terakhir" sesi (backend punya
  `check_order_status` tapi tidak diekspos ke history).
- **S-5 (tertutup 9 Sep 2026):** hasil alternatif eksplisit dikecualikan dari
  suppressor tanpa melonggarkan pencarian biasa.

---

## 5. Status Temuan Audit 6 Sep 2026

| Temuan lama | Status per 9 Sep 2026 |
|---|---|
| B-GENUI-1 komponen hilang saat stream putus | **Tertutup setelah persist** — satu fetch history + reconcile idempoten; sebelum persist tetap error lokal tanpa retry |
| B-GENUI-2 komponen tidak persisten | **Tertutup untuk kartu** (`chat_messages.recommendation`); `order_gate`/`workflow` masih ephemeral (B-GENUI-8) |
| Tak ada id pesan stabil (S-2) | **Tertutup** — `message_id` di `done` + `id` di history |
| B-GENUI-3 klik kartu ≠ seleksi | **Tertutup 9 Sep 2026** — aksi detail dan pilih terpisah; pilih backend-authoritative |
| B-GENUI-4 alternatif mustahil pasca-seleksi | **Tertutup 9 Sep 2026** — hasil `alternative=true` membentuk set baru |
| B-GENUI-5 kartu kehilangan pricing AIW-5 | **Tertutup 9 Sep 2026** — field adult/child normal + diskon dipetakan ke `models.Trip`, ikut `ChatResult`/persistensi/history, lalu dirender kartu bersama destination + duration |
| B-GENUI-6 pembacaan draft tool mati | **Tertutup 9 Sep 2026** — pembacaan `update_order_draft` dihapus; default panel tidak berubah |
---

## 6. Rekomendasi Perubahan Minimal

Diurut dari paling kecil & paling aman. Semua memakai ulang pola
`order_gate`/`ChatRecommendation`, bukan framework baru.

1. **Persist `order_gate` per pesan (menutup separuh B-GENUI-8).** Tambahkan ke
   metadata persisten (perluas `ChatRecommendation` atau kolom jsonb terpisah),
   kembalikan di history, render `OrderGateBlock` dari data history.
2. **Putuskan nasib streaming (B-GENUI-7).** Pilih salah satu: (a) stream round
   final sungguhan dengan deteksi dua-fase (buffer sampai terbukti bukan tool
   round, lalu flush), atau (b) hapus mesin `delta` dan formaliskan
   `TypingText` sebagai satu-satunya jalur. Status quo membayar kompleksitas
   streaming tanpa manfaat TTFT di jalur umum.
3. **Jangan diubah:** tetap larang parse teks assistant sebagai sinyal UI;
   tetap kirim komponen hanya di `done` (atau event SSE bertipe baru, bukan
   inline di `delta`); tetap fail-closed bila state sesi tak diketahui (BUG-5);
   `create_payment` tetap disabled.

---

## 7. Yang Sengaja TIDAK Ada (jangan diasumsikan)

- Tidak ada `component_id`/registry/dispatcher GenUI generik.
- Tidak ada retry/resume/reconnect pada chat SSE (client maupun server).
- Tidak ada persistensi `workflow`/`order_gate` (hanya rekomendasi yang
  persist).
- Tidak ada aksi booking langsung dari UI kartu/panel (semua lewat chat/LLM).
- Tidak ada mekanisme "cancel selection" / reset `selected_trip_id`.
- Frontend customer tidak subscribe `/events/stream`.





