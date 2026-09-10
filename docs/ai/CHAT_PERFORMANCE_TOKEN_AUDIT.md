# Audit Performa dan Efisiensi Token Chat Vero

> **P0.1 baseline observability — IMPLEMENTED 10 Sep 2026.** Implementasi menambah telemetry tanpa mengubah prompt, tool/GenUI/OAuth/order behavior, response payload, jumlah call LLM, streaming behavior, memory-summary placement, atau commit boundary assistant+recommendation sebelum `done`. Backend memakai `X-Request-ID` existing sebagai korelasi structured log dan frontend mengirim ID sama lewat proxy. Prometheus tidak memakai request/user/session/PII sebagai label.

> **P0.2 memory summary pasca-`done` — IMPLEMENTED 11 Sep 2026.** Assistant+recommendation tetap dipersist atomik sebelum `done`; refresh summary kini disubmit setelah terminal response lewat shared bounded `AuditPool` (2 worker, buffer 64, timeout 10 detik), best-effort dan non-blocking. Context request tidak dipakai worker: detached context hanya mempertahankan trace P0.1 dan `X-Request-ID`. Job per session di-coalesce agar tidak overlap; submission saat refresh aktif menghasilkan maksimal satu follow-up terhadap tail terbaru. Failure, timeout, pool penuh, atau shutdown tidak mengubah chat/SSE/recovery.

> **P0.4 token-aware context — IMPLEMENTED 11 Sep 2026.** `AI_CONTEXT_MAX_TOKENS` default 12.000 menambah soft budget per provider request memakai estimator deterministic konservatif `ceil(serialized CompletionRequest bytes/2)+16` karena tokenizer/model limit tidak tersedia. Hanya complete oldest conversation turns yang dapat dipangkas; system prompt/memory/system markers, latest user, empat recent history row, dan seluruh current-turn assistant/tool chain dilindungi. Saat `selected_trip_id` ada, seluruh recent history dilindungi. Tool result tidak dikompaksi. Provider usage P0.1 tetap authoritative.

### Status implementasi P0.1

- Backend: `backend/internal/telemetry/chat.go` mencatat request total; `auth_preparation`; `session_preparation`; `pre_llm_db_writes`; `context_query_build`; tiap `llm_round` (round/mode/status, duration, provider-reported TTFB/usage); tiap tool (name/status/duration); `assistant_persistence`; `recommendation_persistence`; `memory_summary_refresh`; `first_sse_write`; `first_delta`; `done`.
- Export: histogram/counter Prometheus di `/metrics` (`chat_requests_total`, `chat_request_duration_seconds`, `chat_stage_duration_seconds`, `chat_llm_round_duration_seconds`, `chat_llm_ttfb_seconds`, `chat_llm_tokens`, `chat_tool_duration_seconds`, `chat_milestone_seconds`) plus structured log event `chat_telemetry` dengan `request_id` untuk korelasi. `request_id` sengaja bukan metric label.
- Usage token dibaca hanya dari field provider OpenAI-compatible (`prompt_tokens`/`input_tokens`, `completion_tokens`/`output_tokens`, cached token detail). Missing field tetap `null` di log dan tidak di-observe di histogram. Non-stream TTFB berarti waktu sampai response headers; stream TTFB berarti waktu sampai event JSON provider pertama. Local fallback tidak mengarang usage/TTFB.
- Frontend: `frontend/src/lib/chatTelemetry.ts`, `ChatInterface.tsx`, dan `streamChat()` mencatat `submit`, `auth-ready`, `request-start`, `response-headers`, `first-sse-event`, `first-delta`, `first-react-paint`, `done`, `recommendation-card-rendered`. Event hanya berisi nama event, request ID acak, elapsed time, status; tidak membawa prompt, auth/session/user, token, atau payload.
- Failure isolation: backend `Trace.emit()` recover dari panic sink; frontend sink dibungkus `try/catch`. Regression test memastikan collector failure tidak mengubah flow.
- Limitasi terukur: provider streaming yang tidak mengirim usage tetap `null`; cached token hanya tersedia bila provider mengirim field; jalur fake-streaming existing dapat tidak menghasilkan `first_delta`; recommendation persistence memakai satu DB insert bersama assistant sehingga kedua duration merepresentasikan commit sama.

Audit read-only kode aktual, 10 Sep 2026. Fokus: chat streaming backend, AI service, SSE, MCP/tool calling, `search_trips`, context/history, system prompt, frontend stream, dan GenUI recommendation flow. Tidak ada implementasi produksi dalam audit ini.

## Metode dan batas pengukuran

- Trace statis dilakukan pada jalur aktual di `backend/internal/{handlers,services,ai,mcp,repositories,events}`, `frontend/src/{app,components,lib}`, konfigurasi AI, model, dan test GenUI/stream.
- Test terarah lulus: `go test ./internal/mcp ./internal/ai ./internal/services ./internal/handlers` dan frontend `npm test -- --test-name-pattern='stream|history|package'` (99/99).
- Tidak ada provider AI, PostgreSQL production, reverse proxy production, trace jaringan, atau corpus percakapan production dalam environment audit. Karena itu nilai latency milidetik dan token aktual belum dapat dinyatakan sebagai hasil benchmark. Angka di bawah adalah estimasi engineering berbasis jumlah round-trip, payload, batas konfigurasi, dan ukuran source; harus divalidasi dengan benchmark §12.
- Estimasi token memakai pendekatan konservatif karakter/4 untuk teks/JSON Latin-Indonesia. Tokenizer model aktual dapat berbeda ±20–35%.

