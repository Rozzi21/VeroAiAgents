# Audit P1 Performance dan Token Chat Flow

> Tanggal audit: 11 Sep 2026. Scope: audit read-only atas chat flow aktual dan artefak telemetry lokal yang tersedia. Tidak ada production code, business behavior, jumlah LLM call, system prompt, tool definition, GenUI, auth/OAuth, booking/order, SSE recovery, persistence semantics, atau telemetry P0.1–P0.4 yang diubah.

## 1. Executive Summary

Temuan utama:

1. **P0 — streaming final text praktis tertahan sampai provider round selesai.** **MEASURED (code path):** setiap tool-enabled round memanggil `GenerateStream(..., nil)`. Saat round menghasilkan final text tanpa `tool_calls`, service langsung mengembalikan response setelah seluruh provider stream dibaca; callback SSE tidak pernah menerima delta. Frontend menerima `done`, lalu menjalankan `TypingText` lokal. Ini menjelaskan mengapa UI tampak mengetik tetapi Time-to-First-Visible-Text tetap mendekati full LLM duration.
2. **Telemetry runtime nyata tidak tersedia dalam workspace.** **MEASURED:** `backend/backend.log` berukuran 115.802 byte/747 baris tetapi memuat 0 `chat_telemetry`, 0 `llm_round`, 0 `context_budget`, 0 `first_delta`, dan 0 `first_sse_write`. Journal sejak 1 Sep juga memuat 0 `chat_telemetry`; backend `/metrics` tidak tersedia saat audit. Karena itu token provider, duration, TTFB, trimming rate, first-event timing, dan percentile latency semuanya **UNKNOWN**, bukan nol.
3. **Static input dibayar ulang setiap round.** **MEASURED (serialized source artifacts):** system prompt 5.937 byte; active tool catalog sekitar 4.285 byte. Dengan estimator P0.4, kontribusi kasarnya **ESTIMATED** 2.985 + 2.143 = 5.128 token sebelum memory/history/current user. Prefix sama dikirim pada setiap tool-enabled round.
4. **Tool result terbesar berpotensi `get_trip_detail` dan `search_trips`.** `search_trips` membawa satu object yang dipakai sekaligus oleh model, finalizer GenUI, payload `workflow`, dan audit. Projection khusus model layak dievaluasi, tetapi belum aman diterapkan tanpa fixture/eval field-consumption.
5. **P0.4 belum dapat dikalibrasi.** Budget 12.000 adalah soft estimate, bukan model context limit. Rasio actual provider input terhadap estimator, persentase trimmed, rata-rata saved, dan `protected_over_budget` **UNKNOWN** akibat tidak ada sampel telemetry.

Rekomendasi urutan: (1) perbaiki kontrak true-streaming final response dengan test proxy end-to-end; (2) ekspor dan retensi telemetry P0.1–P0.4 ke collector agar audit berbasis request nyata mungkin; (3) ukur serialized component bytes per round tanpa isi; (4) baru evaluasi model-context projection untuk tool result dan structured memory.

## 2. Metode, Data, dan Batas Audit

### 2.1 Sumber

- Backend orchestration: `backend/internal/services/ai_service.go`.
- Provider client: `backend/internal/ai/ai_client.go`.
- Tool execution/result: `backend/internal/services/mcp_service.go`.
- Tool schema: `backend/internal/mcp/tools.go`.
- SSE handler: `backend/internal/handlers/chat_stream_handlers.go`.
- Next proxy: `frontend/src/app/api/v1/chat/route.ts` dan `frontend/src/lib/chatProxy.ts`.
- Browser parser/scheduler/UI: `frontend/src/lib/api.ts`, `frontend/src/components/chat/ChatInterface.tsx`, `frontend/src/lib/chatTelemetry.ts`.
- Telemetry: `backend/internal/telemetry/chat.go` dan P0.4 context budgeting.
- Runtime artifacts: `backend/backend.log`, local journal, local process/metrics check.

### 2.2 Label angka

- **MEASURED:** dibaca langsung dari file/runtime artifact atau serialized source artifact.
- **ESTIMATED:** dihitung memakai estimator/fiksur sintetis dan bukan token provider.
- **UNKNOWN:** tidak tersedia dari artifact audit; tidak diperlakukan sebagai nol.

### 2.3 Ketersediaan data nyata

