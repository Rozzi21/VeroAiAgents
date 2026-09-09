# Audit Frontend Google OAuth (Customer Frontend)

Tanggal: 9 Sep 2026. Scope: read-only, hanya frontend customer (`frontend/`).
Backend hanya dibaca untuk memvalidasi kontrak (format fragment, `return_to`).
Tidak ada kode yang diubah.

**Status tindak lanjut (10 Sep 2026):** F-01, F-02, F-04, F-05, F-06, F-07,
F-08 SUDAH diperbaiki (lihat §7, §8, dan §9). Masih terbuka: F-03 (XSS pada
localStorage — accepted risk).

## 1. Flow Aktual Frontend

```
GoogleButton (login/register/trip/[id]/chat)
  → window.location.href = /api/v1/auth/google?return_to=<pathname+query saat ini>
  → backend → consent Google → GET /api/v1/auth/google/callback
  → backend 302 → {GOOGLE_OAUTH_FRONTEND_URL}{return_to}#access_token=..&token_type=Bearer&expires_in=..&provider=google
     + Set-Cookie refresh (HttpOnly, path /api/v1/auth)
  → OAuthReceiver (mounted di /login, /register, /trip/[id], ChatInterface)
     1. consumeOAuthFragment(window.location.hash) — validasi bentuk JWT + size cap
     2. history.replaceState → fragment dibersihkan DULU (apa pun hasilnya)
     3. setCustomerAccessToken(token, expiresIn) → localStorage
        (vero_customer_access_token + vero_customer_access_token_expires_at)
     4. window.location.replace(path bersih) → reload penuh
  → Setelah reload: tidak ada restore otomatis; token dibaca lazily
     - apiFetch / streamChat menyisipkan Authorization: Bearer bila token valid
     - ensureCustomerSession() dipanggil sebelum chat (ChatInterface L283),
       select-package (L429), create order (trip/[id] L62), track order
       (order/[id] L18)
  → Token kedaluwarsa/hilang → POST /api/v1/auth/refresh (cookie HttpOnly,
     rotasi single-use) → token baru disimpan
  → Refresh 401 → clearCustomerAccessToken() → state "anonymous"
  → customerLogout() → POST /api/v1/auth/logout (revoke server session)
     + clear token lokal — TAPI tidak dipanggil dari UI mana pun (lihat F-01)
```

Catatan kontrak backend (terverifikasi, bukan diaudit):
- Fragment dibangun di `backend/internal/handlers/google_auth_handlers.go:127-133`
  (`access_token`, `token_type`, `expires_in`, `provider`).
- `return_to` di-sanitize server-side `sanitizeReturnTo`
  (`backend/internal/services/google_oauth_service.go:501-510`): hanya path
  site-relative, tolak `//`, `\r\n`, backslash; fallback `/`. Origin selalu dari
  config `GOOGLE_OAUTH_FRONTEND_URL`, tidak pernah dari request. Open-redirect
  guard ada di backend — frontend hanya mengirim path lokal.
- Error dialihkan ke `{return_to|/login}?auth_error=<code>` (log-safe code).

## 2. Temuan

Severity: P0 = eksploitasi langsung / token bocor; P1 = sesi/keamanan fungsional
rusak; P2 = celah kualitas keamanan atau race nyata; P3 = kosmetik/UX.

### F-01 (P1) — [FIXED 9 Sep 2026] Tidak ada UI logout; `customerLogout()` dead code
- File: `frontend/src/lib/api.ts:204-215`; pemakaian: tidak ada di `frontend/src`.
- Bukti: `grep customerLogout frontend/src` hanya menemukan definisi + komentar.
  Tidak ada tombol/menu sign-out di halaman mana pun. Tidak ada pula pemanggilan
  `/api/v1/auth/me`, jadi tidak ada indikator status login.
- Dampak: user tidak bisa mengakhiri sesi (shared device → refresh cookie tetap
  hidup sampai TTL). Fungsi logout sendiri sudah benar (revoke server + clear
  token + aman saat network gagal), tapi tidak terjangkau. Pertanyaan audit
  "apakah logout membersihkan state frontend" → implementasi ya, reachable tidak.

### F-02 (P2) — [FIXED 9 Sep 2026] Race refresh lintas-tab: dedup hanya per-tab
- File: `frontend/src/lib/api.ts:169-197`.
- Bukti: `refreshInFlight` adalah variabel modul JS — hanya dedup dalam SATU tab.
  Dua tab dengan token kedaluwarsa yang sama-sama memanggil `POST /auth/refresh`
  membawa cookie refresh yang sama; rotasi backend single-use → satu tab menang,
  tab lain 401. Karena backend punya reuse-detection yang me-revoke semua sesi,
  skenario terburuk: kedua tab logout paksa.