## Ringkasan prioritas

| Prioritas | Temuan | Dampak utama | Risiko |
|---|---|---|---|
| P0 | Jalur umum `ChatStream` tidak mengirim `delta`; setiap round memanggil provider dengan `GenerateStream(..., nil)` | TTFT visual tetap menunggu respons lengkap; kompleksitas SSE dibayar tanpa streaming nyata | Rendah–sedang bila diperbaiki dengan deteksi final-round aman |
| P0 | `refreshMemorySummary` sinkron sebelum `done`, dengan 1–3 query DB setelah threshold | `done`, kartu GenUI, dan input berikutnya tertahan | Rendah jika summary dilakukan sesudah assistant persist dan tidak mengubah payload turn aktif |
| P0 | Tidak ada telemetry stage/token; hanya total HTTP duration dan log tool duration | Bottleneck/TTFT/token tidak bisa diukur aktual | Rendah |
| P0 | Context memakai batas jumlah pesan, bukan token budget; “summary” merupakan raw tail yang berpotensi menduplikasi recent history | Input token tumbuh/tidak stabil; fakta lama bisa hilang | Sedang untuk redesign, rendah untuk observasi/budget guard |
| P0 | Delapan schema tool dikirim pada setiap round, termasuk saat state membuat sebagian besar tool tidak relevan | Sekitar 1k+ token schema per LLM round dari source-line estimate | Rendah–sedang dengan state-aware catalog yang konservatif |
| P1 | Multi-tool call dalam satu respons dieksekusi serial | Latency tool independen dijumlahkan | Sedang; tool mutasi/order wajib tetap serial |
| P1 | `search_trips` membawa satu payload untuk reasoning, GenUI `done`, persistence JSONB, dan workflow; field redundan ikut kembali ke LLM/UI | Token provider dan bytes SSE/DB membesar | Sedang; butuh projection terpisah tanpa mengurangi field B-GENUI-5 |
| P1 | Finalisasi sinkron menulis AI log, re-fetch session, assistant message, summary sebelum `done` | Tail latency sesudah model selesai | Sedang; assistant+recommendation persist wajib tetap sebelum `done` untuk recovery |
| P2 | `ensureCustomerSession()` berada serial sebelum request chat | Tambah satu auth refresh round-trip saat token expired | Rendah; tidak boleh dilewati karena OAuth/account order correctness |
| P2 | History endpoint memuat seluruh percakapan dan full recommendation snapshots | Reload payload/parse/render membesar pada sesi panjang | Sedang; pagination harus menjaga recovery dan GenUI lama |

## 1. Current architecture

### 1.1 Flow aktual

```text
User submit
  -> ChatInterface optimistic user row + empty assistant placeholder
  -> ensureCustomerSession() (refresh hanya bila token perlu)
  -> streamChat POST /api/v1/chat {prompt, stream:true}
  -> Next.js route handler /app/api/v1/chat/route.ts
       request.text() -> fetch backend -> pipe ReadableStream
  -> Gin GuestChat
       bind -> resolve chat cookie/session -> resolve guest identity
       -> attach guest identity -> OptionalAuth account upgrade
  -> streamChat SSE handler
       headers + cookie + write-deadline setup
  -> AIService.ChatStream
       FindChatSession
       -> concurrent UpdateChatSessionActivity + persist user ChatMessage
       -> buildMessages
            static system prompt
            raw memory summary
            last AI_CONTEXT_RECENT_MESSAGES rows (default 8)
       -> generateWithToolLoopStream (maksimum 5 round)
            GenerateStream(messages, all 8 active tools, onDelta=nil)
            -> execute requested MCP tools serial
            -> append assistant tool_calls + complete tool result JSON
            -> next LLM round
       -> finalizeChat
            persist AI log
            safety/order guards
            re-fetch selected_trip_id
            derive GenUI recommendation
            persist assistant + recommendation JSONB
            refresh raw memory summary
            publish workflow_completed
       -> SSE done(full ChatResult)
  -> Next.js pipes bytes
  -> frontend SSE parser
  -> onDone replaces placeholder, restores stable message_id,
     selected_trip_id, workflow, order_gate, recommendation packages
  -> TypingText animation when no live delta arrived
```

`/api/v1/events/stream` bukan transport token customer chat. Endpoint itu SSE backoffice untuk event bus internal, dibatasi role operator/admin. Customer chat memakai SSE langsung pada respons `POST /api/v1/chat`. Frontend customer tidak subscribe event bus.

### 1.2 Invariant correctness yang harus dipertahankan

- `selected_trip_id` tetap backend-authoritative. UI hanya menerima hasil `select_package`, echo `done`, atau history.
- Alternative recommendation hanya valid dari `search_trips(alternative=true)`; pencarian normal setelah selection harus tetap ditolak/suppressed.
- Assistant message dan `ChatRecommendation` harus persisten sebelum `done`. EOF setelah persist dapat direkonsiliasi dari history; EOF sebelum persist tidak boleh direka klien.
- `message_id` stabil tetap jangkar dedup/recovery.
- `order_gate` dan booking outcome tetap berasal dari structured tool result, bukan parsing prose.
- `create_booking`, guest one-order guard, OAuth account attribution, order marker, dan claim flow tidak boleh diparalelkan atau dipindah ke client.
- `create_payment` tetap disabled.

