# Rencana T1.11 — Frontend: Login + Dashboard (Mahasiswa & Admin)

**Status**: T1.11a ✅ (`91ecf05`) · T1.11b ✅ (`6233e37`) · T1.11c ✅ (`8c3f2c4`) · T1.11d ✅ (`4e77700`) · CI ✅ (`2dcfa4b`) · **T1.11 TUNTAS** · **T1.12 ✅ (`9a7c1d1`)** · **T1.13 SELESAI** (`28d5e92` backend; frontend+docs menunggu commit) — lihat `planning-t1.13.md`
**Tanggal**: 2026-08-03 · **Referensi**: 03-execution-plan.md baris 28 (T1.11), 02-solution-spec.md, docs/04-implementation-log.md §19.4 open item #3.

---

## 1. Fakta (state terverifikasi)

| Aspek | Kondisi sekarang |
|---|---|
| Frontend stack | Vite 6 + React 18.3 + TS 5.6 + Tailwind 3.4 + Vitest 3 (jsdom) + Testing Library |
| Aplikasi | `App.tsx` placeholder T1.1 (25 baris); `App.test.tsx` 1 test |
| Dependencies | Hanya `react`/`react-dom` — **belum ada router / api client** |
| vite.config.ts | port 5173, **tanpa proxy** ke backend; komentar: coverage threshold "diberlakukan penuh saat T1.11" |
| Backend API siap | `auth`: POST /login, /refresh, /logout, GET /me · `users`: GET /me (menu=permissions), PUT /me/contact, GET /, POST /, PUT /:id/role · `krs`: GET /period, /available-classes, /my, POST /draft, /submit, GET /admin/pending, POST /admin/:id/approve, /reject · `grades`: GET /student/:studentId, /class/:classId |
| Shape login | `{accessToken, refreshToken, user{id,email,fullName,role,isWali,mustChangePassword}, expiresIn:900}` — access token 15 menit |
| Shape /users/me | `{id,email,fullName,role,roleName,isWali,isActive,createdAt,menu:[permission…]}` — **menu = sumber RBAC UI** |
| CORS backend | `CORS_ORIGIN` default `http://localhost:5173` (sudah benar untuk dev tanpa proxy) |
| CI frontend | job lint + typecheck + test + build (hijau sejak T1.1) |
| Error format backend | `{code, message, fields?}` via error-handler — konsisten untuk error inline |

## 2. Asumsi (bila salah → koreksi di open questions)

1. **T1.11 dipecah 4 sub-task**: 11a fondasi+login · 11b dashboard mahasiswa (KRS + transkrip) · 11c dashboard admin (KRS approve + user mgmt) · 11d polish + gate + docs. Tiap sub-task berhenti di titik commit manual (F-31).
2. **Dependency baru hanya `react-router-dom`** — api client pakai `fetch` native (wrapper kecil), tanpa axios/react-query. Menjaga bundle kecil (NF-02) & minim dependensi.
3. **Dev via Vite proxy** `/api` → `http://localhost:3000` (tanpa CORS issue, production lewat nginx.conf yang sudah ada — diverifikasi di 11d).
4. **Alur mustChangePassword lengkap di T1.11a**: endpoint backend kecil `POST /auth/change-password` (open item §19.4 #3) + halaman Ganti Password paksa setelah login (blokir akses sampai sukses).
5. **Refresh token otomatis** (silent) saat access token kedaluwarsa via `/auth/refresh`.
6. **Bahasa UI: Indonesia**; tema light modern (Tailwind) melanjutkan gaya placeholder (slate/primary).
7. **Transkrip mahasiswa** memakai `GET /grades/student/:studentId` — dicek saat implementasi: bila RBAC belum mengizinkan mahasiswa membaca miliknya, tambah izin/route kecil di backend.
8. **Coverage threshold frontend diaktifkan di T1.11d** (target ≥80% branch, konsisten backend) — tetapi disiplin menulis test setiap komponen sejak 11a agar tidak menumpuk.

## 3. Open Questions (menunggu keputusan pemilik)

1. **Pecahan 11a→11d & urutan** — setuju dikerjakan serial dengan commit manual di tiap sub-task?
2. **mustChangePassword paksa** (wajib ganti password sebelum masuk dashboard) — setuju? Ini menambah endpoint backend kecil di 11a.
3. ~~Tema~~ — light saja, tanpa dark mode di T1.11 (dark mode bisa iterasi 5 polish).

## 4. Risiko & Mitigasi

| Risiko | Mitigasi |
|---|---|
| Coverage frontend kosong saat threshold diaktifkan (11d) | Tulis test per komponen sejak 11a; threshold diaktifkan bertahap (branch 70% → 80%) bila perlu |
| react-router versi vs React 18 | Verifikasi peer deps saat instal; pilih versi stabil (v6 LTS) |
| nginx.conf prod belum proxy /api dengan benar | Diverifikasi di 11d sebelum dianggap selesai |
| Token 15 menit → UX "tiba-tiba logout" | Silent refresh via wrapper api; retry 1× saat 401 |
| Test fetch/mocking rawan rapuh | Pola: `vi.stubGlobal('fetch', …)` + helper `mockFetch` di `src/test/` |
| 5.000 simultan (NF-06) | SPA ringan, tanpa polling agresif; data statis di-cache context; T1.12 cache Redis di backend |

## 5. Breakdown Sub-task

### T1.11a — Fondasi + Login
- Deps: `react-router-dom`; vite proxy `/api` → 3000
- `src/lib/api.ts` — fetch wrapper: baseURL, token storage (localStorage), silent refresh + retry 1×, normalisasi error `{code, message, fields}`
- `src/auth/AuthContext.tsx` — state user/tokens, `login()/logout()`, restore sesi + ambil `/users/me` (menu)
- Router: `/login`, `/ganti-password`, `/` (dashboard); `ProtectedRoute` (redirect ke /login), menu-based guard per role
- Halaman **Login**: form email+password, error inline per field, loading state, banner mustChangePassword → redirect `/ganti-password`
- Halaman **Ganti Password** paksa (dengan password lama + baru, validasi min 8 dll sesuai backend)
- Layout shell: navbar (nama, role, menu dari permissions, logout), responsive
- Backend: `POST /auth/change-password` + test (backend gate)
- Test frontend: login flow, protected redirect, error inline, ganti password, refresh logic

### T1.11b — Dashboard Mahasiswa
- **KRS**: periode aktif + status KRS saya (`GET /krs/my`), kelas tersedia dengan filter (`GET /krs/available-classes`), draft → submit, total SKS, batas max SKS
- **Transkrip**: nilai per semester (`GET /grades/student/:id` untuk diri sendiri)
- Test komponen + hook

### T1.11c — Dashboard Admin
- **KRS approve**: list pending (`GET /krs/admin/pending`), approve/reject dengan konfirmasi
- **User mgmt**: list users, create user (modal form), ubah role
- Test

### T1.11d — Polish + Gate + Docs
- Empty/loading/error states seragam, responsive pass, aksesibilitas dasar (label, focus)
- Coverage threshold vitest aktif; nginx.conf diverifikasi
- docs: `04-implementation-log.md` §20 (T1.11) + `project-status.md`; verifikasi kanonikal penuh (backend + frontend gate), stage → commit manual

## 6. Gate (tiap sub-task, wajib hijau sebelum commit)

```bash
# frontend
cd frontend && npm run lint && npm run format:check && npm run typecheck && npm run build && npm run test
# backend (hanya bila ada perubahan, mis. 11a change-password)
cd backend && npm run lint && npm run format:check && npm run typecheck && npm run build && npm run test:coverage
```