- Komentar kode ("so two tabs/components do not race") menyesatkan — hanya
  komponen dalam satu tab yang ter-dedup. Test `api.test.ts:77` hanya menguji
  concurrency dalam satu proses.
- Dampak: logout mendadak saat multi-tab, bukan kebocoran token.
- **Perbaikan 9 Sep 2026:** `frontend/src/lib/refreshCoordinator.ts`. Primary
  `navigator.locks` serialisasi cross-tab dan browser melepas lock otomatis
  bila holder crash/tutup. Fallback: mutex localStorage dengan TTL stale 40 dtk
  (> timeout request 35 dtk), event `storage` untuk membangunkan waiter (tanpa
  refresh polling), dan re-check token setelah lock. Hanya entry lock + marker
  outcome `active`/`anonymous` disimpan; refresh token tetap cookie HttpOnly.
  401 menulis marker `anonymous` sehingga waiter tidak mengirim refresh kedua.
  Logout juga menulis marker; token dari refresh yang selesai sesudah logout
  dibuang. Lihat test `frontend/tests/unit/lib/refreshCoordinator.test.ts`.

### F-03 (P2) — Token di localStorage rentan XSS (accepted risk, terdokumentasi)
- File: `frontend/src/lib/authToken.ts:1-17`.
- Setiap script ter-injeksi bisa membaca `vero_customer_access_token`. Mitigasi
  yang sudah ada: TTL 15 menit, refresh token HttpOnly tidak terbaca JS,
  validasi bentuk token, purge saat kedaluwarsa, tidak ada token di console/URL.
  Tidak ada CSP ketat di frontend yang terlihat dalam scope audit ini.
- Dampak: jika ada XSS, blast radius = access token 15 menit (bukan refresh).

### F-04 (P3) — [FIXED 9 Sep 2026] OAuth error senyap di trip page dan chat
- File: `frontend/src/app/trip/[id]/page.tsx:97`, `ChatInterface.tsx:447` —
  `<OAuthReceiver />` tanpa `onError`.
- Bukti: hanya `/login` dan `/register` yang meneruskan `onError={setError}`.
  Di trip/chat, `?auth_error=...` di-strip dari URL tanpa pesan; fragment
  invalid juga hilang tanpa feedback.
- Dampak: user gagal login Google dari trip/chat tanpa tahu kenapa. Bukan celah
  keamanan.

### F-05 (P3) — [FIXED 9 Sep 2026] Setelah sukses OAuth dari /login atau /register, user tetap di halaman auth
- File: `frontend/src/components/auth/OAuthReceiver.tsx:29-33`.
- Bukti: sukses → `window.location.replace(clean)` ke path yang sama
  (`return_to` = halaman asal). Login password justru redirect ke `/`
  (`login/page.tsx:25`, `register/page.tsx:23`).
- Dampak: inkonsistensi perilaku Google vs password. User "terjebak" di halaman
  login padahal sudah authenticated. Bukan loop (fragment sudah bersih).

### F-06 (P3) — [FIXED 9 Sep 2026] `return_to` membawa query saat ini, termasuk `auth_error` basi
- File: `frontend/src/components/auth/GoogleButton.tsx:13-16`.
- Skenario: user di `/login?auth_error=access_denied` (sebelum receiver strip,
  atau dari link lama) klik Google → sukses → kembali ke
  `/login?auth_error=access_denied#access_token=...`. Receiver membersihkan
  fragment tapi MEMPERTAHANKAN query (`clean = pathname + search`), lalu reload
  → pesan error basi tampil sesaat setelah login sukses, baru di-strip.
- Dampak: pesan error menyesatkan sesaat. Tidak ada risiko open redirect
  (sanitize server-side).

### F-07 (P3) — [FIXED 10 Sep 2026] Tidak ada retry 401 di apiFetch customer (beda dengan backoffice)
- File: `frontend/src/lib/api.ts:276-314`.
- Bukti: backoffice punya retry 401 otomatis; customer tidak. Mitigasi parsial:
  `getCustomerAccessToken()` mem-purge token kedaluwarsa secara eager + skew 30
  detik, dan endpoint penting didahului `ensureCustomerSession()`. Sisa celah:
  token yang kedaluwarsa di antara cek klien dan validasi server → 401 mentah
  ke user tanpa satu kali refresh+retry.