## 2. Actual latency breakdown

### 2.1 Yang benar-benar terukur saat ini

| Stage | Instrumentasi aktual | Kekurangan |
|---|---|---|
| Total HTTP `/api/v1/chat` | `http_request_duration_seconds` | Mencakup seluruh stream sampai `done`; tidak memisahkan TTFB/TTFT/tool/finalize |
| Tool | log `duration_ms` + `AILog.ExecutionTime` | Tidak ada histogram per tool/status; audit queue delay tidak terlihat |
| LLM | Tidak ada duration per round | Metadata provider disimpan, tetapi usage/token tidak diekstrak sebagai metric |
| Context prep | Tidak ada | Query recent messages dan construction bercampur dalam request |
| SSE | Tidak ada timestamp first byte/first delta/done | Proxy/browser overhead tidak terlihat |
| Frontend | Tidak ada Performance API mark | Auth wait, fetch TTFB, first delta, first paint, done tidak diketahui |

Jadi “actual latency” yang dapat dibuktikan dari kode adalah urutan critical path dan jumlah operasi, bukan p50/p95 production.

### 2.2 Critical path per turn

1. **Frontend auth preflight.** `ensureCustomerSession()` selesai sebelum `streamChat`. Token valid: lokal/cepat. Token expired/missing dengan refresh cookie: satu request `/auth/refresh` berada di critical path. Ini perlu untuk mencegah user OAuth/password diperlakukan sebagai guest.
2. **Proxy request setup.** Route Next.js membaca body kecil seluruhnya lewat `request.text()`, lalu membuka fetch backend. Ini menambah satu hop HTTP, tetapi respons body dipipe langsung dan header `X-Accel-Buffering: no` dipasang.
3. **Guest/session prep.** Minimal beberapa DB operation: resolve chat session, resolve guest identity, attach identity; lalu `AIService` membaca session lagi. Detail jumlah query bergantung cookie/session baru vs existing.
4. **Pre-LLM persistence.** Session activity update dan user-message insert sudah paralel; keduanya tetap wajib selesai sebelum LLM. Keputusan ini mendukung history/recovery tetapi membuat DB latency bagian TTFT.
5. **Context prep.** Satu query `ListRecentChatMessages LIMIT 8`, lalu filtering summary O(summary lines × recent messages). Tidak ada cache atau tokenizer.
6. **LLM/tool loop.** Jalur tanpa tool: 1 provider round-trip. Jalur satu tool: 2 provider round-trip + tool. Multi-step order dapat mencapai beberapa round; cap 5 lalu satu forced final call, sehingga worst case 6 provider calls.
7. **Tool execution.** Semua `tool_calls` dalam satu assistant response dijalankan serial. `search_trips`: session read + catalog query limit 20 + in-process scoring/sort. `select_package`: trip read + session read + selection update. Read tools masing-masing melakukan lookup sendiri.
8. **Finalization sebelum `done`.** Success path menulis AI log, re-fetch session, menulis assistant+recommendation, menjalankan `refreshMemorySummary`, publish event, baru mengirim `done`. Setelah message count ≥12, summary menambah count query + tail query + session update. Ini bottleneck post-generation paling jelas.
9. **SSE/frontend.** Backend `send()` marshal per event, write, dan flush langsung; proxy pipe langsung; frontend parse incremental dan batch React updates per `requestAnimationFrame`. Scheduler ini baik: render maksimal sekitar sekali/frame, bukan sekali/provider chunk.
10. **Visual completion.** Karena jalur umum tidak menerima live delta, frontend mendapat full response di `done`, lalu menjalankan `TypingText` 2 karakter/tick atau 4 karakter/tick untuk teks >500 karakter. Ini menambah delay buatan sebelum recommendation card muncul karena kartu menunggu `completedTyping`.

### 2.3 TTFT aktual secara semantik

Kode menyatakan streaming, tetapi jalur umum bukan token streaming. `generateWithToolLoopStream` memanggil `GenerateStream(..., nil)` di setiap round. Bila round tidak berisi tool call, function langsung return full text tanpa pernah memanggil handler `onDelta`. `onDelta` hanya dipakai setelah 5 round habis pada forced call tanpa tools. Akibat:

- TTFT jaringan provider tidak berubah menjadi TTFT UI.
- User melihat placeholder/“Thinking” sampai provider menyelesaikan seluruh jawaban dan finalisasi backend selesai.
- Setelah `done`, teks dianimasikan client-side. Ini perceived typing, bukan streaming.
- Komentar lama yang menyebut “final text round streamed” tidak sesuai behavior source saat ini; B-GENUI-7 di `GENUI_TRAVEL_PACKAGE_AUDIT.md` sudah mencatat drift ini.

### 2.4 Sequential vs parallel

- Sudah paralel: update activity + persist user prompt; audit tool melalui bounded worker pool.
- Masih serial: tool calls satu batch; final AI log → session re-fetch → assistant persist → summary refresh; auth refresh → chat request.
- Tidak aman diparalelkan: `select_package` dengan tool yang membutuhkan selection baru; `collect_order_detail`/`create_booking`; dua tool mutasi; booking dengan check/status yang menentukan duplicate guard.
- Kandidat paralel aman terbatas: read-only `get_trip_detail`, `calculate_trip_price`, `check_trip_availability` untuk trip sama setelah argument lengkap. Namun biasanya model seharusnya tidak meminta semua sekaligus; pengurangan round-trip lewat orchestration deterministic lebih bernilai daripada blind parallelism.