| Data | Hasil |
|---|---:|
| `backend/backend.log` | **MEASURED:** 747 baris, 115.802 byte |
| Record `chat_telemetry` di log | **MEASURED:** 0 |
| Record `llm_round` | **MEASURED:** 0 |
| Record `context_budget` | **MEASURED:** 0 |
| Record `first_delta` / `first_sse_write` | **MEASURED:** 0 / 0 |
| Record journal `chat_telemetry` sejak 1 Sep | **MEASURED:** 0 |
| Endpoint backend `/metrics` saat audit | **UNKNOWN:** service tidak tersedia |
| Frontend browser telemetry terpusat | **UNKNOWN:** default sink hanya `console.info`; tidak ada export artifact |

Implikasi: audit dapat membuktikan jalur dan overhead statis, tetapi tidak dapat mengklaim latency/token produksi. P0.1 sudah menginstrumentasi nilai yang tepat, namun collector/retention artifact tidak tersedia di environment audit.

## 3. Lifecycle Streaming

```mermaid
sequenceDiagram
    participant UI as ChatInterface
    participant FC as streamChat browser
    participant NP as Next route proxy
    participant GH as Gin streamChat
    participant AS as AIService
    participant AC as ai.Client
    participant LP as LLM provider

    UI->>UI: submit; ensureCustomerSession
    UI->>FC: POST /api/v1/chat stream=true
    FC->>NP: fetch + X-Request-ID
    NP->>GH: allowlisted headers + body
    GH->>AS: ChatStream(onDelta)
    AS->>AC: GenerateStream(messages, tools, onDelta=nil)
    AC->>LP: stream=true
    LP-->>AC: SSE chunks / tool_calls / content
    Note over AC,AS: AC membaca seluruh stream; nil callback menahan semua content
    alt tool_calls ada
        AC-->>AS: complete ToolCalls
        AS->>AS: execute tool; append full result
        AS->>AC: round berikut, kembali onDelta=nil
    else final text tanpa tool_calls
        AC-->>AS: full response setelah provider EOF/[DONE]
        AS-->>GH: finalize + persist assistant/recommendation
        GH-->>NP: SSE done (first write pada jalur umum)
        NP-->>FC: direct ReadableStream
        FC-->>UI: onFirstEvent + onDone
        UI->>UI: TypingText local animation
    end
    opt hanya MaxToolCallRounds habis
        AS->>AC: GenerateStream(messages, no tools, real onDelta)
        AC-->>GH: content callback per provider chunk
        GH-->>UI: delta flush melalui proxy/browser
    end
```

### 3.1 Titik waktu yang tersedia

| Milestone | Instrumentasi | Status audit |
|---|---|---|
| Provider event JSON pertama | `CompletionResponse.TTFB`, dimulai sebelum `HTTPClient.Do` dan di-set pada JSON chunk pertama | Nilai runtime **UNKNOWN** |
| Provider content delta pertama | Tidak dibedakan dari event pertama; chunk awal dapat role/usage/reasoning/tool-call | **UNKNOWN**, telemetry gap |
| Backend menerima content pertama | Tidak ada milestone khusus sebelum callback | **UNKNOWN**, telemetry gap |
| Backend menulis SSE pertama | `first_sse_write` setelah `WriteString` + `Flush` sukses | Nilai runtime **UNKNOWN** |
| Backend menulis delta pertama | `first_delta` setelah flush event `delta` | Nilai runtime **UNKNOWN** |
| Browser response headers | `response-headers` | Nilai runtime **UNKNOWN**, hanya console client |
| Browser complete SSE event pertama | `first-sse-event` setelah delimiter `\n\n` + data non-empty | Nilai runtime **UNKNOWN** |
| Browser menerima delta | `first-delta` sebelum rAF scheduling | Nilai runtime **UNKNOWN** |
| React paint | `first-react-paint` dari `AssistantMessage.useEffect` | Nilai runtime **UNKNOWN**; ini effect pasca-commit, bukan browser paint timestamp presisi |

### 3.2 Apakah provider benar-benar stream?

- **MEASURED (code):** request provider memakai `stream:true`, `Accept: text/event-stream`, dan parser membaca incremental `data:` lines.
- **UNKNOWN (runtime):** tidak ada capture provider chunks atau telemetry real untuk membuktikan provider/model `deepseek-v4-flash` mengirim content bertahap pada request nyata.
- **MEASURED (behavior path):** walaupun provider stream, final content pada jalur umum tidak diteruskan karena callback nil.

