# Audit GenUI Travel Package — Chat & Komponen Rekomendasi (READ-ONLY, refresh 9 Sep 2026)

Dokumen ini me-refresh audit 6 Sep 2026 terhadap cara komponen Travel Package
(kartu rekomendasi, panel detail, order gate) **dihasilkan, ditransport,
disimpan, dan dirender** oleh kode saat ini. Audit lama mendahului fondasi
persistensi GenUI yang dikerjakan di hari yang sama
(`chat_messages.recommendation`, `message_id`, `mapHistoryMessages`); temuan
lamanya dicatat ulang di §5 beserta statusnya. Tidak ada kode yang diubah.
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
   `msg.workflow` untuk draft pax/tanggal dan status order (sebagian sudah
   mati — lihat B-GENUI-6).

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
            - guard BUG-13: selectedTripID != nil -> suppress rekomendasi (tanpa syarat alternative)
            - guard: create_booking sukses -> suppress rekomendasi
            - persist assistant ChatMessage + Recommendation (jsonb) bila ada paket
            - ChatResult{message, message_id, workflow, show_recommendations, recommendation_reason, recommended_packages, order_gate}
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
   Tidak. Hanya bila LLM memanggil `search_trips`, tool sukses, dan tidak ada
   paket terpilih. System prompt melarang memanggil `search_trips` sebelum
   setiap respons, tapi pemicu tetap probabilistik (judgment LLM), bukan
   deterministik.

6. **Bagaimana pemilihan paket disimpan?**
   Dua level, terpisah dan tidak sinkron:
   - **Server-side**: tool `select_package(trip_id)` → `executeSelectPackage` →
     `UpdateChatSessionSelectedTrip` → kolom `chat_sessions.selected_trip_id`
     (nullable uuid, index). Overwrite tanpa syarat — pindah paket diizinkan.
     Tidak ada cara mengosongkan (tidak ada tool "cancel selection").
   - **Client-side**: klik kartu → `setSelectedPackage(trip)` — hanya membuka
     `PackageDetailPanel`. **Klik kartu TIDAK memanggil `select_package`**;
     seleksi server-side hanya terjadi bila LLM memutuskan memanggil tool itu
     (B-GENUI-3).

7. **Apakah memilih paket mencegah kartu rekomendasi berikutnya?**
   Ya, di backend: `finalizeChat` men-suppress rekomendasi setiap kali
   `selectedTripID != nil` (BUG-13, tanpa syarat `alternative`).
   `executeSearchTrips` juga menolak pencarian non-alternatif
   (`"a package is already selected"` + `selected_trip_title`). Di frontend
   tidak ada state "sudah memilih" — frontend pasif mengikuti flag.
8. **Bagaimana sistem mendeteksi permintaan paket lain?**
   Sepenuhnya judgment LLM dari teks user: system prompt menyuruh
   `search_trips(query, alternative=true)` saat user eksplisit minta
   alternatif. Tapi setelah `selectedTripID` terisi, hasil alternatif **tetap
   di-suppress** guard BUG-13 → kartu alternatif tidak pernah tampil
   pasca-seleksi (B-GENUI-4). Tidak ada structured signal dan tidak ada tool
   "cancel selection".

9. **Apakah teks assistant di-parse untuk memicu UI?**
   Tidak, dan ini prinsip yang ditegakkan: `orderGateView` hanya membaca
   `code`; `PackageRecommendations` hanya membaca flag backend. Satu-satunya
   parse teks adalah arah terbalik: backend mem-parse teks LLM untuk *menekan*
   klaim berbahaya (`responseClaimsOrderCreated`,
   `responseMentionsSelectionOptions`) — guard defensif, bukan trigger UI.
   Pengecualian kedua: `PackageDetailPanel` membaca `msg.workflow` (payload
   tool, bukan prosa) untuk draft pax/tanggal/status order.

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
    Chat SSE **tidak punya retry/reconnect/resume sama sekali** (fetch reader
    mentah di `streamChat`, tanpa auto-retry). Koneksi putus mid-stream →
    `onError` → teks parsial dipertahankan + pesan error ditambahkan, dan event
    `done` hilang permanen untuk sesi itu. Bedanya dengan sebelum fondasi
    persistensi: backend SUDAH mem-persist pesan + rekomendasi sebelum `done`
    dikirim, jadi **reload** merekonsiliasi (kartu muncul lagi dari DB). Tidak
    ada auto-reconcile in-session (B-GENUI-1 residual). Abort manual
    (`AbortController`) sama: tidak ada resume. `/events/stream` punya
    auto-reconnect (EventSource + event `reconnect`, BUG-4) tapi tidak dipakai
    frontend customer.