- Dampak: error sporadik, bukan kebocoran.

### F-08 (P3) — [FIXED 9 Sep 2026] Kegagalan storage saat sukses OAuth senyap
- File: `frontend/src/components/auth/OAuthReceiver.tsx:29-40`.
- Jika `setCustomerAccessToken` return false (storage penuh/ditolak), fragment
  sudah dibersihkan, tidak ada reload, tidak ada `onError` — user tampak tidak
  login tanpa penjelasan.

## 3. Perilaku yang Sudah Benar (terverifikasi)

- Token tidak pernah menetap di URL/history: fragment dibersihkan SEBELUM reload
  (`replaceState` dulu, baru storage), `window.location.replace` tidak menambah
  entri history. Fragment tidak dikirim ke server dan tidak masuk header
  Referer (per spec).
- Token tidak pernah di-log: `parseJsonEnvelope` hanya log metadata (status,
  contentType, bodyLength), ada test khusus (`api.test.ts:141-194`).
- Token hanya dikirim sebagai `Authorization: Bearer`, tidak pernah di URL
  (test `api.test.ts:122-132`).
- Fragment forged/malformed: divalidasi bentuk JWT + cap 8 KiB; value invalid
  tidak pernah disimpan/dikirim, fragment tetap di-strip (`authToken.ts:153-181`,
  test `authToken.test.ts:66-80`).
- `expires_in`: dihormati dari fragment/JSON; fallback ke `exp` claim; skew 30
  detik; token kedaluwarsa di-purge eager, bukan cuma disembunyikan
  (`authToken.ts:80-124`, test lengkap).
- Refresh 401 → clear token lokal, state anonymous (test `api.test.ts:66-75`).
- Network failure saat refresh TIDAK menghapus token (sesi mungkin masih valid).
- `customerLogout` tetap clear token lokal saat network gagal (`finally`).
- `oauthErrorMessage` tidak pernah echo input mentah (anti-XSS via pesan error,
  test `authToken.test.ts:144-151`).
- Open redirect: mustahil dari sisi frontend — origin redirect selalu dari
  config backend; `return_to` di-sanitize server-side.
- Multi-tab logout: localStorage shared per-origin → clear di satu tab terlihat
  tab lain pada read berikutnya.
- Reload tetap authenticated: token persist di localStorage; kedaluwarsa →
  refresh lazy dari cookie. (Catatan: tidak ada pemulihan profil UI karena
  `/auth/me` tidak dipakai — tidak ada tampilan "logged in as ...".)
- Duplicate/late callback: state OAuth single-use di backend; fragment di-history
  sudah di-replace sehingga back/reload tidak memproses ulang. Double-klik
  GoogleButton aman (full-page navigation, state kedua gagal dengan
  `auth_error`).
- Suspense: semua `GoogleButton` (pakai `useSearchParams`) dibungkus
  `<Suspense>`; `OAuthReceiver` tidak butuh.
- Semua halaman yang punya `GoogleButton` juga memasang `OAuthReceiver` —
  `return_to` tidak pernah mendarat di halaman tanpa receiver.


## 4. Rekomendasi Fix (berdasarkan prioritas)

1. **F-01 (P1):** tambahkan entry point logout (menu/tombol) yang memanggil
   `customerLogout()`, plus panggilan `GET /api/v1/auth/me` untuk menampilkan
   status sesi. Tanpa ini fitur auth setengah jadi.
2. **F-02 (P2):** koordinasi refresh lintas-tab — mis. kunci via
   `navigator.locks`, BroadcastChannel, atau marker `refreshing` di localStorage
   dengan timestamp; tab kalah menunggu lalu re-read token. Alternatif: pada 401
   rotasi, baca ulang token terbaru dari storage dulu sebelum clear.
3. **F-03 (P2):** pertahankan mitigasi; pertimbangkan CSP ketat +
   Trusted Types di frontend; jangan pindah access token ke cookie tanpa
   proteksi CSRF tambahan.
4. **F-04 (P3):** teruskan `onError` di trip/chat (toast atau inline message).
5. **F-05 (P3):** setelah sukses OAuth di `/login`/`/register`, redirect ke `/`
   (atau `return_to` eksplisit) agar konsisten dengan password login.
6. **F-06 (P3):** `GoogleButton` membuang param `auth_error` (dan param OAuth
   lain) dari `return_to`; atau `OAuthReceiver` membersihkan query OAuth sebelum
   reload sukses.
7. **F-07 (P3):** satu kali refresh+retry pada 401 di `apiFetch` customer,
   meniru pola backoffice.