### 3.3 Proxy, buffering, parser, render

- Next route handler meneruskan `backendResponse.body` langsung; `Cache-Control:no-cache`, `Connection:keep-alive`, dan `X-Accel-Buffering:no` dipasang. **MEASURED (code).** Tidak ada transform yang sengaja mengumpulkan body.
- Buffering ingress/CDN production **UNKNOWN**; tidak ada proxy timing test atau deployment capture.
- Browser parser mem-buffer hanya sampai separator `\n\n`, lalu dispatch setiap event. **MEASURED (code).** Parser hanya mencari LF; CRLF pada data masih cenderung bekerja karena separator dari backend LF, tetapi matrix proxy/provider belum diukur.
- Delta dikumpulkan dalam ref dan di-flush ke React maksimal sekali per `requestAnimationFrame`; latency scheduling tambahan **ESTIMATED:** 0–16,7 ms pada foreground 60 Hz, bisa lebih besar pada tab throttled.
- `first-react-paint` dicatat melalui effect komponen setelah commit. Gap delta→effect **UNKNOWN**, diperkirakan minimal satu scheduling/render cycle.

### 3.4 Fake/local animation

`onDone` menetapkan `shouldAnimate: !wasStreaming || noDeltasReceived`. Jalur umum menerima nol delta, maka `TypingText` mengungkap 2 karakter per 16 ms, atau 4 karakter per 16 ms untuk teks >500 karakter. **ESTIMATED duration:** sekitar `8 ms × panjang karakter` untuk teks ≤500, atau `4 ms × panjang karakter` untuk >500. Contoh 400 karakter ≈3,2 s; 1.000 karakter ≈4,0 s. Recommendation cards menunggu `completedTyping`, sehingga local animation menunda card walau data sudah ada pada `done`.

## 4. Token Breakdown

### 4.1 Provider usage per round

| Round | Input | Output | Cached input | Total | Duration | TTFB |
|---|---:|---:|---:|---:|---:|---:|
| 1 | **UNKNOWN** | **UNKNOWN** | **UNKNOWN** | **UNKNOWN** | **UNKNOWN** | **UNKNOWN** |
| 2 | **UNKNOWN** | **UNKNOWN** | **UNKNOWN** | **UNKNOWN** | **UNKNOWN** | **UNKNOWN** |
| 3+ | **UNKNOWN** | **UNKNOWN** | **UNKNOWN** | **UNKNOWN** | **UNKNOWN** | **UNKNOWN** |

P0.1 akan mengisi nilai tersebut jika provider mengirim usage. Total harus dihitung per sample sebagai input+output; cached input adalah subset/atribut input provider dan jangan ditambah lagi ke total kecuali kontrak provider menyatakan lain.

### 4.2 Kontribusi input statis/dinamis

| Komponen | Ukuran | Token |
|---|---:|---:|
| System prompt | **MEASURED:** 5.937 byte / 5.925 rune | **ESTIMATED (P0.4):** 2.985 token termasuk reserve lokal bila berdiri sendiri |
| Semua 8 tool schema | **MEASURED:** sekitar 4.285 serialized byte | **ESTIMATED (P0.4):** 2.143 token |
| Memory summary | Maksimum konfigurasi **MEASURED:** 1.800 rune | **ESTIMATED:** hingga sekitar 900+ token dengan bytes/2; Unicode dapat lebih besar dalam byte |
| Historical messages | Maksimum query **MEASURED:** 8 row sebelum P0.4 trim | **UNKNOWN:** isi tidak tersedia |
| Current user | Validasi maksimum **MEASURED:** 4.000 karakter | **ESTIMATED:** hingga sekitar 2.000+ token dengan bytes/2 |
| Tool call args | Dikirim pada assistant `tool_calls` dan diulang round berikut | **UNKNOWN:** tergantung call |
| Tool result | Full JSON di role `tool`, utuh pada round berikut | Lihat §6; fixture saja **ESTIMATED** |

Baseline fixed system+tools sekitar **ESTIMATED 5.128 token per tool-enabled round** menurut estimator konservatif P0.4. Ini bukan actual provider token count.

### 4.3 Context P0.4

