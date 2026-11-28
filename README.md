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

## Playlist dan Liked Songs

Migrasi `supabase/migrations/20261128040510_chiroot_song_likes.sql` telah diterapkan pada project Chiroot. Likes disimpan per akun; RLS membatasi baca/tulis kepada pemilik dan hanya menerima lagu yang terlihat oleh pengguna. Lagu yang kemudian menjadi privat milik orang lain tidak ditampilkan karena tetap tunduk pada RLS `songs`. Tidak ada lagu bawaan untuk akun baru.

Playlist publik dan privat disimpan di `playlists` dan `playlist_items` (migrasi `20261128042752_chiroot_playlists`). Pemilik dapat membuat, mengubah nama/visibilitas, menghapus playlist, serta menambah dan menghapus lagu. Penambahan menggunakan RPC yang mengunci baris playlist untuk urutan stabil dan menolak duplikat. RLS hanya memperlihatkan lagu publik di playlist publik kepada pengguna lain; lagu privat pemilik tetap hanya terlihat pada sesi pemilik. Foto/nama pembuat berasal dari snapshot profil ketika playlist dibuat. Playlist tidak mempublikasikan lagu otomatis.

Lagu Crate cloud yang belum terhubung ke `songs` disimpan sebagai entri **privat** saat pertama kali ditambahkan ke playlist atau disukai; lagu tanpa file audio cloud tidak dapat ditambahkan sampai tersimpan di cloud. Mode Guest tidak memiliki koleksi akun.

**Batasan storage lama:** bucket `chiroot-crate` dan `chiroot-shared` sudah public-read sejak sebelumnya. RLS melindungi baris data dan tidak mengekspos lagu privat di query playlist publik, tetapi URL objek yang diketahui masih dapat diakses langsung; ini bukan jaminan kerahasiaan media. Memindahkan storage lama ke bucket privat/signed URL memerlukan migrasi kompatibilitas terpisah.

Uji unit tanpa dependensi: `node --test tests/*.test.js`. Tidak ada protokol desktop pembuka lagu yang terverifikasi di repo, jadi aksi "open in desktop app" sengaja tidak ditampilkan.

## CI dan deployment

GitHub Actions (`.github/workflows/ci.yml`) berjalan pada push, PR ke `main`, atau secara manual. CI memeriksa sintaks JavaScript (termasuk script inline di HTML), duplikasi ID, aset lokal yang direferensikan oleh script/link, format manifest, dan menjalankan unit test. Jalankan pemeriksaan yang sama secara lokal:

```bash
python3 scripts/check_static.py
python3 -m unittest discover -s tests -p 'test_*.py'
node --test tests/*.test.js
```

CI juga memvalidasi migrasi dan beberapa kebijakan RLS terhadap PostgreSQL sementara menggunakan fixture terbatas. CI tidak membutuhkan GitHub secret dan tidak melakukan deploy atau migrasi database produksi. Vercel tetap menangani preview PR dan deploy produksi dari `main` seperti sebelumnya; workflow GitHub Actions ini **tidak otomatis memblokir deploy**. Lihat [docs/CI_CD.md](docs/CI_CD.md) untuk batasan, required checks, rerun, dan persiapan deployment. Hasil CI bukan pengganti uji browser, OAuth, audio, atau Supabase end-to-end.