## 3. Actual token/context breakdown

### 3.1 Komponen input setiap provider round

| Komponen | Perilaku aktual | Estimasi |
|---|---|---|
| System prompt | Dikirim ulang setiap round. Berisi flow, pricing, availability, guest limit, safety, style, payment-disabled, injection rule | Besar; sekitar 4–5k karakter source, kira-kira 1.0–1.3k token |
| Tool schema | Semua 8 tool aktif dikirim pada setiap round; sejak P0.3 anotasi parameter yang hanya mengulang nama property dihapus | Serialized schema sekitar 4,29 KB setelah P0.3 (sebelumnya 4,95 KB), kira-kira 1,07k token dengan heuristik 4 karakter/token |
| Recent history | Default 8 row DB, bukan 8 turn | Variabel; dapat memuat 4 turn, atau campuran system/order marker |
| Memory summary | Maksimum 1,800 rune; sebenarnya raw tail transcript | Sampai kira-kira 450–700 token tergantung Bahasa Indonesia/JSON |
| Current user prompt | Sudah dipersist sebelum `buildMessages`, sehingga biasanya termasuk recent query; fallback append hanya bila recent kosong | Tidak diduplikasi pada normal path |
| Tool call/result current turn | Ditambahkan utuh ke `messages`; seluruh prefix dikirim ulang pada round berikut | Dapat dominan, khususnya `get_trip_detail`/`search_trips` |

Baseline turn awal tanpa history/tool result diperkirakan sekitar **2.0–2.6k input token sebelum prompt user**, terutama system prompt + 8 tool schemas. Satu tool round membuat baseline ini dibayar lagi pada final LLM round, ditambah tool call/result. Satu pencarian sederhana karena itu berpotensi memakai sekitar 4.5–6.5k aggregate input token across rounds, walau context window per request lebih kecil.

### 3.2 History dan summary

- Tidak seluruh history dikirim setiap turn. Model menerima last `AI_CONTEXT_RECENT_MESSAGES=8` rows + `MemorySummary` session.
- P0.4 menambah soft token budget setelah query maksimum 8 row existing. Budget bersifat turn-aware untuk oldest eligible history; bukan per-model hard context window karena provider/model limit tidak tersedia dari konfigurasi/API.
- `refreshMemorySummary` bukan semantic summary. Ia mengambil tail minimum 20 messages, menggabungkan `role: content`, lalu menyimpan suffix 1,800 rune. Setelah threshold, ini dijalankan setiap turn.
- Overlap protection mencoba menghapus summary line bila `strings.Contains(line, recent.Content)`. Ini heuristic rapuh: multiline message, truncation di tengah message, repeated short answers (“ya”), atau role/system marker dapat lolos/terhapus salah.
- Karena summary dibentuk dari tail terbaru, bukan pesan yang jatuh keluar window, summary dan recent punya overlap konseptual tinggi. Token dapat diduplikasi meski exact-line filter ada.
- Summary raw suffix dapat mulai di tengah JSON/order marker atau kalimat. Ini buruk untuk token dan reasoning.
- Recent history mengambil `ChatMessage.Content` saja. `ChatMessage.Recommendation` JSONB **tidak** dimasukkan ke LLM context. Jadi old GenUI recommendation metadata tidak membebani model—ini sudah benar.
- Namun tool result tidak dipersist sebagai `ChatMessage`; model pada turn berikutnya hanya melihat prose assistant/user dan system order marker. Detail recommendation lama untuk UI bertahan di JSONB tetapi tidak menjadi model context.
- `selected_trip_id` juga tidak ditambahkan eksplisit ke system/context. Model mengandalkan history/prose untuk memilih ID; backend guards mencegah recommendation salah, tetapi pertanyaan detail paket terpilih tetap bisa memicu tool salah bila ID tidak tersedia di recent text.

### 3.3 Tool schema dan result

- Delapan tool aktif: `search_trips`, `select_package`, `collect_order_detail`, `create_booking`, `get_trip_detail`, `calculate_trip_price`, `check_trip_availability`, `check_order_status`.
- P0.3 (11 Sep 2026): dynamic tool filtering sengaja tidak diterapkan. `selected_trip_id` saja tidak membuktikan tool aktif mana pun mustahil digunakan tanpa membaca intent user; filtering intent/keyword berisiko menghilangkan operasi valid. Optimasi aman hanya menghapus `description` parameter schema yang identik dengan nama property, menghemat 664 byte serialized schema per provider round tanpa mengubah kontrak.
- Schema mengulang business rules yang juga ada di system prompt, khususnya booking completeness, source of truth, availability, dan alternative. Duplikasi ini meningkatkan reliability, tetapi sebagian dapat dipadatkan setelah eval.
- `search_trips` mengembalikan maksimum 3 paket dengan sekitar 18 field/paket. Redundansi nyata: `price`, `adult_price`, `adult_effective_price`; `count` dapat dihitung; `query` sudah ada dalam tool arguments; `reason` berasal dari `alternative`; slug/category/location kadang tidak dipakai reasoning.
- Field B-GENUI-5 (normal/effective adult, child, discount flags/amount, destination, duration, image/title/id) dibutuhkan UI/persistensi. Masalah utamanya satu object dipakai untuk tiga consumer berbeda: LLM reasoning, frontend GenUI, dan audit/persistence.
- `get_trip_detail` membawa overview, summary, all highlights, amenities, references, itinerary, media, image, pricing, quota. Ini payload terbesar dan dapat berisi data UI yang tidak perlu untuk jawaban spesifik.
- `collect_order_detail` tidak mempersist draft; result mengulang seluruh payload sebagai `draft`, lalu dikirim kembali ke model. Pada setiap tahap data lama berpotensi diulang oleh model tool args + tool result + history prose.
- Duplicate tool guard hanya berlaku pada exact raw `name + arguments string`. JSON key order, whitespace, `1` vs `1.0`, atau omitted default menghasilkan key berbeda. Duplicate result tetap ditambahkan ke context sebagai success info dan memerlukan LLM round berikut.