P0.4 menghitung `ceil(serialized CompletionRequest bytes/2)+16`, termasuk messages+tools. **MEASURED (code).** Soft limit default 12.000; minimum accepted 8.000. System, memory/system markers, latest user, empat recent row, current tool chain dilindungi; session dengan `selected_trip_id` melindungi seluruh recent history. Protected content dapat melewati limit.

## 5. Round-by-Round dan Multi-Round Overhead

| Komponen | Round 1 | Round 2 | Round N |
|---|---|---|---|
| System prompt | Identik | Identik, dikirim ulang | Identik, dikirim ulang |
| Tool schema | Semua 8 | Semua 8 | Semua 8 sampai forced final |
| Memory summary | Identik | Identik | Identik |
| Historical rows | Sama kecuali P0.4 sudah memangkas | Sama | Sama |
| Current user | Sama | Sama | Sama |
| Current tool chain | Kosong | Tool call/result round 1 | Akumulasi semua round sebelumnya |

Untuk satu tool workflow, model membayar static prefix minimal dua kali. **ESTIMATED fixed repeated cost:** sekitar 5.128 token tambahan pada round 2, belum termasuk history dan tool result. Untuk dua tool rounds sebelum final text, static prefix dibayar tiga kali. Actual cache discount/cached token **UNKNOWN**; provider field `cached_input_tokens` didukung P0.1 tetapi tidak ada sampel.

P0.4 memanggil `messagesForRequest` tiap round. Setelah history lama dipangkas, current-turn assistant/tool chain tidak pernah dipangkas. Karena itu estimate dapat tumbuh round-ke-round dan berakhir `protected_over_budget`; frekuensinya **UNKNOWN**.

Tidak direkomendasikan menghapus prefix pada round berikut: Chat Completions stateless memerlukan full request, kecuali migrasi API/provider menawarkan server-side conversation/prompt caching dengan kontrak jelas.

## 6. Audit Tool Result

Ukuran aktual production bergantung data DB/user dan **UNKNOWN**. Angka berikut berasal dari JSON fixture sintetis dengan field production, sehingga berlabel **ESTIMATED**, bukan hasil user nyata.

| Tool | Ukuran result fixture | Kebutuhan model | Kebutuhan GenUI/finalizer | Persistence/audit | Projection model |
|---|---:|---|---|---|---|
| `search_trips` | Empty 105 B; 3 paket representatif 1.875 B **ESTIMATED** | id/title/destination/duration/summary/highlights, pricing/discount | Hampir semua package fields termasuk slug/location/category/image/pricing/reason | Full result masuk `workflow` dan audit | Kandidat terbesar; jangan hapus field sebelum golden eval karena satu result dipakai tiga consumer |
| `select_package` | 117 B **ESTIMATED** | success, trip_id/error | `selected_trip_id` authoritative | Full audit/workflow | Gain kecil; tidak prioritas |
| `collect_order_detail` | 258 B **ESTIMATED** | draft lengkap untuk langkah berikut | Workflow mungkin dikirim client; GenUI tidak memakai draft aktif | Audit butuh payload/result | Mengandung kontak/PII; projection/state terstruktur potensial, tetapi raw field dibutuhkan booking continuation saat ini |
| `create_booking` | 305 B **ESTIMATED** | success/code/order/status/total | `order_gate` memakai code/order ID; workflow diteruskan | Audit/order trace | Duplicate `order_id`/`booking_id`, `status`/`booking_status`; kandidat setelah consumer contract dipisah |
| `get_trip_detail` | **UNKNOWN**, data-dependent; dapat terbesar | Detail katalog, itinerary, amenities, prices, quota, dates | Tidak membentuk recommendation card dari tool ini | Full audit/workflow | Strong candidate query-specific projection, tetapi intent field selection tidak boleh keyword heuristic |
| `calculate_trip_price` | 465 B **ESTIMATED** | unit prices, pax, subtotals, total, discount | Tidak dibutuhkan recommendation finalizer | Audit/workflow | Banyak field diperlukan untuk penjelasan transparan; gain sedang |
| `check_trip_availability` | 457 B **ESTIMATED** | date/pax/available/confirmed/reasons/window/quota | Tidak dibutuhkan recommendation card | Audit/workflow | `note` sebagian redundan dengan fields/prompt, tetapi jangan hapus tanpa eval |
| `check_order_status` | 375 B **ESTIMATED** | exists/id/status/payment/total/note | Order UI terutama memakai `order_gate` dari create result | Audit/workflow | Duplicate ID + prose note kandidat projection |

