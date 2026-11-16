# Kontrak API "Ukuran Saya" — Customer Hub DOOZ

> **DIPINDAH ke DOOZ CRM (16 Nov 2026, tahap 1).** Server data member & aplikasi staf sekarang ada di repo
> [`yoppiari/dooz-crm`](https://github.com/yoppiari/dooz-crm) — base URL `https://dooz-crm-pocco.fural.space`.
> Kontrak terbaru: `docs/api.md` dan `docs/api-ukuran-saya.md` di repo dooz-crm. Dokumen ini disimpan sebagai arsip;
> selama transisi `https://glasses-try-on-pocco.fural.space/api/...` mem-proxy API member ke CRM dan `/staf/*`
> dialihkan ke CRM. Pembersihan kode hub dari repo ini: tahap 3.

Kontrak untuk **App Ukur** (`ukur-frame-dooz`, task #KKQBD) dan klien member lain.
Spesifikasi produk: Knowledge *"Flow App Ukur: Simpan Ukuran & Member Kacamata DOOZ"* (bagian "Data di CRM").
Implementasi: `internal/hub/measurements.go`, `internal/hub/measurements_http.go`, skema `migrations/003_member_measurements.sql`.

> Try-On **tidak** terlibat di alur ini.

## Ringkasan

| Kebutuhan layar | Endpoint | Auth |
|---|---|---|
| Layar 4 · Kirim formulir (bawa ukuran) | `POST /api/capture/identify` | publik (anti-spam honeypot/Turnstile) |
| Layar 5 · Polling status WA | `POST /api/capture/verification-status` | `poll_token` dari identify / whatsapp-login |
| Layar 6 · Kartu Member mini | `GET /api/portal/me` | `Authorization: Bearer <session_token>` |
| "Masuk lewat WhatsApp" (HP lain) | `POST /api/auth/whatsapp-login` → WA → magic link → `GET /api/auth/magic-verify` + `POST /api/auth/magic-exchange` | publik → magic link sekali pakai |
| Ukuran Saya · daftar | `GET /api/portal/measurements` | Bearer session |
| + Tambah ukuran (ukur lagi / angka gagang) | `POST /api/portal/measurements` | Bearer session |
| Ubah nama / catatan / tanda nyaman | `PATCH /api/portal/measurements/{id}` | Bearer session |
| Jadikan utama | `POST /api/portal/measurements/{id}/primary` | Bearer session |
| Hapus ukuran | `DELETE /api/portal/measurements/{id}` | Bearer session |
| Hapus semua data (UU PDP) | `POST /api/portal/privacy/delete` `{"immediate":true}` | Bearer session |

**Base URL preview:** `https://glasses-try-on-pocco.fural.space` (App Ukur memakai `VITE_DOOZ_HUB_API_BASE` / `window.DOOZ_HUB_API_BASE`).

### Autentikasi & CORS

- Sesi member = `session_token` (TTL 30 hari) dikirim lewat header `Authorization: Bearer <token>`. **Tanpa cookie**, jadi
  CORS memakai `Access-Control-Allow-Origin: *` dan bisa dipanggil dari `https://ukur-frame-dooz-pocco.fural.space`
  (metode `GET, POST, PUT, PATCH, DELETE, OPTIONS`; header `Content-Type, Authorization`). Jangan pakai `credentials: 'include'`.
- Simpan `session_token` di `localStorage` App Ukur (SDK: kunci `dooz_member_session_v1`).
- Sesi `access_scope = basic_recycled_pending` (nomor pasif >6 bulan, nama belum dikonfirmasi) **tidak** boleh akses
  Ukuran Saya → `403`. Arahkan ke `POST /api/portal/confirm-recycled {"full_name": "..."}`.
- Semua respons member memakai `Referrer-Policy: no-referrer` dan `Cache-Control: no-store`.

### Format error

```json
{ "ok": false, "error": "pesan" }
```

| HTTP | Arti |
|---|---|
| 400 | input tidak valid (`invalid measurement: ...`) |
| 401 | sesi tidak ada / kedaluwarsa / dicabut |
| 403 | sesi terbatas (`basic_recycled_pending`) |
| 404 | ukuran tidak ada **atau milik member lain** |
| 409 | batas 20 ukuran per member tercapai |
| 429 | rate limit |

## Objek `Measurement`

```json
{
  "id": "91e06b6e-ca14-40f9-aaac-6a31f57882a1",
  "customer_id": "f29b6a2a-9067-41bc-919f-f1612e209b4a",
  "name": "Kerja",
  "note": "nyaman dipakai seharian",
  "frame_width_mm": 136,
  "size_category": "M",
  "lens_mm": null,
  "bridge_mm": null,
  "temple_mm": null,
  "comfort": "pas_nyaman",
  "is_primary": true,
  "source": "self_measure",
  "created_at": "2026-11-16T09:00:00Z",
  "updated_at": "2026-11-16T09:00:00Z"
}
```

| Field | Aturan |
|---|---|
| `name` | maks. 60 karakter. Default: `"Ukuran pertama saya"` (ukuran pertama), `"Dari gagang kacamata"`, `"Diukur di outlet"`, atau `"Ukuran N"` |
| `note` | opsional, maks. 280 karakter |
| `frame_width_mm` | 90–200, dibulatkan 0,1 mm |
| `size_category` | `XS`–`XL`, **selalu dihitung server** dari `frame_width_mm` + size-chart Katalog Bersama (`GET /api/catalog/size-chart`). Nilai kiriman klien diabaikan. Ikut dihitung ulang bila admin mengubah size-chart |
| `lens_mm` / `bridge_mm` / `temple_mm` | opsional (30–75 / 10–30 / 100–170), biasanya dari angka gagang |
| `comfort` | `pas_nyaman` 😊 · `kurang_nyaman` 😐 · `tidak_pas` ❌ · `null` |
| `is_primary` | **tepat satu** per member (lihat aturan di bawah) |
| `source` | `self_measure` (ukur sendiri) · `outlet` (diukur kasir, hanya lewat Mode Kasir L2) · `temple_label` (dari gagang) |

**Aturan ukuran utama:** ukuran pertama otomatis utama; `set_primary`/`/primary` memindahkan tanda utama (yang lain
otomatis `false`); menghapus ukuran utama mempromosikan ukuran **terbaru** yang tersisa. Daftar selalu diurutkan
utama dulu, lalu terbaru. DB: partial unique index `uq_member_measurements_one_primary`.

**Angka gagang** `52□18-140` = lebar lensa □ bridge – panjang gagang. Format yang diterima: `52□18-140`, `52-18-140`,
`52 18 140`, `52x18-140`, `52[]18-140`. Bila `frame_width_mm` tidak dikirim, server memperkirakan
`frame_width_mm = 2 × lens + bridge + 10` (dua endpiece ±5 mm) → `52□18-140` = **132 mm (S)**.

## 1. Identify membawa ukuran (Layar 4)

`POST /api/capture/identify` — endpoint yang sudah ada, ditambah field `measurement` dan `app`.

```json
{
  "full_name": "Rina",
  "phone": "081234567890",
  "city_regency": "Kota Surakarta",
  "event_type": "frame_measured",
  "payload": { "frame_width_mm": 136, "size_category": "M" },
  "consent_crm_wa": true,
  "honeypot": "",
  "turnstile_token": "...",
  "app": "ukur",
  "measurement": {
    "name": "Ukuran pertama saya",
    "note": "nyaman dipakai seharian",
    "frame_width_mm": 136,
    "source": "self_measure"
  }
}
```

Respons `200`:

```json
{
  "contact_id": "…",
  "verification_code": "DZ-7K2P",
  "expires_at": "2026-11-16T09:30:00Z",
  "wa_me_url": "https://wa.me/6281122334455?text=Halo%20DOOZ%2C%20verifikasi%20hasil%20ukur%20saya%20kode%3A%20DZ-7K2P",
  "message": "Silakan kirim pesan WhatsApp …",
  "poll_token": "3f9c…(48 hex)",
  "measurement": { "name": "Ukuran pertama saya", "frame_width_mm": 136, "size_category": "M", "source": "self_measure" }
}
```

- Ukuran **belum** disimpan sampai nomor terverifikasi lewat WhatsApp (DZ-xxxx, TTL 30 menit, sekali pakai).
  Setelah verifikasi: member baru → ukuran utama; member lama → ditambahkan ke daftar (utama tidak berubah).
- `poll_token` hanya tampil sekali (server menyimpan hash-nya). Simpan bersama `verification_code` di localStorage
  untuk kasus "Formulir terisi tapi WA tidak dikirim".
- `measurement` tidak valid → `400`. Respons honeypot tetap seragam (kode & `poll_token` palsu → polling `404`).
- Teks `wa.me` hanya berisi kode `DZ-xxxx` (tanpa PII).

## 2. Polling status verifikasi (Layar 5)

`POST /api/capture/verification-status` (POST agar token tidak masuk URL/log). Poll tiap 2–3 detik; rate limit 120/menit/IP.

```json
{ "verification_code": "DZ-7K2P", "poll_token": "3f9c…" }
```

| `status` | Arti | Tindakan App Ukur |
|---|---|---|
| `pending` | WA belum diterima (`expires_at` disertakan) | tetap di Layar 5, tombol "Buka WhatsApp lagi" (`wa_me_url`) |
| `verified` + `session_token` | **member baru** terverifikasi; sesi diberikan **sekali** (≤15 menit setelah verifikasi) | simpan sesi → Layar 6 |
| `verified` + `session_claimed: true` / `login_required: true` | sesi sudah diambil / lewat 15 menit | arahkan "Masuk lewat WhatsApp" atau link di WA |
| `verified` + `existing_member: true`, `login_required: true` | nomor sudah member sebelumnya; ukuran sudah ditambahkan; **sesi tidak dikirim lewat polling** (anti-pembajakan) | tampilkan "Cek WhatsApp kamu"; link WA membuka App Ukur `/?masuk=TOKEN` |
| `expired` | kode kedaluwarsa | kirim ulang formulir |
| HTTP `404` `{"status":"not_found"}` | kode/`poll_token` salah | hentikan polling |

Contoh `verified` (member baru):

```json
{
  "kind": "register",
  "status": "verified",
  "member_code": "DOOZ-48219",
  "first_name_masked": "Rina",
  "session_token": "a1b2…(64 hex)",
  "access_scope": "full",
  "session_expires_at": "2026-12-16T09:01:00Z",
  "primary_measurement": { "id": "…", "name": "Ukuran pertama saya", "frame_width_mm": 136, "size_category": "M", "is_primary": true, "source": "self_measure", "…": "…" }
}
```

Balasan WhatsApp untuk member baru tetap berisi link **Kartu Member** sekali pakai
(`{PORTAL}/kartu-member?token=…`, "Link Kartu Member juga sudah dikirim ke WhatsApp kamu").

## 3. Masuk lewat WhatsApp (member di HP lain)

1. `POST /api/auth/whatsapp-login` body `{"app":"ukur"}` → `200`:

   ```json
   {
     "login_code": "DZ-Q8MZ",
     "poll_token": "…",
     "wa_me_url": "https://wa.me/6281122334455?text=Halo%20DOOZ%2C%20saya%20mau%20masuk%20Member.%20Kode%3A%20DZ-Q8MZ",
     "expires_at": "2026-11-16T09:15:00Z",
     "message": "Kirim pesan WhatsApp ini dari nomor member kamu. …"
   }
   ```
2. Buka `wa_me_url`; customer menekan Kirim. Bot membalas magic link sekali pakai (15 menit):
   `https://ukur-frame-dooz-pocco.fural.space/?masuk=<token>` (env `UKUR_APP_URL`). Nomor belum member → balasan
   "belum terdaftar".
3. (Opsional) polling `POST /api/capture/verification-status` dengan `login_code` + `poll_token`:
   `pending` → `link_sent` (cek WhatsApp) / `not_member` / `expired`. **Polling login tidak pernah mengembalikan sesi.**
4. Saat App Ukur dibuka dengan `?masuk=<token>`: hapus parameter dari address bar, lalu
   - `GET /api/auth/magic-verify?token=<token>` → `{valid, member_code, first_name_masked, requires_name_confirm}`
     (tidak memakai token; aman untuk preview link WA),
   - tampilkan tombol konfirmasi, lalu `POST /api/auth/magic-exchange` `{"token":"…","confirm_full_name":""}` →
     `{session_token, access_scope, requires_name_confirm, member_code, expires_at}`. Token hanya bisa ditukar sekali.
   - `requires_name_confirm: true` → minta nama lengkap (`POST /api/portal/confirm-recycled`).

Perintah WA lama (`MASUK`, `DATA`, `KELUAR`) tetap berlaku; `MASUK` mengirim link ke portal Kartu Member.

## 4. API Ukuran Saya (sesi member)

### `GET /api/portal/measurements`

```json
{ "measurements": [ { "…Measurement": "utama dulu" } ], "primary_measurement": { "…": "…" }, "count": 2, "max": 20 }
```

### `POST /api/portal/measurements` → `201 {"ok": true, "measurement": {…}}`

Ukur lagi (hasil App Ukur, tanpa formulir data diri):

```json
{ "name": "Kerja", "note": "", "frame_width_mm": 141, "source": "self_measure", "comfort": null, "set_primary": false }
```

Isi dari kacamata yang dimiliki:

```json
{ "name": "Kacamata baca", "temple_label": "52□18-140", "comfort": "pas_nyaman" }
```

(atau `lens_mm`/`bridge_mm`/`temple_mm` terpisah dengan `"source": "temple_label"`; boleh juga sertakan
`frame_width_mm` hasil ukur untuk menggantikan perkiraan). `source: "outlet"` ditolak (`400`) — hanya kasir.

### `PATCH /api/portal/measurements/{id}` → `200 {"ok": true, "measurement": {…}}`

Hanya `name`, `note`, `comfort` yang boleh diubah (field lain → `400`):

```json
{ "name": "Sunglasses", "note": "untuk nyetir", "comfort": "kurang_nyaman" }
```

`"comfort": null` mengosongkan tanda kenyamanan. `"name": ""`/`null` → `400`.

### `POST /api/portal/measurements/{id}/primary` → `200 {"ok": true, "measurement": {…, "is_primary": true}}`

### `DELETE /api/portal/measurements/{id}` → `200`

```json
{ "ok": true, "deleted_id": "…", "primary_measurement": { "…ukuran utama sekarang (bisa null)": "" } }
```

## 5. Kartu Member & Mode Kasir

- `GET /api/portal/me` (Kartu Member): `primary_size_category`, `primary_measurement`, `measurements` (scope `full`);
  scope `basic_recycled_pending` hanya `primary_size_category`.
- Kasir **Level 1** (`POST /api/kasir/lookup-phone`, nomor lengkap): `primary_measurement: {"size_category":"M"}` —
  **hanya kategori** (tanpa mm, nama, catatan, daftar). `latest_measurement` juga dipangkas ke kategori.
- Kasir **Level 2** (`POST /api/kasir/scan-qr`, QR dinamis): `primary_measurement` lengkap + `measurements` (semua).
  `POST /api/kasir/level2-action` dengan `event_type: "frame_measured"` menambah ukuran `source: "outlet"`.
- Audit log (`level_1_lookup`, `level_2_qr`) tetap tercatat untuk setiap akses kasir.

## 6. Hapus data (UU PDP)

`POST /api/portal/privacy/delete {"immediate": true}` dan purge retensi (>24 bulan pasif) menghapus kontak beserta
**semua** ukuran, kode verifikasi/login, magic link, dan sesi (`ON DELETE CASCADE` di SQL).

## 7. SDK (glasses-try-on `src/sdk/doozCapture.js`)

`identify({... , measurement, app: 'ukur'})` (lead state menyimpan `poll_token`), `pollVerificationStatus(code, pollToken)`
(menyimpan sesi otomatis bila diberikan), `requestWhatsAppLogin('ukur')`, `listMeasurements()`, `createMeasurement(input)`,
`updateMeasurement(id, patch)`, `deleteMeasurement(id)`, `setPrimaryMeasurement(id)`. Tipe di `src/sdk/doozCapture.d.ts`.

## Contoh curl

```bash
HUB=https://glasses-try-on-pocco.fural.space
curl -s -X POST $HUB/api/capture/identify -H 'Content-Type: application/json' \
  -d '{"full_name":"Tes","phone":"081200001111","city_regency":"Kota Surakarta","consent_crm_wa":true,"app":"ukur","measurement":{"name":"Kerja","frame_width_mm":136}}'
curl -s -X POST $HUB/api/capture/verification-status -H 'Content-Type: application/json' \
  -d '{"verification_code":"DZ-XXXX","poll_token":"..."}'
curl -s -X POST $HUB/api/auth/whatsapp-login -H 'Content-Type: application/json' -d '{"app":"ukur"}'
curl -s $HUB/api/portal/measurements -H "Authorization: Bearer $SESSION"
curl -s -X POST $HUB/api/portal/measurements -H "Authorization: Bearer $SESSION" -H 'Content-Type: application/json' \
  -d '{"name":"Baca","temple_label":"52□18-140"}'
```
