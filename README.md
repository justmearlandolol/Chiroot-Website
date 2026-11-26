# Chiroot Website

Pemutar musik web gratis tanpa iklan dengan identitas gramofon klasik. Static site murni (HTML/CSS/JS vanilla) — data & audio pengguna tersimpan di Supabase (Auth Google + tabel `crate_tracks` + Storage).

- **Produksi:** https://chiroots.vercel.app — deploy otomatis dari `main` via Vercel
- **Domain:** https://chiroot.my.id (→ `www.chiroot.my.id`)
- **Backend:** Supabase — klien & konfigurasi ada di `Main.html`

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
│   └── style.css               # Stylesheet utama player
├── js/
│   ├── index.js                # Script landing page (6 MB, inline assets)
│   ├── normal.js               # Modul util player + easter egg (type="module")
│   ├── egg.js                  # Audio easter egg (base64, export default)
│   ├── Decor.js                # Script event "After Dark" (Halloween) — dorman
│   ├── Lang.js                 # Multi-bahasa
│   ├── Search.js               # Pencarian crate
│   ├── report.js               # Laporan statistik (Recap)
│   └── paper.js                # Dekorasi halaman exe.html
├── audio/                      # Audio demo Top 5 (dipakai mode guest)
│   ├── hymn-for-the-weekend.mp3
│   ├── harvey.mp3
│   ├── day-1.mp3
│   └── smile.mp3
├── assets/
│   ├── covers/                 # Cover art lagu demo
│   └── img/                    # Gambar UI (maskot, stiker, donate, error)
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