### 3.4 Output token

- Tidak ada `max_tokens`/`max_completion_tokens` pada `CompletionRequest` atau payload provider. Output hanya dikendalikan prompt “singkat”.
- Tidak ada response-length class per intent. Detail itinerary dan booking status memakai policy sama.
- Menambahkan hard cap global terlalu rendah berisiko memotong itinerary, error tracking code, atau order confirmation. Lebih aman cap per intent/final-stage setelah eval, dengan reserve untuk tool calls dan structured safety text.

## 4. Bottleneck terbesar

1. **P0 — Fake streaming/TTFT.** Respons final normal di-buffer sampai provider selesai, finalisasi DB selesai, dan `done` tiba. Ini dampak UX terbesar.
2. **P0 — Repeated static tokens per round.** System prompt + 8 tool schema sekitar 2k+ baseline input token dikirim pada setiap LLM round. Tool flow sederhana membayar baseline dua kali.
3. **P0 — Raw context management.** Message-count window + raw tail “summary” tidak menjamin token cap, menyimpan duplikasi, dan tidak merepresentasikan state bisnis secara ringkas.
4. **P0 — Post-LLM work blocks `done`.** Summary refresh setiap turn panjang menambah query setelah assistant sudah tersedia.
5. **P1 — Tool result projection terlalu lebar.** Data yang dibutuhkan UI ikut masuk ke reasoning; detail tool dapat sangat besar.
6. **P1 — Serial tool dispatch dan repeated LLM planning.** Semua batch tool serial; order flow “satu pertanyaan per turn” memang membutuhkan user round-trip, tetapi tool bookkeeping bisa menambah LLM rounds yang tidak selalu memberi nilai.
7. **P0 — Observability gap.** Tanpa stage metrics dan usage token, prioritas hanya bisa berdasar code audit, bukan p95/cost aktual.

## 5. Quick wins

### P0.1 Tambah tracing stage dan token usage—tanpa mengubah business behavior

Rekam per request/turn: auth wait (frontend), handler/session prep, pre-LLM writes, context query/build, setiap LLM round TTFB/duration, tool duration/name/status, first backend SSE byte, first `delta`, assistant persist, summary refresh, `done`, frontend first paint. Rekam `prompt_tokens`, `completion_tokens`, `cached_tokens` bila provider mengirim `usage`; jangan label Prometheus dengan session/user/prompt.

Benefit: baseline nyata dalam 1 deploy; menentukan apakah DB, provider, tool, proxy, atau frontend dominan. Risiko rendah.

### P0.2 Pindahkan summary refresh keluar dari pre-`done` critical path

Tetap wajib: persist assistant + recommendation sebelum `done`. Kandidat: sesudah `done` dengan bounded background queue/worker dan per-session coalescing; atau refresh hanya saat pesan lama benar-benar keluar window. Jangan spawn goroutine tak terbatas dan jangan memakai request context setelah response selesai.

Estimasi: menghapus 1–3 DB round-trip dari tail setiap turn setelah 12 message; sekitar 20–100 ms typical DB lokal/regional, lebih besar pada DB loaded. Tidak mengubah TTFT token, tetapi mempercepat cards/done dan menurunkan p95.

### P0.3 Tetapkan output budget konservatif per response class

Mulai dengan observasi-only warning bila completion > target. Setelah eval, gunakan kelas: conversational/status pendek, recommendation intro pendek, detail itinerary lebih besar. Pertahankan tracking code/order ID dan jangan truncate structured tool arguments.

Estimasi output saving 20–50% pada jawaban verbose; latency generation turun proporsional terhadap token yang dipangkas.

### P0.4 Hilangkan field tool-result yang jelas redundan bagi LLM

Untuk `search_trips` reasoning projection: hapus `count`, `query`, satu alias harga legacy yang tidak dipakai model, dan field presentasi murni seperti `image_url` dari pesan `tool` ke LLM—tetapi tetap sediakan semuanya pada GenUI projection/persistence. Ini memerlukan split projection, bukan menghapus field `ChatResult`.

Estimasi 10–25% token result `search_trips`; risiko rendah bila contract LLM/UI dipisah dan test B-GENUI-5 tetap utuh.

### P0.5 Cache static system/tool serialization di process

`mcp.OpenAITools()` membangun maps/slices setiap request. Cache immutable result/serialized body mengurangi allocation/CPU, bukan billable token. Dampak latency kecil (<1–5 ms), tetapi aman dan mudah setelah race test.