Semua tool result diserialisasi penuh oleh `toolResultMessage`, ditambahkan ke current turn, dan dikirim ulang pada setiap round berikutnya. **MEASURED (code).** Tidak ada result yang diubah dalam audit.

### Pemisahan consumer yang direkomendasikan

P1 berikutnya sebaiknya membentuk tiga representasi dari satu authoritative `ToolResult`, tanpa mengubah tool semantics:

1. **Model context projection:** field minimum untuk keputusan/jawaban round berikut.
2. **GenUI/finalization projection:** seluruh field card/order gate yang dibutuhkan.
3. **Audit persistence:** full original payload/result.

Syarat aman: snapshot per tool, fixture multi-round, GenUI reload/alternative tests, booking/order gate tests, dan per-field consumer map. Jangan lakukan generic JSON truncation.

## 7. Memory Analysis

- `MemorySummary` bukan semantic summary. Ia merupakan suffix raw transcript: tail messages digabung `role: content`, lalu dibatasi suffix rune hingga `AIMemoryMaxChars=1800`. **MEASURED (code/config).** Generation tetap background setelah `done` dan tidak diubah.
- Saat build, setiap recent message yang `Content`-nya ditemukan sebagai substring line memory dihapus dari memory copy. Exact obvious overlap sudah dicegah. **MEASURED (code).** Overlap parsial, role formatting mismatch, duplicate short content, atau suffix yang memotong line dapat lolos; rate **UNKNOWN**.
- Memory dapat memuat user contact/order text dan system order marker; selection authoritative tersimpan di `ChatSession.SelectedTripID`, tetapi ID itu tidak diinjeksi sebagai structured model state. Mengganti memory dengan summary bebas berisiko kehilangan selected trip, alternatif terakhir, pax/date/contact completeness, guest-limit code, dan order status.
- Structured summary layak sebagai P2: selected trip ID/title, latest recommendation IDs, order marker/status, pax/date, boolean contact-presence, dan soft preferences. Raw PII sebaiknya tidak disalin bila boolean/presence cukup. Namun structured state harus diupdate dari backend/tool result, bukan assistant prose, dan raw transcript window tetap dipertahankan.
- Ukuran memory aktual dan persentase informasi yang dipakai model **UNKNOWN** karena tidak ada per-request component telemetry atau model attribution.

## 8. Evaluasi Context Budget P0.4

| Pertanyaan | Hasil |
|---|---|
| Actual provider tokens vs estimator | **UNKNOWN** — 0 sample correlated |
| Request terkena trimming | **UNKNOWN** — 0 `context_budget` record |
| Token rata-rata dihemat | **UNKNOWN** |
| Request `protected_over_budget` | **UNKNOWN** |
| Limit 12.000 terlalu tinggi/rendah | **UNKNOWN** berbasis data nyata |

Secara struktural, limit memberi ruang **ESTIMATED** sekitar 6.872 token setelah fixed system+tools, sebelum menghitung framing gabungan. Memory maksimum dan current prompt maksimum dapat menghabiskan sekitar 2.900+ token estimasi, menyisakan sekitar 3.900 untuk history. Namun estimator bytes/2 sengaja konservatif dan model aktif lokal `deepseek-v4-flash`; model context limit/tokenizer tidak dikonfigurasi. Jangan menaikkan/menurunkan 12.000 sebelum mengumpulkan distribusi actual/estimate ratio dan `protected_over_budget` per round.

Dataset minimum kalibrasi: ≥500 chat request sukses, ≥100 tool workflows, ≥30 sesi dengan memory, ≥30 selected sessions, dan tail p95/p99. Angka sample target ini **RECOMMENDED**, bukan hasil ukur.

## 9. Frontend Analysis