12. **Bagaimana reload percakapan mempengaruhi komponen?**
    - **Kartu rekomendasi: pulih** dari `chat_messages.recommendation` via
      `GET /api/v1/chat/history` + `mapHistoryMessages` (pure, idempoten;
      pesan lama tanpa metadata tetap text-only).
    - **`order_gate`: hilang** — tidak dipersist dan tidak dikembalikan
      history; blok auth-gate/tracking lenyap setelah reload.
    - **`workflow`: hilang** — `PackageDetailPanel` kembali ke default
      pax/tanggal dan kehilangan status "Order Berhasil".
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
3. Round final: umumnya TANPA delta live (B-GENUI-7); teks utuh tiba di `done`.
4. `done`: `setMessages` finalisasi — id placeholder diganti `message_id`
   server, packages/workflow/orderGate dipasang, `shouldAnimate` true bila tak
   ada delta → `TypingText` mengetik; `completedTyping` diset.
5. Render: teks → kartu (gated) → OrderGateBlock.
6. Klik kartu → panel detail (client-only; tidak mengubah state server).
7. Reload → kartu pulih dari DB; `order_gate` + `workflow` hilang.

---

## 4. Bug & Risiko Saat Ini

### 4.1 Bug/gap fungsional

- **B-GENUI-1 residual (sedang): tak ada rekonsiliasi in-session saat stream
  putus.** `done` hilang → komponen turn itu tidak dirender sampai user reload
  manual (reload kini berfungsi untuk kartu). Tidak ada auto-fetch history pada
  `onError`. Catatan: stream yang putus SEBELUM persist memang tidak
  meninggalkan jejak dan tidak boleh direkonstruksi klien.
- **B-GENUI-3 (sedang, masih terbuka): klik kartu ≠ seleksi paket.** Klik hanya
  membuka panel; `selected_trip_id` di server hanya berubah bila LLM memanggil
  `select_package`. User bisa melihat paket X di panel sementara server
  menganggap belum ada pilihan (atau pilihan lain).
- **B-GENUI-4 (sedang, masih terbuka): alternatif paket mustahil setelah
  seleksi.** Guard BUG-13 suppress rekomendasi selama `selectedTripID != nil`,
  termasuk saat LLM benar memanggil `search_trips(alternative=true)`. Jalur
  "lihat alternatif lain" yang ditawarkan backstop/prompt tidak pernah
  menghasilkan kartu — hanya teks. Tidak ada "batalkan pilihan"
  (SelectedTripID tak bisa di-null-kan via tool manapun).
- **B-GENUI-5 (rendah, masih terbuka): kartu kehilangan field pricing AIW-5.**
  `extractRecommendedPackages` hanya memetakan subset lama (`price`→`BasePrice`);
  diskon/child price yang sudah dihitung backend tidak sampai ke kartu.
- **B-GENUI-6 (rendah, baru): draft pax/tanggal di `PackageDetailPanel` mati.**
  Panel mencari `wf.tool === "update_order_draft"` dengan field flat
  (`data.adult_pax` dst.), padahal tool itu `Enabled:false` sejak lama;
  penggantinya `collect_order_detail` mengembalikan detail **bersarang** di
  `data.draft`, yang tidak dibaca panel. Akibatnya
  `draftPaxAdult/draftPaxChild/draftDate` selalu default (1/0/"Flexible").
  Status "Order Berhasil" masih hidup karena `create_booking` memang
  mengembalikan `data.booking_id`.
- **B-GENUI-7 (sedang, baru): delta live nyaris tidak pernah mengalir.** Sejak
  fix BUG-12, SEMUA round tool memakai `GenerateStream(..., nil)`; bila LLM
  berhenti minta tool sebelum round habis, teks tidak di-stream — `done`
  membawa teks utuh dan frontend mensimulasikan ketikan via `TypingText`.
  Event `delta` hanya mengalir pada forced-final setelah `MaxToolCallRounds`
  (5) habis. Seluruh mesin streaming frontend (buffer rAF, caret) praktis
  jarang terpakai; TTFT jalur umum tidak lebih baik dari non-stream.
- **B-GENUI-8 (sedang): `order_gate` dan `workflow` tidak dipersist.** Reload
  menghilangkan auth-gate/tracking block dan konteks panel (§2.12). Backend
  punya `check_order_status` tapi tidak diekspos ke history.
### 4.2 Risiko duplicate-render

- **R-1 (lintas-turn, by design):** dua turn berurutan dapat merender blok kartu
  identik (paket sama) — duplikasi visual lintas-pesan; tidak ada dedup
  antar-turn. Intra-turn aman: `extractRecommendedPackages` mengambil result
  `search_trips` pertama yang cocok lalu return.
- **R-2 (event `done` ganda):** `onDone` tidak idempoten — bila suatu hari
  `done` tiba dua kali, finalisasi jalan dua kali (konten bisa ter-append
  dua kali lewat `target.content + pending`). Saat ini backend mengirim `done`
  tepat sekali; risiko teoritis, tidak ada guard idempoten di client.
- **R-3 (reload + stream baru):** namespace id kini campuran — pesan history
  memakai uuid server, pesan baru memakai `msg-N` sampai `done` menggantinya
  dengan `message_id`. Tidak konflik (counter monotonik + uuid unik), tapi
  selama jendela pre-`done` pesan assistant belum punya id stabil; bila stream
  gagal total, pesan error memakai id placeholder dan tidak terkorelasi dengan
  baris DB mana pun.