## 6. Medium-risk optimizations

### P0/P1.1 Streaming final-round dengan buffer-until-classified

Masalah BUG-12 valid: provider dapat mengirim content preamble bersama tool calls. Solusi aman bukan langsung forward semua content. Buffer content per provider round sampai finish reason/tool-call classification diketahui:

- Jika round mengandung tool calls: buang/batasi preamble dari user stream; append tool call/results; lanjut.
- Jika round final tanpa tool call: flush buffered first content segera setelah classification cukup kuat, lalu forward sisa delta live. Provider berbeda mungkin baru memastikan absence of tool call saat finish; untuk provider itu TTFT tetap full. Alternatif lebih kuat: dua-phase orchestration, non-streaming tool-choice call lalu dedicated final stream tanpa tools.
- Jangan kirim GenUI component dalam `delta`; tetap hanya pada `done` setelah persistence.

Two-phase lebih deterministik tetapi menambah satu LLM call bila model sebenarnya bisa menjawab tanpa tool. State-aware intent/router diperlukan agar tidak merusak latency.

### P1.2 Dynamic tool catalog berdasarkan state dan intent yang sudah pasti

Contoh konservatif:

- No selection: expose `search_trips`, `select_package`; expose read/order tools hanya bila trip ID/state tersedia.
- Selected: expose detail/price/availability/order/status; tetap expose `search_trips` untuk explicit alternative.
- Order exists: remove `create_booking`, keep `check_order_status`.
- Payment tool tetap absent.

Jangan pakai keyword frontend. Router harus backend-side, deterministic state + model-independent classifier/eval, dengan fallback ke full catalog saat ambigu.

Estimasi schema saving 30–70% per round (sekitar 300–800 token/round). Risiko: tool yang dibutuhkan tidak tersedia lalu model memberi jawaban salah/extra round.

### P1.3 Structured conversation state menggantikan raw summary

Simpan compact state terpisah, misalnya selected trip ID/title, last recommendation IDs, requested alternative flag, pax/date/contact-presence (bukan raw PII bila tidak perlu), order marker/status. Tambahkan satu concise system context. Recent transcript tetap token-budgeted.

Ini menghemat token sekaligus mencegah lupa selection/order. Namun state harus backend-authoritative dan update atomik; jangan derive dari assistant prose.

### P1.4 Token-budgeted, turn-aware history

Pilih complete user/assistant turns dari belakang sampai budget tercapai; selalu include current user, compact business state, relevant order marker, dan safety-critical last action. Drop recommendation JSONB (sudah tidak masuk), old chitchat, dan stale assistant prose. Tool result current turn tetap ada sampai final response.

Default 8 row dapat dipertahankan sebagai hard max awal, tetapi tambahkan token/char max dan jangan memotong pasangan turn secara sembarang.

### P1.5 Pisahkan payload reasoning, UI, audit

- Reasoning: field minimum untuk jawaban.
- UI/GenUI: complete card fields B-GENUI-5.
- Audit: payload lengkap sesuai kebutuhan operasional.

`ToolResult` saat ini menjadi ketiganya sekaligus dan dikirim utuh pada `done.workflow`. Split ini memberi saving terbesar untuk search/detail tanpa mengorbankan cards/recovery.

### P1.6 Parallel read-only tool execution dengan dependency planner

Eksekusi paralel hanya jika satu assistant round mengeluarkan beberapa tool read-only, arguments valid, dan tidak ada dependency: detail/price/availability untuk trip sama dapat concurrent. Preserve output order by original tool-call index. Tool mutasi/order selalu serial; jika batch mencampur mutasi dan read, gunakan dependency phases.

Estimasi latency batch = mendekati max(tool durations), bukan sum; saving 30–60% hanya pada multi-read batch. Dampak rata-rata mungkin kecil bila model jarang batch.

### P1.7 Normalisasi duplicate tool key dan reuse result

Canonicalize parsed JSON (sorted key, normalized numeric/default) untuk dedup. Saat duplicate, reuse result pertama alih-alih success placeholder “already executed”; model tetap mendapat data yang dibutuhkan tanpa DB call dan tanpa extra ambiguity. Scope tetap per request kecuali cache memiliki versioning catalog/session state.

## 7. High-risk optimizations

### P1/P2.1 Deterministic state machine untuk order flow

Setelah selection, backend dapat menentukan field berikut dan hanya memakai LLM untuk NLU/extraction + prose. Ini dapat mengurangi tool schemas dan LLM round-trip besar, tetapi menyentuh order, OAuth attribution, guest limit, alternative flow, dan draft persistence. Butuh desain/migrasi/eval menyeluruh.

### P2.2 Server-side semantic summary via LLM

LLM summary dapat lebih ringkas daripada raw transcript, tetapi menambah cost/latency/background complexity dan berisiko menghapus fakta selected trip/order/contact. Jangan jadikan satu-satunya state bisnis; gunakan hanya untuk soft conversational memory.

### P2.3 Provider prompt caching / Responses API migration

Static prefix caching dapat memangkas billed cached input dan latency bila provider/model mendukung. Risiko: compatibility OpenAI-like provider, cache-key invalidation, observability usage, dan perubahan streaming/tool format. Lakukan setelah payload stabil.

### P2.4 Direct browser-to-backend SSE