1. **Auth preflight:** `ensureCustomerSession()` berada sebelum request chat. Token valid cepat; refresh menambah network RTT. Nilai **UNKNOWN** tetapi event `submit`→`auth-ready` tersedia di console.
2. **Response headers:** browser callback terjadi setelah fetch mendapat headers. Gin belum menulis event awal/heartbeat, sehingga beberapa runtime/proxy dapat menahan headers sampai body pertama. Pada jalur umum body pertama adalah `done` setelah LLM selesai. **MEASURED (code path)**; behavior socket spesifik **UNKNOWN**.
3. **SSE buffering:** Next route melakukan direct body pipe; browser parser incremental. Tidak terlihat buffering aplikasi selain incomplete SSE block. Production ingress buffering **UNKNOWN**.
4. **Render frequency:** rAF batching membatasi state update delta menjadi maksimal sekali/frame. Baik untuk CPU/layout; overhead pertama **ESTIMATED** ≤1 frame foreground.
5. **Fake animation:** aktif saat nol delta. Ini jalur umum akibat backend nil callback. Recommendation card menunggu local typing selesai.
6. **First-paint metric:** effect komponen mencatat commit pertama, bukan `PerformanceObserver` paint. Masih berguna relatif, tetapi tidak membedakan parse→setState→commit→actual raster.
7. **Direct rendering:** ya, bila delta tersedia, `onDelta` memasukkannya ke buffer dan frame berikut merender tanpa menunggu `done`. Hambatan ada di backend orchestration, bukan parser/UI.

## 10. Prioritized Findings

### P0

#### P0-1 — Final response tidak true-stream pada jalur umum

- Bukti: `generateWithToolLoopStream` selalu memanggil `GenerateStream(..., nil)` dalam loop; branch tanpa tool call return full text tanpa callback.
- Dampak latency: potensi perbaikan dari full completion duration menjadi provider content TTFB + proxy + ≤1 frame. Besaran **UNKNOWN** sampai telemetry tersedia.
- Dampak token: **ESTIMATED 0**; jumlah call/context tidak perlu berubah.
- Risiko fix: tinggi pada duplicate-prefix BUG-12. Solusi harus menahan preamble hanya bila round ternyata tool-call, sesuatu yang tidak selalu diketahui sebelum stream selesai.
- Next change exact: buat provider fixture yang membedakan pure final-content vs content+preamble+tool_calls; implementasikan spool kecil/decision gate yang hanya forward setelah round dipastikan final, atau gunakan provider capability/finish semantics yang aman. Jangan forward blind semua content.

#### P0-2 — Telemetry tidak punya durable dataset

- Bukti: 0 record lokal meski instrumentation ada.
- Dampak: semua keputusan percentile/token budget tidak dapat divalidasi.
- Next change exact: arahkan structured `chat_telemetry` ke collector/log retention; ekspor frontend events ke first-party endpoint/observability sink dengan sampling dan schema existing tanpa payload. Retensi harus mengizinkan join via request ID tetapi tetap tanpa PII.

### P1

#### P1-1 — Tambah component-size telemetry numerik per round

Catat serialized bytes/estimated tokens untuk system, tools, memory, history, current user, tool calls, tool results, total before/after; hanya angka, tanpa isi. Ini memungkinkan actual provider input dibanding estimator. Expected token impact **ESTIMATED 0**; observability saja. Risiko rendah.

#### P1-2 — Model-context projection untuk `search_trips` dan `get_trip_detail`

Pisahkan model projection dari full ToolResult yang tetap dipakai GenUI/audit/persistence. Expected token impact **UNKNOWN**; kemungkinan terbesar pada catalog/detail rounds. Risiko sedang-tinggi karena recommendation/pricing/alternative completeness.

#### P1-3 — True-streaming test melewati seluruh proxy

Fixture provider lokal mengirim chunk dengan delay; assert waktu provider content, backend first delta, browser first event, first render, done; jalankan direct backend dan Next production proxy. Expected latency impact **ESTIMATED 0** untuk test, tetapi mencegah regresi buffering.

### P2

#### P2-1 — Structured backend-authoritative conversation state

Representasikan selection/order/draft completeness terpisah dari raw memory; kemudian history selected session dapat ikut budget dengan aman. Expected token impact **UNKNOWN**, berpotensi besar pada long selected/order sessions. Risiko tinggi; perlu migrasi/state invariants.

#### P2-2 — Provider prompt caching/capability discovery

Ukur `cached_input_tokens`; bila provider mendukung stable-prefix caching, pertahankan ordering/byte identity system+tools. Jangan mengasumsikan cache dari model name. Impact **UNKNOWN** sampai provider usage tersedia.

#### P2-3 — Kalibrasi budget 12.000

Sesudah dataset cukup, hitung per-round `actual_input / estimated_after`, trim rate, saved distribution, dan protected-over-budget. Ubah limit hanya dengan regression corpus. Impact **UNKNOWN**.

### P3

#### P3-1 — Ukur browser actual paint

