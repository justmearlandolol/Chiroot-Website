# Audit Repo Chiroot — 2026-11-26

Dikerjakan di branch `arena/15966cf0-chiroot-website`, base `fa34252` (`main`). Audit dilakukan sebelum redesign menjadi platform berbagi lagu publik, sesuai prompt redesign.

## 1. Hosting & domain (terverifikasi langsung ke live)

| Item | Hasil |
|---|---|
| Hosting | **Vercel** — `https://chiroots.vercel.app`, deploy dari repo ini (`main`) |
| Domain | `https://chiroot.my.id` → redirect `https://www.chiroot.my.id`, konten identik dengan Vercel |
| Repo vs live | Sinkron — `origin/main` = `fa34252` = base branch kerja |
| Sub directory live | Hanya `/css/` dan `/archive/`, sama seperti repo |
| `welcome.html` | **404 di live** — memang belum ada, akan dibuat pada fase redesign |

Referensi `chiroot.netlify.app` yang ditemukan di kode adalah **sisa hosting lama** (hardcoded di panel admin), bukan hosting aktif. Sudah dibersihkan (lihat §4).

## 2. Arsitektur & perilaku legacy yang dipertahankan

**Entry points (nama file wajib tetap):** `index.html` (landing), `Main.html` (app), `exe.html` (download Windows), `404.html`, `panel-gramo-7xk4q.html` (Admin Studio legacy), `chiroot-widget-bridge.html`.

**Penyimpanan data:**
- **Crate user login** → Supabase: tabel `crate_tracks` (REST endpoint `/rest/v1/crate_tracks`, order `position`), audio/cover di Storage bucket via `caCratePublicUrl()` → path `{uid}/{id}.mp3`. Path audio tersimpan di DB, jadi tidak terpengaruh reorganisasi repo.
- **Crate guest (belum login)** → IndexedDB per browser. Rekamannya menyimpan `srcRef`/`coverRef` yang bisa berupa nama file demo lama → inilah alasan `LEGACY_ASSET_MAP` dibuat (§4).
- **State player** → localStorage `gramophone_state_v2` (index, queue, volume, loop, shuffle — *tidak* menyimpan src file, aman terhadap rename file).
- **Auth** → Google OAuth via Supabase (PKCE + popup, backup verifier, multi-account di `chiroot_accounts`, sesi di `CHIROOT_AUTH_KEY`). Semua di `Main.html`.
- **Lainnya:** rate limit client (`gramophone_rate_limit_v1`), patch notes (`PN_KEY`), autofill YouTube (thumbnail `i.ytimg.com`), lyrics (`lrclib.net`), artwork (`i.scdn.co`), Bluetooth picker (`requestPermission` — di-handle graceful bila browser tak mendukung), share poster (SVG, dipangkas dari cover), Backup & Restore ZIP, Recap statistik, switch account, top-up/di UI tercatat di CSP Supabase `astuagdezahmuuwjoghf.supabase.co`.

**Fitur yang aman dari perpindahan aset:** Top 5 "Song of the Month" (audio demo di `audio/`, cover di `assets/covers/`) di-upload ulang ke Supabase saat user login menambahkannya — jadi path repo hanya memengaruhi mode guest & fetch awal.

## 3. Inventaris aset & peta perpindahan

Semua pindah memakai `git mv` (history terjaga):

| Lama (root) | Baru |
|---|---|
| `index.js` | `js/index.js` |
| `Lang.js` / `Search.js` / `normal.js` / `report.js` | `js/…` |
| `egg.js` | `js/egg.js` |
| `paper.js` | `js/paper.js` |
| `Decor.js` | `js/Decor.js` |
| `Coldplay - Hymn For The Weekend.mp3` | `audio/hymn-for-the-weekend.mp3` |
| `Harvey.mp3` / `Day 1.mp3` / `Smile.mp3` | `audio/harvey.mp3`, `audio/day-1.mp3`, `audio/smile.mp3` |
| `Coldplay.jpeg` | `assets/covers/hymn-for-the-weekend.jpg` |
| `Harvey.jpeg` | `assets/covers/harvey.jpg` |
| `reze.png` (cover "Day 1") | `assets/covers/day-1.png` |
| `sweetboy.jpeg` | `assets/covers/sweet-boy.jpg` |
| `Smile.jpeg` | `assets/covers/smile.jpg` |
| `Chopper-removebg-preview.png` (maskot UI) | `assets/img/chopper.png` |
| `win.jpeg` (stiker UI) | `assets/img/win-sticker.jpeg` |
| `Chiroot-Donate.png` | `assets/img/donate.png` |
| `error.png` | `assets/img/error.png` |

Tetap di root: semua entry point HTML, `favicon.svg`/`favicon.png` (konvensi favicon + absolut `/favicon.png`), `robots.txt`, `sitemap.xml`, `css/style.css`.