Menghilangkan Next.js hop dapat mengurangi beberapa ms, tetapi memperumit CORS, cookie domain/SameSite, auth header, deployment, dan recovery. Bukan bottleneck utama; route handler sekarang sudah pipe stream dan menutup rewrite buffering.

### P2.5 Kirim `done` sebelum assistant persistence

**Jangan lakukan.** Memang memangkas tail, tetapi merusak `message_id`, GenUI persistence, dan EOF recovery 4B–4F. Assistant+recommendation persist adalah commit boundary sebelum `done`.

## 8. Estimasi penghematan token

Estimasi per turn; validasi dengan tokenizer/model usage wajib.

| Optimasi | Saving estimasi | Catatan |
|---|---:|---|
| Dynamic tool catalog | 300–800 input token per LLM round | Baseline schema aktif sekitar 1k+ token dari source estimate |
| Compact system prompt setelah eval | 250–500 input token per round (20–40%) | Jangan hapus safety/order invariants; gabungkan duplikasi dengan descriptions |
| Search result reasoning projection | 100–350 token per search result round | Tergantung panjang title/summary/highlights dan 1–3 paket |
| Detail result projection per intent | 300–2,000 token pada detail-heavy turn | Jangan kirim media/references/full itinerary jika user hanya tanya harga anak |
| Token-budget history + structured state | 20–60% context history pada sesi panjang | Kecil pada sesi baru; besar setelah >12 messages |
| Ganti raw summary 1,800 rune dengan compact state 300–600 karakter | Sekitar 250–450 token/round | State bisnis harus authoritative |
| Output cap per intent | 20–50% completion token pada jawaban verbose | Tidak berlaku untuk itinerary panjang yang memang diminta |
| Gabungan realistic setelah P0/P1 | 30–55% aggregate input token pada tool turns; 15–35% pada plain turns | Tidak dijumlahkan mentah karena overlap |

Contoh search turn dua LLM round: jika baseline static+schema 2.2k token/round, dynamic tools + prompt compaction menghemat 700 token/round, lalu slim result 250 token, aggregate saving sekitar 1.65k token atau 25–35% dari turn 5–6k token.

## 9. Estimasi pengurangan latency

| Optimasi | Estimasi | Confidence |
|---|---:|---|
| True final streaming | Perceived TTFT turun dari full completion+finalize menjadi provider first-content; sering 1–5 detik lebih cepat terlihat | Sedang; provider/network belum diukur |
| Summary refresh setelah `done` | 20–100 ms tail typical; p95 bisa lebih besar | Rendah–sedang |
| Parallel read-only tools | 30–60% pada batch multi-read | Sedang untuk batch; frekuensi belum diketahui |
| Kurangi satu unnecessary LLM round | 0.5–5+ detik per turn | Tinggi secara mekanis, rendah untuk frekuensi |
| Input token -30% | 5–25% provider prefill/TTFT pada context besar | Provider-dependent |
| Output token -30% | Kira-kira 20–30% generation duration jawaban panjang | Sedang |
| Hilangkan Next.js hop | Biasanya <5–30 ms same-region | Rendah; bukan prioritas |
| Frontend rAF batching | Sudah optimal; perubahan lanjut diperkirakan <16 ms paint cadence | Tinggi |

Target awal realistis setelah instrumentasi: plain-chat perceived first text <1.5 s p50 / <3 s p95; search turn first visible status/text <2.5 s p50; `done - provider_finish` <150 ms p95 tanpa summary refresh sinkron. Target harus disesuaikan provider/region.

## 10. Risiko/regression

| Risiko | Guard wajib |
|---|---|
| Model lupa paket dipilih | Selalu inject compact authoritative `selected_trip_id` + title/state; pertahankan backend re-fetch/suppression |
| Duplicate `search_trips` | State-aware tool availability + canonical dedup + regression test alternative vs normal |
| Alternative recommendation rusak | `alternative=true` tetap structured dan hanya dari explicit intent; previous recommendation snapshot immutable |
| GenUI cards hilang/reload beda | Jangan kurangi UI projection/persisted recommendation; `message_id` dan JSONB tetap sebelum `done` |
| EOF recovery salah | Pertahankan terminal guard, exact persisted assistant after matching prompt, no LLM retry |
| OAuth user dianggap guest | Jangan hapus auth refresh/Authorization forwarding; ukur lalu optimalkan, bukan bypass |
| Duplicate order | Tool mutasi serial; session order marker dan BookingService idempotency tetap authority |
| Guest limit bypass | Structured `GUEST_ORDER_LIMIT_REACHED`, blocked retry, guest/contact anchoring tetap utuh |
| Harga/ketersediaan hallucination | Detail/price/availability tetap backend tool source of truth; slim projection hanya buang field irrelevan |
| Output terpotong | Cap per intent + finish_reason monitoring + fallback continuation terkontrol, bukan global cap rendah |
| Prompt compression mengurangi safety | Golden eval untuk pricing, availability, payment-disabled, order success claim, prompt injection |
| Parallel tool race | Allowlist read-only + preserve ordering + no mixed mutation concurrency |
| Background summary hilang saat shutdown | Queue bounded + drain; summary soft-memory saja, bukan source of truth bisnis |

## 11. Rekomendasi urutan implementasi

