# Modul Member DOOZ

Satu modul untuk tombol **Member DOOZ** di semua mini app Kacamata DOOZ (App Ukur, Try-On, app berikutnya).
Dibuat sekali di sini (`ukur-frame-dooz/packages/member-dooz`), lalu dipasang di app lain.

- **Server:** DOOZ CRM (`https://dooz-crm-pocco.fural.space`), kontrak di repo `dooz-crm` → `docs/api.md`.
- **Arsitektur:** Knowledge *"Arsitektur Link: Mini App Terpisah, DOOZ CRM Khusus Staf & Member DOOZ"*.
- **Isi:** klien API (tanpa React) + komponen React + CSS mandiri (kelas `mdz-*`, tidak butuh Tailwind).
- **Kebutuhan:** React 18/19, `qrcode-generator` (QR Kartu Member). Bundler yang bisa memproses `.ts/.tsx` (Vite).

## Yang didapat pengguna

Tombol di **pojok kanan atas** header:

| Kondisi | Tombol | Isi panel |
|---|---|---|
| Sudah member | inisial + **Member** | **Kartu Member** (QR dinamis untuk Kasir L2) · **Ukuran Saya** (banyak ukuran, nama, catatan, 😊/😐/❌, ⭐ utama, tambah dari angka gagang) · **Riwayat** (ukuran disimpan + frame dicoba + kunjungan outlet) · **Profil & Privasi** (ubah nama/kota, info promo WA, keluar dari HP ini / semua perangkat, hapus semua data UU PDP) |
| Belum member, app punya ajakan simpan (`onJoin`) | **Jadi Member** | ajakan + "Sudah member? Masuk lewat WhatsApp" |
| Belum member, app tanpa ajakan (Try-On) | **Masuk** | **Masuk lewat WhatsApp** |

Login:

- **Masuk lewat WhatsApp:** kode `DZ-xxxx` → pelanggan mengirim WA → bot membalas magic link yang membuka **app yang
  sedang dipakai** (`?masuk=<token>`, ditentukan `app` di klien), bukan CRM. Link dicek dulu, ditukar setelah tombol **Masuk**.
- **Pindah antar-app:** panel Kartu Member → "Aplikasi DOOZ lain" membuat **token serah-terima** sekali pakai (2 menit)
  dan membuka app tujuan dengan `?handoff=<token>`. App tujuan menukarnya otomatis saat dibuka → login ikut terbawa.
- Token di URL langsung dihapus dari address bar. Sesi = Bearer di `localStorage` (`dooz_member_session_v1`), tanpa cookie.

## API singkat

```ts
import { createMemberClient, MemberDoozProvider, MemberDoozButton, MemberDoozPanel, useMemberDooz } from '@dooz/member-dooz'
import '@dooz/member-dooz/member-dooz.css'

const client = createMemberClient({ apiBase: 'https://dooz-crm-pocco.fural.space', app: 'tryon' })
```

| Bagian | Fungsi |
|---|---|
| `createMemberClient({ apiBase, app, magicParams? })` | klien CRM: `me`, `updateProfile`, `list/create/update/setPrimary/remove`, `framesTried`, `trackEvent`, `requestWhatsAppLogin`, `inspectMagicLink/exchangeMagicLink`, `createHandoff/exchangeHandoff`, `setConsent`, `revokeAllSessions`, `deleteAllData`, `logout`, `subscribe` |
| `createDemoMemberClient()` | data contoh di memori untuk pratinjau QA (`?demo=1`) |
| `<MemberDoozProvider client apps? cities? brand?>` | state sesi + panel; membaca `?masuk=` / `?handoff=` saat app dibuka |
| `<MemberDoozButton tone="dark" \| "light" />` | tombol pojok kanan atas |
| `<MemberDoozPanel onJoin? onMeasureAgain? unsavedMeasurement? onUnsavedSaved? onSignedIn? onSignedOut? />` | panel layar penuh; pasang sekali di root |
| `useMemberDooz()` | `{ isMember, me, open(view?), close, client, reloadMe, notify }` — `open('kartu' \| 'ukuran' \| 'riwayat' \| 'profil' \| 'login')` |
| `<MemberCard me brand? />` | Kartu Member saja (mis. layar "Selamat") |

`app` harus terdaftar di CRM (`MEMBER_APP_URLS`, default `ukur` & `tryon`) dan origin app harus ada di allowlist CORS CRM.

## Pemasangan di App Ukur (sudah)

- `src/memberClient.ts` → `createMemberClient({ apiBase: CRM_URL, app: 'ukur' })`, `CRM_URL` dari `VITE_DOOZ_CRM_URL`.
- `src/main.tsx` → `<MemberDoozProvider>` + CSS; `src/components/Header.tsx` → `<MemberDoozButton />`.
- `src/App.tsx` → `<MemberDoozPanel onJoin={…ajakan simpan…} onMeasureAgain={…} unsavedMeasurement={…} />`.
- Alias Vite/TS `@dooz/member-dooz` → `packages/member-dooz/src`.

## Pemasangan di Try-On (tahap 3, sudah — repo glasses-try-on)

1. **Salin modul** (dari clone `ukur-frame-dooz`):
   ```bash
   node packages/member-dooz/scripts/sync-to.mjs ../glasses-try-on      # → glasses-try-on/src/vendor/member-dooz
   cd ../glasses-try-on && npm i qrcode-generator@2.0.4
   ```
   Jangan edit salinan; ubah di sumber lalu sinkron ulang (versi asal tertulis di `SOURCE.txt`).
2. **Alias Vite** (`vite.config.js`):
   ```js
   resolve: { alias: { '@dooz/member-dooz': new URL('./src/vendor/member-dooz/src', import.meta.url).pathname } }
   ```
   Try-On boleh tetap JavaScript; Vite memproses `.ts/.tsx` modul ini otomatis.
3. **Klien + Provider** (`src/main.jsx`):
   ```jsx
   import { createMemberClient, MemberDoozProvider } from '@dooz/member-dooz'
   import '@dooz/member-dooz/member-dooz.css'
   const CRM = import.meta.env.VITE_DOOZ_CRM_URL || 'https://dooz-crm-pocco.fural.space'
   // magicParams: tahap 3 memakai ?masuk=; 'token' menjaga link lama /kartu-member?token= tetap jalan
   const member = createMemberClient({ apiBase: CRM, app: 'tryon', magicParams: ['masuk', 'token'] })
   const apps = [{ app: 'ukur', label: 'Ukur frame (App Ukur)', hint: 'Ukur lebar frame di layar HP', fallbackUrl: 'https://ukur-frame-dooz-pocco.fural.space' }]
   root.render(<MemberDoozProvider client={member} apps={apps}><App /></MemberDoozProvider>)
   ```
4. **Tombol & panel:** `<MemberDoozButton />` di pojok kanan atas header Try-On, dan `<MemberDoozPanel />` sekali di
   root **tanpa** `onJoin` (Try-On tidak punya ajakan simpan → yang belum member hanya melihat "Masuk lewat WhatsApp").
5. **Riwayat frame dicoba:** saat member mencoba frame,
   `member.isMember() && member.trackEvent('frame_tried', { frame_sku }, 'glasses_try_on')`.
6. **CRM:** ubah `MEMBER_APP_MAGIC_PATHS` menjadi `tryon=/?masuk={token}` (link lama `/kartu-member?token=` tetap
   diterima lewat `magicParams`). Route `/kartu-member` boleh di-redirect ke App Ukur `/?layar=kartu-member`.

## Uji

```bash
npm test          # di ukur-frame-dooz: cek integrasi + node --test packages/member-dooz/test/*.test.mjs
```