## 4. Masalah yang ditemukan & status

1. **`manifest.webmanifest` 404** — di-`<link>` oleh index.html sejak lama tapi filenya tidak pernah ada di history git. → **Diperbaiki**: manifest dibuat.
2. **Audio demo "Sweet Boy" tidak ada** — TOP10 #4 merujuk `vidssave.com Malcolm Todd - Sweet Boy (Lyrics) LOW.mp3` yang tidak pernah ada di repo; mode guest yang menambahkan lagu ini akan gagal fetch (error toast). Cover-nya ada. → Referensi dirapikan ke `audio/sweet-boy.mp3`; **file tetap tidak ada** (tidak boleh menambah file audio baru secara sembarangan). Beri tahu owner bila ingin file-nya diunggah.
3. **Sisa hosting Netlify** — 5 URL hardcoded `https://chiroot.netlify.app/…` di panel admin + host di CSP-nya. → **Dibersihkan** ke path relatif baru; `assets/covers/niscaya.jpg` juga tidak pernah ada di repo (cover demo "Niscaya") — tetap 404, didokumentasikan.
4. **Sitemap salah URL** — `https://chiroot.my.id/main` (lowercase) 404 di live (terverifikasi). → **Diperbaiki** ke `/Main.html` + ditambah `/exe.html`.
5. **`archive/Main.html` cover-nya broken** di live (`/archive/win.jpeg` dkk. tidak ada — file cover ada di root). → **Sengaja tidak diubah**: `archive/` adalah snapshot legacy yang dibekukan. Didokumentasikan saja.
6. **`Decor.js` dorman** — script event "After Dark" (1 Okt–2 Nov 2026, sudah lewat), tidak direferensikan file mana pun. → Dipindah ke `js/Decor.js`, tidak dihapus (masih aset proyek; mungkin dipakai event berikutnya).
7. **`<link href="chiroot-widget-bridge.html">` tanpa atribut `rel`** di Main.html — tidak valid tapi berdampak nol. → Dibiarkan, dicatat di sini.

## 5. Kompatibilitas data lama

- `LEGACY_ASSET_MAP` + `caResolveLegacyAsset()` di `Main.html` memetakan nama file lama (dari crate guest IndexedDB, termasuk URL netlify/same-host lama) ke path baru. Di-hook di `caGuestTrackFromRec()` — satu-satunya titik konsumsi `srcRef`/`coverRef`.
- Import `egg.js`: `Main.html` (classic script, dynamic `import()`) → `'./js/egg.js'` (resolve terhadap dokumen, root). `js/normal.js` (type="module", static import) → `'./egg.js'` **tidak diubah** karena resolve relatif terhadap URL module → `js/egg.js`. Keduanya benar.
- CSP tidak perlu diubah: `img-src`/`media-src` `'self'` sudah mencakup `assets/` & `audio/`.
- Crate Supabase (user login) tersimpan dengan path storage di DB → tidak terpengaruh.

## 6. Rencana berikutnya (redesign platform berbagi lagu — sesuai prompt)

1. `welcome.html` — entry Google-only, pakai project URL & publishable key yang sudah ada di `Main.html`; redirect bolak-balik sesi.
2. Tabel `songs` (visibility private/public, owner, share slug) + RLS + storage policy; publish dari Crate tanpa duplikasi audio.
3. Halaman Discover (song-centric, tanpa Top Artist), My Songs, edit metadata, pagination.
4. Mode tampilan Gramophone/Cover (persist di settings user), dark default + Light/System.
5. Patch notes admin-only server-side; top bar Patch Notes hanya tampil bila ada catatan terpublish nyata.
6. Migrasi Supabase dieksekusi via connector Supabase, idempotent, tanpa menghapus data.

---

# Eksekusi Redesign — 2026-11-26 (fase 2)

Eksekusi prompt redesign sesuai `chiroot-redesign-prompt.txt`.

## Supabase (dieksekusi via connector — project `astuagdezahmuuwjoghf`, "Chiroot")

**Migrasi `chiroot_public_song_sharing`** (additive, tidak menyentuh tabel/policy/data existing):