8. **F-08 (P3):** jika `setCustomerAccessToken` gagal, panggil `onError`
   generik.

## 5. Test yang Ada dan Gap

Ada (Node runner, `frontend/tests/`):
- `unit/lib/authToken.test.ts` — validasi bentuk, fragment parsing (incl.
  malicious), expiry/skew/marker, purge, multi-tab clear, error mapping.
- `unit/lib/api.test.ts` — short-circuit token valid, refresh on expiry,
  refresh 401 logout aman, dedup refresh concurrent (satu proses), logout saat
  network gagal, Bearer hanya di header, crafted localStorage tidak terkirim,
  token tidak bocor ke console.

Gap:
- Tidak ada test komponen untuk `OAuthReceiver` (fragment → replaceState →
  reload) dan `GoogleButton` (konstruksi `return_to`) — butuh jsdom/happy-dom.
- Tidak ada test untuk alur `?auth_error=` (tampil + strip).
- ~~Tidak ada test race refresh LINTAS-tab~~ — terpenuhi 9 Sep 2026 oleh
  `refreshCoordinator.test.ts` (serialisasi, reuse hasil, 401, logout race,
  stale lock).
- Tidak ada test F-05/F-06 (perilaku pasca-sukses di halaman auth).
- Duplikat nama test di `api.test.ts:103` dan `:111` (isi sama) — kosmetik.
- Tidak ada E2E (Playwright/dsb) sama sekali.

## 6. Kesiapan E2E Lokal

Sebagian siap, dengan catatan:
- Prasyarat env: backend `GOOGLE_OAUTH_ENABLED=true` + `GOOGLE_CLIENT_ID/SECRET`
  + akun test user di consent screen (status Testing). Frontend tidak butuh env
  tambahan (proxy `/api` via rewrite Next.js).
- Bisa di-E2E sekarang: start flow dari 4 lokasi tombol, callback → fragment →
  token tersimpan, reload tetap authenticated, order/chat sebagai user
  authenticated, refresh setelah kedaluwarsa, refresh 401 → anonymous.
- TIDAK bisa di-E2E tanpa perubahan: logout (tidak ada UI, F-01) dan verifikasi
  status login visual (tidak ada `/auth/me` di UI). Langkah logout hanya bisa
  lewat `customerLogout()` manual dari console.
- Stubbing Google consent sulit tanpa mock backend; realistisnya E2E lokal
  memakai akun Google test atau backend stub yang langsung 302 dengan fragment
  tiruan (cukup untuk menguji OAuthReceiver + token lifecycle).


## 7. Fix yang Diimplementasikan (9 Sep 2026)

Semua perubahan frontend-only; backend/PKCE/DB/business logic tidak disentuh.
Hardening token existing (validasi JWT shape, cap 8 KiB, skew 30 dtk, purge
eager, log metadata-only) dipertahankan.

- **F-01:** komponen baru `frontend/src/components/auth/AuthStatus.tsx` dipasang
  di root `Sidebar` (menggantikan blok statis "My Profile"). Saat mount:
  `ensureCustomerSession()` → `fetchCurrentCustomer()` (`GET /api/v1/auth/me`,
  helper baru di `api.ts`). Anonymous → link Login/Create Account;
  authenticated → nama/email + tombol logout → `customerLogout()` →
  `window.location.href = "/login"` (full-page navigation juga membersihkan
  state in-memory).
- **F-04:** `OAuthReceiver` di `trip/[id]/page.tsx` dan `ChatInterface.tsx` kini
  meneruskan `onError` ke state banner (`role="alert"` di chat) — auth_error,
  fragment invalid, dan kegagalan storage semuanya tampil.
- **F-05:** helper murni `postOAuthSuccessPath()` di `authToken.ts` — sukses
  dari `/login`/`/register` → redirect `/`; halaman lain reload di tempat.
- **F-06:** helper murni `sanitizeOAuthReturnQuery()` di `authToken.ts` membuang
  param one-shot (`auth_error`, `google_linked`); dipakai `GoogleButton` saat
  membangun `return_to` DAN `OAuthReceiver` saat membersihkan URL.
- **F-08:** `OAuthReceiver`: bila `setCustomerAccessToken` menolak token valid,
  `onError` dipanggil dengan pesan storage eksplisit; tidak ada reload sukses.

Test baru: `authToken.test.ts` (sanitizeOAuthReturnQuery, postOAuthSuccessPath)
dan `api.test.ts` (fetchCurrentCustomer Bearer, no-token setelah logout).
Validasi: `npm test` 81/81 pass, `tsc --noEmit` bersih, `next lint` bersih,
`next build` sukses, `git diff --check` bersih.

