# CI/CD Chiroot

## Arsitektur dan workflow

Repo ini adalah situs statis HTML/CSS/JS tanpa `package.json`, lockfile, backend TypeScript, atau perintah lint/typecheck/build produksi. `.github/workflows/ci.yml` tidak menjalankan install, cache dependency, lint, typecheck, atau build yang tidak ada.

Job `Static site checks and tests` memeriksa sintaks JavaScript (termasuk script inline), duplikasi ID HTML, aset lokal yang direferensikan script/link, dan format JSON manifest; ia juga menjalankan unit test untuk checker. Checker bukan validator HTML lengkap atau browser, dan tidak memeriksa semua aset, perilaku aplikasi, OAuth, audio, atau integrasi end-to-end.

Workflow berjalan pada setiap push, PR ke `main`, dan `workflow_dispatch`. Ia memakai `contents: read`, action dipin ke SHA, tidak mempertahankan kredensial checkout, dan tidak memakai GitHub secret. Run PR yang tersusul dibatalkan; run push tidak dibatalkan.

## Test yang tidak disertakan

Test JavaScript Liked Songs dan playlist dari PR #8 bergantung pada implementasi yang belum ada di `main`. Job PostgreSQL serta fixture dan test RLS dari PR tersebut bergantung pada migrasi likes/playlist yang juga belum ada di `main`. Semuanya tidak disertakan: menjalankannya di sini akan gagal atau menuntut fitur dan migrasi di luar cakupan PR ini. `docs/sql/chiroot_song_sharing.sql` ada di `main`, tetapi bukan baseline Supabase lengkap; test database tersebut tidak membuktikan keamanan schema produksi. Test fitur dan database harus ditinjau kembali bersama fitur terkait.

## Deployment dan batasan

Integrasi deployment eksternal tetap terpisah dari Actions. Workflow ini tidak melakukan deploy frontend/backend, tidak menerapkan migrasi, dan tidak mengubah Supabase atau Storage. CI pada push `main` berjalan paralel dengan deployment provider, bukan gate yang dapat menghentikannya. Untuk mewajibkan CI sebelum merge, admin repo dapat mengonfigurasi branch protection/ruleset untuk check `Static site checks and tests`; workflow ini tidak mengubah pengaturan repository.

## Menjalankan dan mengulang

Dengan Python 3 dan Node.js 22:

```bash
python3 scripts/check_static.py
python3 -m unittest discover -s tests -p 'test_*.py'
```

Di GitHub buka **Actions → Chiroot CI → run yang gagal → Re-run jobs** (atau `gh run rerun <run-id> --failed` bila berizin). Manual dispatch membutuhkan workflow yang sudah tersedia pada default branch. Run baru tidak otomatis memperbaiki deployment provider yang gagal; periksa status dan log provider secara terpisah.