- Tabel `songs`: id uuid PK, owner_id → auth.users (cascade), owner_name (snapshot nama uploader untuk anon), title, artist, duration_seconds, audio_path, cover_path, source_crate_track_id → crate_tracks(id) (FK text, on delete set null), source_bucket, visibility (`private|public`, default `private`), published_at, timestamps. Unique constraint `(owner_id, source_crate_track_id)` → publish Crate yang sama dua kali bersifat idempotent.
- Tabel `user_settings`: user_id PK, theme (`dark|light|system`, default `dark`), display_mode (`gramophone|cover`, default `gramophone`), prefs jsonb.
- Trigger `touch_updated_at` untuk keduanya.
- RLS: songs — select `visibility='public' OR owner_id=auth.uid()`, insert/update owner-only, delete owner-or-admin (via `is_chiroot_admin()` security definer yang sudah ada). user_settings — ALL owner-only.
- Bucket baru: `chiroot-shared` (public — khusus lagu yang di-publish) & `chiroot-library` (private, owner-folder). Bucket legacy `chiroot-crate` tidak diubah. Mime: audio/mpeg, image/jpeg, image/png; limit 25 MB.
- Index: partial `published_at desc WHERE visibility='public'`, `owner_id+created_at desc`, GIN trigram `title` (pg_trgm) untuk search.
- Grant: anon hanya SELECT songs; authenticated CRUD keduanya.

**RLS diverifikasi via role simulation** (set local role + rollback, tanpa residu data):
- anon × lagu private → 0 baris ✓
- anon × lagu public → 1 baris ✓
- authenticated (JWT claims owner) × lagu sendiri → 1 baris ✓

**Auth config** (via connector): `uri_allow_list` ditambah `welcome.html` (vercel + www/apex domain) dan glob `https://chiroots.vercel.app/**`, `https://www.chiroot.my.id/**` — semua entri existing (localhost dev, deep link `com.chiroot.app://…`, `chiroot://…`) dipertahankan. `site_url` tetap `https://chiroot.my.id`. Google OAuth sudah enabled (tidak diubah).

**Catatan keamanan yang diwarisi arsitektur lama (dokumentasi, bukan regresi):** bucket `chiroot-crate` bersifat public-read sejak sebelumnya (path `{uid}/{id}.mp3` unguessable tapi bukan rahasia). Lagu privat tidak pernah disalin ke `chiroot-shared` — hanya lagu yang di-publish yang ada di bucket publik.

## Frontend

| File | Perubahan |
|---|---|
| `welcome.html` + `js/welcome.js` | BARU — entry sign-in Google-only (PKCE flow identik dengan Main: storage key `chiroot_pkce_v1` sama supaya callback Main tetap menemukan verifier; session valid → langsung redirect app; `?error=access_denied` → state dibatalkan; opsi "Lanjut sebagai Guest" dipertahankan sebagai fitur lama; `noindex`). |
| `css/app.css` | BARU — layer redesign flat dark-first: override token legacy, supresi doodle/paper, sidebar + bottom nav responsive, list lagu, segmented control, mode cover, skeleton, empty/error states, light theme, reduced-motion, focus-visible. |
| `js/app.js` | BARU — modul aplikasi: gate guest→welcome, tema Dark/Light/System (persist `user_settings` + localStorage fallback), mode Gramophone/Cover (CSS attribute switch tanpa interrupt playback, cover dimirror via MutationObserver), router hash `#/home|/discover|/songs`, Discover (search ilike title/owner, sort, pagination 24/hal, play/copy-link/unpublish/delete owner-only), My Songs (lagu di Chiroot + yang masih di Crate), publish flow (Public/Private, storage-side copy via `/storage/v1/object/copy` — tanpa re-upload, idempotent), deep link `?song=<id>` tanpa autoplay, logout→welcome, settings Appearance. |
| `Main.html` | 8 anchor edit: html data-attrs, link app.css, wrap app-shell+sidebar, views Discover & My Songs, section Tampilan di Settings modal, modal publish, cover-stage, tag `js/app.js`. Semua anchor di-edit dengan assertion count. |
| Referensi | `LEGACY_ASSET_MAP` (fase 1) tetap berlaku; crate Supabase user login tidak terpengaruh (path di DB). |

## Alur auth (sesuai prompt)

- Belum login + buka `Main.html` → redirect `welcome.html` (kecuali flag Guest — fitur guest lama dipertahankan).
- `welcome.html`: Google-only → PKCE → `redirect_to` Main.html (allow list sudah diupdate).
- Sudah login + buka `welcome.html` → langsung ke Main.html.
- Logout: `caSignOut` server-side + bersih-bersih state existing + redirect `welcome.html`.

## Hasil test

Lulus: sintaks 13/13 inline script Main.html + 10/10 file JS (node --check); tanpa duplikat ID; struktur HTML seimbang; 32/32 referensi lokal HTTP 200; RLS 3 skenario ✓; migrasi terverifikasi (5 index, 3 bucket, policy terpasang); data produksi utuh (45 crate_tracks, 4 profiles).

Tidak bisa dijalankan dari sandbox (dibatasi jaringan): uji klik end-to-end di browser (playback, OAuth popup Google nyata, Bluetooth picker) dan uji REST anon live ke Supabase (outbound ke supabase.co diblok dari sandbox). Hal ini perlu diverifikasi manual setelah deploy.