- **R-4 (StrictMode):** history-load `useEffect` punya guard `cancelled`, aman
  dari double-fetch React 18 StrictMode. Streaming tidak di-effect, aman.

### 4.3 Risiko state-management

- **S-1 (masih terbuka):** dua sumber kebenaran seleksi (server
  `selected_trip_id` vs client `selectedPackage` panel) yang tidak sinkron dan
  tidak saling memberi tahu (akar B-GENUI-3).
- **S-2 (tertutup 6 Sep 2026):** id pesan kini stabil (`message_id`);
  komponen tertaut ke baris DB. Fallback `msg-N` hanya untuk data legacy.
- **S-3 (masih terbuka):** `workflow` hanya di memori; hilang saat reload.
  `PackageDetailPanel` meng-scan seluruh `messages` (O(n·m) per render panel)
  dan meng-scan tool yang sudah tidak ada (B-GENUI-6).
- **S-4 (masih terbuka):** `order_gate` per pesan hilang saat reload; tidak ada
  endpoint untuk mengambil ulang "gate terakhir" sesi (backend punya
  `check_order_status` tapi tidak diekspos ke history).
- **S-5 (masih terbuka):** suppress rekomendasi bersifat global-per-sesi
  (`selectedTripID != nil`), benar untuk BUG-13 tapi mengorbankan fitur
  alternatif (B-GENUI-4).

---

## 5. Status Temuan Audit 6 Sep 2026

| Temuan lama | Status per 9 Sep 2026 |
|---|---|
| B-GENUI-1 komponen hilang saat stream putus | **Sebagian tertutup** — persist sebelum `done` + reload reconcile bekerja untuk kartu; auto-reconcile in-session belum ada |
| B-GENUI-2 komponen tidak persisten | **Tertutup untuk kartu** (`chat_messages.recommendation`); `order_gate`/`workflow` masih ephemeral (B-GENUI-8) |
| Tak ada id pesan stabil (S-2) | **Tertutup** — `message_id` di `done` + `id` di history |
| B-GENUI-3 klik kartu ≠ seleksi | Masih terbuka |
| B-GENUI-4 alternatif mustahil pasca-seleksi | Masih terbuka |
| B-GENUI-5 kartu kehilangan pricing AIW-5 | **Tertutup 9 Sep 2026** — field adult/child normal + diskon dipetakan ke `models.Trip`, ikut `ChatResult`/persistensi/history, lalu dirender kartu bersama destination + duration |
---

## 6. Rekomendasi Perubahan Minimal

Diurut dari paling kecil & paling aman. Semua memakai ulang pola
`order_gate`/`ChatRecommendation`, bukan framework baru.

1. **Auto-reconcile pada `onError` stream (menutup B-GENUI-1 residual).** Di
   error handler `streamChat`, fetch `GET /api/v1/chat/history` sekali dan
   rekonsiliasi: bila assistant message terakhir di server (by `id`) belum ada
   di client, sisipkan beserta rekomendasinya. Cukup reconcile state — tidak
   perlu resume SSE.
2. **Persist `order_gate` per pesan (menutup separuh B-GENUI-8).** Tambahkan ke
   metadata persisten (perluas `ChatRecommendation` atau kolom jsonb terpisah),
   kembalikan di history, render `OrderGateBlock` dari data history.
3. **Seleksi eksplisit dari kartu (menutup B-GENUI-3).** Aksi "Pilih paket ini"
   di kartu/panel mengirim sinyal ke backend (user-turn sintetik atau endpoint
   kecil yang menjalankan logika `select_package`) agar `selected_trip_id`
   sinkron dengan klik. Jangan hanya `setSelectedPackage`.
4. **Kanal "paket lain" deterministik (menutup B-GENUI-4).** Structured
   code/tool baru ala `order_gate` (mis. clear-selection, atau longgarkan guard
   BUG-13 khusus `alternative=true`). Perlu keputusan produk.
5. **Perbaiki draft panel (menutup B-GENUI-6).** Baca `collect_order_detail` →
   `data.draft` (bukan `update_order_draft`), atau persist workflow bersama
   pesan. Jangan biarkan scan tool mati.
6. **Lengkapi field kartu (menutup B-GENUI-5).** Petakan field pricing AIW-5 di
   `extractRecommendedPackages` agar kartu konsisten dengan jawaban teks AI.
7. **Putuskan nasib streaming (B-GENUI-7).** Pilih salah satu: (a) stream round
   final sungguhan dengan deteksi dua-fase (buffer sampai terbukti bukan tool
   round, lalu flush), atau (b) hapus mesin `delta` dan formaliskan
   `TypingText` sebagai satu-satunya jalur. Status quo membayar kompleksitas
   streaming tanpa manfaat TTFT di jalur umum.
8. **Jangan diubah:** tetap larang parse teks assistant sebagai sinyal UI;
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





