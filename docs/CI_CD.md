# CI/CD Chiroot

## Arsitektur dan workflow

Repo ini adalah situs statis HTML/CSS/JS tanpa `package.json`, lockfile, backend TypeScript, atau perintah lint/typecheck/build produksi. Karena itu `.github/workflows/ci.yml` tidak menjalankan install, cache dependency, lint, typecheck, atau build yang tidak ada. Pemeriksaan yang tersedia:

- `Static site checks and tests`: sintaks JS termasuk script inline, ID HTML duplikat, aset script/link lokal, manifest JSON, unit test Node dan test untuk checker.
- `PostgreSQL migration and RLS checks`: jalankan SQL `supabase/migrations` terhadap PostgreSQL 17 sementara dengan fixture kecil, lalu uji constraint serta isolasi like dua user. Fixture ini **bukan** schema Supabase lengkap: ia tidak menguji Storage, Auth API, semua policy songs, schema production, atau aplikasi end-to-end. Jika migrasi baru memerlukan objek lain, fixture perlu ditinjau dan diperbarui. Migrasi `chiroot_public_song_sharing` sebelumnya terdokumentasi di `docs/sql`, tetapi seluruh baseline Supabase belum disimpan sebagai migrasi lokal yang dapat di-reset; jangan menganggap fixture sebagai `supabase db reset` lengkap.

Workflow berjalan pada setiap push, setiap PR ke `main`, dan `workflow_dispatch`. Ia memakai `contents: read`, action dipin ke SHA, tidak mempertahankan kredensial checkout, tidak memakai GitHub secret, dan tidak mengirim kredensial kepada kode PR. PR yang tersusul dibatalkan; run push tidak dibatalkan. PostgreSQL dan password contoh hanya ada pada service container sementara di runner.

## Deployment dan batasan

Vercel Git integration yang sudah ada menangani preview PR dan deploy dari `main` secara terpisah dari Actions; status preview Vercel terlihat di PR. Status preview Netlify juga terlihat di PR, tetapi konfigurasi produksi Netlify tidak diverifikasi. GitHub Actions tidak menjalankan deploy frontend/backend, tidak menerapkan migrasi, dan tidak mengontrol approval atau concurrency deployment pada provider. CI pada push `main` berjalan **paralel**, bukan gate yang dapat menghentikan deployment Vercel. Tidak ada secret GitHub yang diperlukan oleh workflow ini.

Untuk menjadikan check syarat merge, admin repo perlu mengonfigurasi branch protection/ruleset `main` yang mewajibkan `Static site checks and tests` dan `PostgreSQL migration and RLS checks`, tanpa melemahkan aturan lain. Akses integrasi yang dipakai pada pengerjaan ini menerima HTTP 403 saat membaca branch protection dan daftar Actions secrets, sehingga keadaan atau keberadaan secret tidak bisa diverifikasi dan aturan tidak diubah.

### Persiapan jika deployment kelak dipindah ke Actions

1. Konfirmasi project/target produksi dan mekanisme deploy di provider yang benar, akses service account, serta nonaktifkan atau koordinasikan auto-deploy provider untuk menghindari deploy ganda.
2. Setelah mekanisme benar-benar tersedia, tambahkan job deploy khusus push `main` yang `needs` kedua job pemeriksaan, memakai GitHub environment produksi dengan approval yang sesuai dan secret environment yang diperlukan oleh provider. Nama secret belum ditentukan karena kredensial dan perintah provider belum dapat diverifikasi; jangan memasukkan nilai secret ke kode/log.
3. Beri deployment concurrency terpisah dengan `cancel-in-progress: false`; jangan gunakan token produksi pada event PR. Uji preview/staging sebelum mengaktifkan produksi. Pastikan job yang gagal atau approval yang belum diberikan tidak menghasilkan deployment.
4. Database tetap melalui migrasi yang sudah direview dan prosedur terpisah; jangan mengotomatisasi apply migrasi produksi dari PR.

Tidak ada workflow deploy placeholder yang berpura-pura melakukan deployment. Pengaturan approval di GitHub Environment tidak dengan sendirinya mengontrol integrasi Vercel yang berjalan di luar Actions.

## Menjalankan dan mengulang

Jalankan pemeriksaan statis dan unit secara lokal:

```bash
python3 scripts/check_static.py
python3 -m unittest discover -s tests -p 'test_*.py'
node --test tests/*.test.js
```

Test PostgreSQL membutuhkan Docker dengan image `postgres:17`; jalankan langkah job `migration-check` pada database baru sementara saja. Jangan arahkan fixture atau test ke database nyata.

Di GitHub buka **Actions → Chiroot CI → run yang gagal → Re-run jobs** (atau `gh run rerun <run-id> --failed` bila berizin). Workflow juga bisa dimulai dari tab **Actions → Chiroot CI → Run workflow** atau `gh workflow run ci.yml --ref <branch>`; manual dispatch memerlukan workflow yang sudah tersedia pada default branch. Run baru tidak otomatis memperbaiki deployment yang gagal di provider; periksa status/log provider secara terpisah.
