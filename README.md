# Chiroot Website

Platform berbagi lagu dengan identitas gramofon klasik: **Discover** (katalog publik, search + sort + pagination), **My Songs** (publish dari Crate tanpa re-upload — audio disalin server-side ke bucket `chiroot-shared`; wajib pilih Private/Public, default privat), dan **Crate** player klasik yang tetap utuh. Tema dark default (Light/System di Settings), mode tampilan **Gramophone/Cover Art** bisa dipindah kapan pun tanpa menghentikan musik. Schema & RLS: `docs/AUDIT.md` (migrasi `chiroot_public_song_sharing`). Static site murni (HTML/CSS/JS vanilla) — data & audio pengguna tersimpan di Supabase (Auth Google + tabel `crate_tracks` + Storage).

- **Produksi:** https://chiroots.vercel.app — deploy otomatis dari `main` via Vercel
- **Domain:** https://chiroot.my.id (→ `www.chiroot.my.id`)
- **Backend:** Supabase — klien & konfigurasi ada di `Main.html`
- **Entry flow:** belum login → `welcome.html` (Google-only, PKCE) → `Main.html`; sudah login langsung ke `Main.html`. Mode Guest per-device masih tersedia.

## Struktur

```
.
├── index.html                  # Landing page (entry point utama)
├── Main.html                   # Aplikasi player (gramophone + crate)
├── exe.html                    # Halaman download Chiroot for Windows
├── 404.html                    # Halaman error
├── panel-gramo-7xk4q.html      # Admin Studio (legacy, akses langsung via URL)
├── chiroot-widget-bridge.html  # Bridge widget eksternal
├── manifest.webmanifest        # Web app manifest (link dari index.html)
├── favicon.svg / favicon.png   # Icon situs (root, konvensi favicon)
├── robots.txt / sitemap.xml
├── css/
│   ├── style.css               # Stylesheet legacy player
│   └── app.css                 # Layer redesign (dark-first, sidebar, views)
├── js/
│   ├── index.js                # Script landing page (6 MB, inline assets)
│   ├── normal.js               # Modul util player + easter egg (type="module")
│   ├── egg.js                  # Audio easter egg (base64, export default)
│   ├── Decor.js                # Script event "After Dark" (Halloween) — dorman
│   ├── Lang.js                 # Multi-bahasa
│   ├── Search.js               # Pencarian crate
│   ├── report.js               # Laporan statistik (Recap)
│   ├── paper.js                # Dekorasi halaman exe.html
│   ├── app.js                  # Modul baru: router/tema/Discover/My Songs/publish
│   └── welcome.js              # Logika welcome.html
├── audio/                      # Audio demo Top 5 (dipakai mode guest)
│   ├── hymn-for-the-weekend.mp3
│   ├── harvey.mp3
│   ├── day-1.mp3
│   └── smile.mp3
├── assets/
│   ├── covers/                 # Cover art lagu demo
│   └── img/                    # Gambar UI (maskot, stiker, donate, error)
├── welcome.html                # Entry sign-in Google-only (PKCE)
├── archive/                    # SNAPSHOT LEGACY — jangan diubah
└── docs/
    └── AUDIT.md                # Hasil audit repo sebelum redesign
```

## Entry points

Nama file di root **harus tetap** — URL produksi bergantung padanya:

| File | URL |
|---|---|
| `index.html` | `chiroot.my.id/` |
| `Main.html` | `chiroot.my.id/Main.html` |
| `exe.html` | `chiroot.my.id/exe.html` |
| `404.html` | otomatis oleh Vercel |

## Menjalankan lokal

```bash
python3 -m http.server 8080
# buka http://localhost:8080
```

Jangan buka via `file://` — CSP dan dynamic `import()` butuh HTTP.

## Kompatibilitas data lama

Crate guest lama (IndexedDB per browser) menyimpan referensi audio/cover berupa **nama file lama** sebelum reorganisasi folder. Pemetaannya ada di `LEGACY_ASSET_MAP` + `caResolveLegacyAsset()` di `Main.html`, sehingga lagu lama tetap bisa diputar tanpa migrasi manual.

## Catatan

- Jangan mengubah isi `archive/` (snapshot versi lama, sengaja dibekukan).
- `docs/AUDIT.md` berisi hasil audit lengkap: hosting, perilaku legacy, masalah yang ditemukan, dan rencana redesign menjadi platform berbagi lagu publik.

## Liked Songs (update parsial)

Migrasi `supabase/migrations/20261128040510_chiroot_song_likes.sql` telah diterapkan pada project Chiroot. Likes disimpan per akun; RLS membatasi baca/tulis kepada pemilik dan hanya menerima lagu yang terlihat oleh pengguna. Lagu yang kemudian menjadi privat milik orang lain tidak ditampilkan karena tetap tunduk pada RLS `songs`. Tidak ada lagu bawaan untuk akun baru.

Uji unit tanpa dependensi: `node --test tests/liked-songs.test.js`. Update playlist, Discover playlist, menu untuk lagu Crate yang belum diterbitkan, dan pengujian browser end-to-end masih perlu diselesaikan sebelum update ini siap di-merge.

## CI dan deployment

GitHub Actions (`.github/workflows/ci.yml`) berjalan pada push, PR ke `main`, atau secara manual. CI memeriksa sintaks JavaScript (termasuk script inline di HTML), duplikasi ID, aset lokal yang direferensikan oleh script/link, format manifest, dan menjalankan unit test. Jalankan pemeriksaan yang sama secara lokal:

```bash
python3 scripts/check_static.py
python3 -m unittest discover -s tests -p 'test_*.py'
node --test tests/*.test.js
```

CI ini tidak membutuhkan secret dan tidak melakukan deploy atau migrasi database. Vercel tetap menangani preview PR dan deploy produksi dari `main` seperti sebelumnya; workflow GitHub Actions ini **tidak otomatis memblokir deploy**. Jika ingin menjadikan CI syarat merge, atur status `Static site checks and tests` sebagai required check dalam branch protection/ruleset GitHub. Hasil CI bukan pengganti uji browser, OAuth, audio, atau RLS end-to-end.