Tambahkan `performance.mark/measure` atau observer terkontrol untuk first content commit/paint. Jangan kirim DOM/content. Latency impact **ESTIMATED 0**.

#### P3-2 — Hilangkan local animation setelah true streaming stabil

Pertahankan fallback untuk provider/proxy tanpa delta; jangan hapus sebelum P0-1 dan test matrix lulus. Potensi card-visible improvement sama dengan durasi `TypingText`, **ESTIMATED** beberapa detik untuk respons ratusan karakter.

## 11. Expected Impact dan Risk Matrix

| Perubahan rekomendasi | Expected latency | Expected token | Risiko behavior |
|---|---|---|---|
| True-stream final response | **UNKNOWN**, kemungkinan besar pada visible TTFT | **ESTIMATED 0** | Tinggi: duplicate preamble/tool-call rounds |
| Durable telemetry export | **ESTIMATED** sangat kecil, async/sampled | **ESTIMATED 0** | Rendah bila failure-isolated |
| Numeric component telemetry | **ESTIMATED** sangat kecil | **ESTIMATED 0** | Rendah |
| `search_trips` model projection | **UNKNOWN**, serialization/context lebih kecil | **UNKNOWN**, kemungkinan sedang-besar | Sedang-tinggi: GenUI/pricing |
| `get_trip_detail` model projection | **UNKNOWN** | **UNKNOWN**, data-dependent | Tinggi: detail omission |
| Structured state/memory | **UNKNOWN** | **UNKNOWN**, kemungkinan besar long sessions | Tinggi: state loss |
| Budget retuning | **UNKNOWN** | **UNKNOWN** | Sedang-tinggi tanpa corpus |

## 12. Exact Recommended Next Changes

1. Bangun benchmark harness local provider SSE dengan timestamp chunk dan usage deterministik; jangan ubah production behavior dahulu.
2. Jalankan corpus: greeting, initial search, select, explicit alternative, detail, price, availability, incremental order fields, create booking, duplicate/guest limit, selected-session long history.
3. Capture satu row per request/round: backend stage timestamps, provider TTFB/usage, context estimate, tool duration, frontend milestones. Agregasi p50/p95/p99 dan actual/estimate ratio.
4. Tambah component byte counters numerik di P0.4 decision telemetry.
5. Prototipe final-round streaming di branch dengan fixture content+tool-call preamble; require no duplicate prefix and unchanged call count.
6. Buat per-tool consumer matrix executable/snapshot. Mulai projection dari `search_trips`; full ToolResult tetap untuk finalizer/GenUI/audit.
7. Setelah data, putuskan budget 12.000 dan feasibility structured state. Jangan gabungkan retuning budget dengan streaming fix.

## 13. Perubahan yang Explicitly Tidak Direkomendasikan

- Jangan mengurangi jumlah LLM call dengan menggabungkan business operations.
- Jangan menghapus/meringkas system prompt tanpa eval.
- Jangan melakukan dynamic tool removal; P0.3 sudah membuktikan state authoritative sekarang belum cukup.
- Jangan truncate tool JSON generik atau membuang itinerary/pricing berdasarkan keyword.
- Jangan forward semua provider content dari tool-selection round; ini menghidupkan kembali duplicate-prefix BUG-12.
- Jangan menghapus local animation sebelum true streaming terbukti lintas proxy; tetap dibutuhkan fallback.
- Jangan mengganti raw memory dengan LLM summarization call baru.
- Jangan menurunkan/menaikkan 12.000 dari asumsi model context window.
- Jangan memasukkan prompt, tool args/result, session/user ID, email, token, OAuth credential, atau PII ke telemetry.
- Jangan mengubah persistence assistant+recommendation sebelum `done`, recovery EOF, selected-trip authority, alternative semantics, atau order/auth gates demi latency.

## 14. Kesimpulan

Masalah P1 paling kuat berada di boundary streaming, bukan React parser: provider request berbentuk stream, tetapi orchestration menahan final content karena callback nil pada semua round normal. Token bottleneck utama adalah fixed 10.222 byte system+tools yang diulang, ditambah full tool results yang tumbuh antar-round. Namun tidak ada dataset telemetry runtime untuk mengukur actual token/TTFB/trim rate, sehingga seluruh angka production tetap **UNKNOWN**. Langkah aman berikut: durable measurement, proxy streaming test, lalu perubahan terisolasi true-streaming dan model-context projection dengan regression corpus lengkap.