1. **P0 — Baseline observability.** Tambah stage timers, LLM per-round usage/duration/TTFB, first delta/done, frontend marks. Jalankan corpus benchmark tanpa mengubah behavior.
2. **P0 — Hilangkan summary dari critical tail.** Pertahankan persist assistant+recommendation sebelum `done`; ukur `done` improvement dan recovery tests.
3. **P0 — Split reasoning projection dari GenUI projection.** Mulai `search_trips`; kunci B-GENUI-5 snapshot tests dan token fixture.
4. **P0 — Compact prompt secara evidence-based.** Hapus duplikasi hanya setelah golden eval pass; pertahankan business/safety rules.
5. **P0/P1 — State-aware tool catalog konservatif.** Mulai state order-exists/selected yang deterministic; fallback full tools saat ambigu.
6. **P0/P1 — Perbaiki true streaming.** Prototype buffer-until-classified atau two-phase; benchmark provider aktual; pertahankan `done` commit boundary dan EOF recovery.
7. **P1 — Token-budget, turn-aware history + compact structured state.** Migrasi bertahap; shadow compare old/new context dan eval consistency.
8. **P1 — Canonical duplicate reuse, lalu parallel read-only tools.** Jangan menyentuh mutation ordering.
9. **P1 — Output budgets per intent.** Aktifkan setelah completion distribution tersedia.
10. **P2 — Provider prompt caching/deterministic order state machine.** Hanya bila P0/P1 belum memenuhi SLO/cost target.

## 12. Test/benchmark yang perlu dibuat

### 12.1 Benchmark latency end-to-end

- Scenario: plain greeting, initial search, explicit alternative after selection, selected trip detail, price quote, availability, order detail each field, create booking guest first, guest limit, authenticated/OAuth order, check order status.
- Capture browser marks: submit, auth-ready, request-start, response-headers, first SSE event, first delta, first React paint, done, cards rendered.
- Capture backend trace spans with same `X-Request-ID`: handler/session, pre-write, context DB/build, LLM round N TTFB/end, each tool, finalize guards, assistant persist, summary, flush done.
- Run p50/p95/p99 with warm/cold connections, local/same-region/cross-region DB, 1/10/50 concurrent chat.
- Proxy matrix: direct backend, Next dev, Next production, production ingress/CDN; assert first chunk not buffered.

### 12.2 Token benchmark

- Fixed corpus minimal 50 conversations, termasuk long chat 50+ turns.
- Record exact serialized provider request bytes and provider usage per round.
- Breakdown: system, tools, memory, recent messages, current-turn tool calls/results, completion.
- Golden budget assertions: no-tool initial input, search result input, detail input, 20-turn session input. Fail CI on >10% unexplained growth.
- Tokenizer sesuai `AI_MODEL`; char/4 hanya fallback.

### 12.3 Streaming contract tests

- Provider fixture final-text-only: at least one `delta` arrives before provider completion and before `done`.
- Provider fixture content+preamble+tool_calls: no preamble leak/duplicate prefix.
- Fragmented SSE across arbitrary byte boundaries and CRLF.
- Proxy integration asserts timing gap between first delta and done.
- Client abort cancels provider request and stops writes.
- EOF before persist: local error only, no invented card.
- EOF after persist: one history fetch, one stable assistant/card, no LLM retry.
- Late `done`, duplicate callback, Strict Mode: idempotent.

### 12.4 Context correctness tests

- Selected trip survives history compaction; detail question uses selected ID and does not search.
- Explicit alternative searches and renders new set while old set remains persisted.
- Normal follow-up after selection does not search/recommend again.
- Order marker/status survives window eviction.
- Raw GenUI recommendation metadata never enters LLM context.
- No PII-heavy recommendation/order UI payload enters model unless needed.
- Complete turn boundaries preserved under token budget.
- Summary/state corruption fails closed, not with wrong selection/order.

### 12.5 Tool tests

- Snapshot actual schema bytes/token count per state catalog.
- `search_trips` reasoning projection contains fields needed to discuss price/discount/destination/duration, while GenUI projection retains all B-GENUI-5 fields.
- Canonical duplicate args (`1`, `1.0`, key order) execute once and reuse original result.
- Parallel read-only batch output order stable; cancellation/error deterministic.
- Any batch containing `select_package`, `collect_order_detail`, `create_booking`, atau order mutation remains serial.
- No retry after `GUEST_ORDER_LIMIT_REACHED`; no duplicate booking.

### 12.6 Persistence/recovery tests

- Assistant+recommendation commit occurs before `done` write.
- Summary worker delay/failure does not block or alter `done` and does not lose selected/order state.
- History pagination, bila dibuat, tetap dapat merekonsiliasi latest failed turn dan memuat recommendation message terkait.
- Reload preserves stable message ID, selected card, initial+alternative card sets, full pricing, OAuth/account order ownership, dan order tracking gate.

## Kesimpulan

Jalur chat sudah punya fondasi correctness kuat: backend-authoritative selection, duplicate/order guards, GenUI persistence, EOF reconciliation, direct streaming proxy, per-write flush, dan frontend rAF batching. Masalah terbesar bukan socket SSE atau React rendering. Masalah utama: respons normal tidak benar-benar stream; static prompt/tool schemas dibayar ulang setiap LLM round; context summary bukan summary/token-budget; dan post-LLM summary menahan `done`. Urutan aman: ukur dulu, keluarkan summary dari tail, pisahkan projection LLM vs GenUI, ringkas static context dengan eval, lalu perbaiki streaming dan state-aware tools tanpa mengubah commit boundary GenUI/order/auth.