Catatan E2E lokal (revisi §6): logout kini bisa di-E2E lewat tombol di Sidebar;
status login tampak dari nama/email user. F-02 kini bisa diuji E2E dengan dua
context/tab browser yang tokennya kedaluwarsa bersamaan: satu `POST /auth/refresh`,
keduanya active dengan access token sama; lalu skenario 401/logout-during-refresh
harus membuat keduanya anonymous. Consent Google sungguhan tetap butuh akun test
atau mock backend callback.

## 8. Fix F-02 — Koordinasi Refresh Lintas-Tab (9 Sep 2026)

File: `frontend/src/lib/refreshCoordinator.ts`, dipanggil oleh
`ensureCustomerSession()` di `frontend/src/lib/api.ts`.

1. **Expired bersamaan:** `refreshInFlight` tetap dedup dalam tab. Antar-tab,
   `navigator.locks.request("vero-customer-refresh", ...)` memastikan hanya satu
   request refresh. Waiter masuk critical section setelah holder selesai, baca
   token access baru dari localStorage, lalu return `active` tanpa HTTP refresh.
2. **Fallback browser:** bila Web Locks tidak ada, lock
   `vero_customer_refresh_lock` di localStorage. Holder lock diidentifikasi per
   tab; hanya owner boleh release. Lock >40 dtk stale dan dapat diambil tab lain.
   Waiter memakai `storage` event + timeout batas; tidak ada polling request.
3. **Tab crash/tutup:** Web Locks auto-release. Fallback holder crash → TTL stale
   40 dtk (lebih besar dari timeout API 35 dtk); setelah deadline koordinasi 90
   dtk, satu refresh direct mencegah hang permanen.
4. **401:** coordinator purge access token dan tulis result marker anonymous.
   Waiter melihat marker segar dan return anonymous tanpa refresh kedua. Marker
   berisi status+timestamp saja, tidak ada refresh token atau access token.
5. **Logout saat refresh:** `customerLogout()` clear token lalu tulis marker
   anonymous. Holder refresh cek marker setelah respons; bila logout terjadi
   selama request, token baru dibuang. `AuthStatus` mendengar `storage` event
   untuk sinkron UI antar-tab.
6. **Network failure:** tidak ada marker anonymous dan token tidak dipurge;
   refresh berikutnya boleh retry, mempertahankan behavior existing.

Test `refreshCoordinator.test.ts`: no-contention, 2 caller concurrent satu
refresh, 401 propagation, network retry, logout race, owner release, stale lock,
corrupt entry, dan deadline lock wedged. Validasi final: `npm test` 90/90 pass,
`npx tsc --noEmit`, `npm run lint`, `npm run build`, `git diff --check` bersih.

## 9. Fix F-07 — Retry 401 Terbatas dan Aman (10 Sep 2026)

File: `frontend/src/lib/api.ts`; test: `frontend/tests/unit/lib/api.test.ts`.

1. `apiFetch()` menangani 401 lewat `ensureCustomerSession()` yang tetap memakai
   `coordinatedRefresh()` F-02. Token ditolak dibersihkan hanya bila masih menjadi
   token terkini, sehingga 401 terlambat tidak menghapus token baru request lain.
2. Refresh sukses membangun ulang request dengan access token baru dan mengulang
   tepat satu kali. 401 kedua langsung dilempar; `/auth/refresh` tidak masuk loop.
3. GET/HEAD/OPTIONS boleh diulang. Mutation hanya boleh diulang untuk allowlist
   kontrak idempotency existing (`POST /bookings` dan `POST /orders`), bila caller
   memasok `Idempotency-Key` dan body bukan `ReadableStream`. Header arbitrer
   tidak membuat mutation lain aman. Key sama dipertahankan pada replay.
4. Refresh 401 mempertahankan F-02: token dibersihkan, marker anonymous ditulis,
   request awal tidak diulang. Kegagalan network/parse refresh tidak menulis
   marker anonymous dan dilempar sebagai error refresh, bukan logout paksa.
5. Header `Authorization` eksplisit milik caller tidak disentuh. Refresh token
   tetap hanya di cookie HttpOnly; storage hanya memuat access token, lock, dan
   result marker existing.

Test mencakup refresh sukses, refresh 401, refresh network failure, batas satu
replay, 401 concurrent dengan satu refresh, mutation tanpa idempotency, mutation
order dengan key sama, dan jalur normal tanpa 401.

