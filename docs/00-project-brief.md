# Project Brief — Siak (Sistem Informasi Akademik)

> **Status:** ✅ REQUIREMENTS **APPROVED** (2026-08-01) — ✅ **SPECIFICATION APPROVED** (2026-08-01, Tugas #2)
> **Tanggal:** 2026-07-31 (diperbarui 2026-08-01 — Tugas #1 Coordinator; 2026-08-01 — Tugas #2 Coordinator)
> **Arsitek:** Hermes Agent (Requirement Architect Mode)
> **Koordinator:** Hermes Agent (Project Coordinator — Tugas #1 & #2)

---

## Ringkasan

Platform digital untuk memusatkan administrasi akademik mahasiswa — mulai dari profil, monitoring nilai (IPK), pengisian KRS, hingga pengecekan status pembayaran kuliah. Tujuannya mengurangi beban administrasi manual dan memberikan transparansi informasi bagi mahasiswa, dengan arsitektur yang dirancang menangani ribuan pengguna secara bersamaan. Proyek ini dibangun ulang dari nol berdasarkan PRD SIAKAD V2 (`source/repos/Siakad_V2/Documents/Product Requirement Document.docx`), setelah iterasi sebelumnya (Siakad, Siakad_V2, Siakad_V3) dinilai kurang memuaskan.

## Koordinasi Proyek (Tugas #2 — Coordinator)

> Bagian ini dikelola Coordinator. Isi requirements di bawah (Confirmed Facts s.d. Acceptance Criteria) TIDAK berubah dari versi APPROVED.

### Konteks

- Proyek: **Siak (Sistem Informasi Akademik)** di `C:\Users\ratih\source\repos\Siak`.
- Status pipeline per 2026-08-01 (Tugas #2):
  - **Requirements**: ✅ APPROVED (2026-08-01, Tugas #1)
  - **Solution Spec** (`docs/02-solution-spec.md`) & **Execution Plan** (`docs/03-execution-plan.md`): ✅ **APPROVE SPECIFICATION diberikan pemilik** (2026-08-01, Tugas #2)
  - **Decision Log** (`docs/decision-log.md`): ✅ Ada (19 keputusan DL-01 s.d. DL-19)
  - **Implementasi**: 🟡 **T1.1 SELESAI** (2026-08-01) — `docs/04-implementation-log.md` dibuat Developer; T1.1 (repo monorepo + Docker + CI) tervalidasi lokal
  - **Review T1.1**: ✅ SELESAI (2026-08-01) — `docs/05-review-report.md`, verdict **CONDITIONALLY APPROVED** (6 findings: 1 MEDIUM, 3 LOW, 2 INFORMATIONAL)
  - **Repo git**: ❌ **Belum diinisialisasi** (`git status` → fatal: not a git repository) — inisialisasi + remote GitHub belum dilakukan (manual pemilik, F-31)
- Blocker utama sebelum T1.2: **Repo git + remote GitHub harus diinisialisasi oleh pemilik** (CI GitHub Actions membutuhkan remote).

### Scope

| Dalam scope koordinasi (Tugas #2) | Di luar scope (bukan tugas coordinator) |
|-----------------------------------|------------------------------------------|
| Mencatat APPROVE SPECIFICATION & update status pipeline | Implementasi kode (Developer, T1.2+) |
| Memvalidasi kelengkapan gate sebelum T1.2 (spec approve + repo) | Review teknis & verdict (Reviewer, docs/05) |
| Menyiapkan handoff ke Developer untuk T1.2 | Git commit/push (manual pemilik — F-31) |
| Mencatat keputusan, risiko, open items, asumsi terbaru | Keputusan bisnis TBD (payroll detail, hosting final, format impor) |

### Task Breakdown (ringkas — detail lengkap di `docs/03-execution-plan.md`)

| Iterasi | Task | Fokus | Estimasi | Status |
|---------|------|-------|----------|--------|
| **Iterasi 1 — MVP Core** | T1.1–T1.15 | Fondasi, Auth/RBAC, KRS flow, nilai dasar, import, audit, waiting room MVP, load test, staging | ~39 hari kerja | 🟡 **T1.1 selesai & reviewed**; T1.2–T1.15 siap start (butuh repo) |
| **Iterasi 2 — Keuangan & Transkrip** | T2.1–T2.7 | Tagihan otomatis, SPP, gate lunas, transkrip PDF/Excel, notifikasi KRS | ~16 hari | ⬜ Belum dimulai |
| **Iterasi 3 — Dosen Mengajar** | T3.1–T3.8 | Pilih MK, jadwal, absensi, bimbingan, substitute, nilai detail | ~20 hari | ⬜ Belum dimulai |
| **Iterasi 4 — Skala & Integrasi** | T4.1–T4.7 | Waiting room production, payment gateway, PDDikti, payroll detail, security audit | ~23 hari | ⬜ Belum dimulai |
| **Iterasi 5 — UX & Polish** | T5.1–T5.7 | Login andal, error inline, RBAC UI, aksesibilitas, E2E | ~16 hari | ⬜ Belum dimulai |

**Total:** ~24 minggu (buffer 30%), asumsi 1 developer full-time.

### Brief Tahap Berikutnya (handoff ke Developer untuk T1.2)

1. **Pemilik (manual, F-31):** Inisialisasi repo git + remote GitHub di `C:\Users\ratih\source\repos\Siak` — **PREREQUISITE** untuk T1.2 (CI butuh remote).
2. **Developer:** Setelah repo ready → lanjut **T1.2** (migrasi DB + seed) sesuai `docs/03-execution-plan.md` & quality gates (`docs/03` §8). Sebelum T1.11, pasang coverage threshold frontend ≥80% (finding `docs/05` FIND-04).
3. **Reviewer:** Re-verifikasi checklist ada di `docs/05-review-report.md` §7 — mulai review T1.2 setelah Developer selesai.
4. **Gate release:** Approval manual pemilik sebelum production.

---

## Confirmed Facts

1. **Dari PRD:** Tiga peran pengguna — Mahasiswa, Dosen Wali, Admin Akademik.
2. **Dari PRD:** Modul autentikasi & keamanan: login dengan NIM/kredensial unik, enkripsi hashing, session timeout, proteksi SQL injection (prepared statements), rate limiting anti brute force.
3. **Dari PRD:** Modul mahasiswa — profil (data diri + edit kontak), transkrip & IPK real-time per semester + akumulasi, pengisian KRS dengan locking database untuk integritas kuota kelas, informasi pembayaran (status tagihan + histori).
4. **Dari PRD:** Modul admin & operasional — manajemen user & peran (RBAC), input nilai & verifikasi KRS berjenjang (Dosen Wali → Admin), manajemen keuangan (update status pembayaran), audit trail (log aktivitas).
5. **Dari PRD:** Non-fungsional — responsive (mobile & desktop), load time < 2 detik, caching (Redis), load balancer, RBAC, mekanisme waiting room saat trafik tinggi.
6. **Dari PRD:** Kriteria penerimaan — stabil saat minimal N pengguna simultan (nilai N belum didefinisikan); kuota matkul terkunci real-time; halaman isi KRS tidak bisa diakses sebelum pembayaran; Dosen Wali harus approval sebelum validasi akhir Admin; perubahan data terupdate instan + log aktivitas; transkrip dapat diunduh (PDF/Excel); KRS tidak bisa diubah/ditambah setelah submit.
7. **Dari PRD:** Algoritma Virtual Waiting Room — API Gateway cek `active_users_count` di Redis; jika melebihi batas aman (misal 10.000), request masuk Redis Queue dan mahasiswa mendapat Virtual Token + UI Ruang Tunggu; saat ada slot kosong (logout/session timeout 15 menit), token teratas dihapus dan server menginstruksikan klien via WebSocket untuk masuk otomatis tanpa refresh.
8. **Dari user:** Iterasi sebelumnya (Siakad, Siakad_V2, Siakad_V3) kurang memuaskan → diminta dibuat ulang berdasarkan PRD ini.
9. **Dari user (jawaban Q1):** Sistem dibangun untuk **kampus nyata** — mahasiswa/dosen/admin sungguhan akan memakainya, dan target ribuan pengguna adalah target operasional sungguhan, bukan aspirasi. *(Implikasi: persyaratan skala PRD — Redis, waiting room, load balancer — adalah kebutuhan nyata, bukan over-engineering.)*
10. **Dari user (jawaban Q2):** Skala (semua perkiraan) — ±2.000 mahasiswa aktif, ±100 dosen, puncak simultan **±5.000 mahasiswa** saat hari pertama pembukaan KRS. → **AC-01: N = 5.000**. Catatan: batas aman waiting room PRD (10.000) masih melebihi total mahasiswa; ambang disesuaikan dengan skala nyata.
11. **Dari user (jawaban Q3) — keluhan iterasi sebelumnya (non-negotiable):** (a) fitur sudah berjalan lancar, butuh perbaikan sedikit; (b) **lambat, sering gagal login, loading terus-menerus** → performa & keandalan login adalah prioritas; (c) **kode berantakan** → standar kualitas kode wajib; (d) **UX belum estetik, error muncul tidak pada tempatnya** → desain UI + penempatan pesan error yang benar (inline, kontekstual); (e) **proses pengerjaan melebar karena hak akses membingungkan** → model peran/hak akses (RBAC) harus jelas dan terdefinisi baik sejak awal.
12. **Dari user (jawaban Q4):** Pembayaran — **saat ini manual** (admin meng-update status setelah bayar); integrasi **payment gateway diinginkan untuk pengembangan selanjutnya** (desain harus mengakomodasi keduanya). **PDDikti** — perlu terhubung, tapi itu **pengembangan selanjutnya**; detail belum dikonfirmasi. **Data awal** — harus bisa **input manual DAN impor dari sistem lama/Excel**.
13. **Dari user (jawaban Q5):** Hosting **bukan keputusan sekarang**, tetapi **kemungkinan terbesar VPS/cloud** (selalu online). Implikasi: desain harus deployment-ready di VPS, tidak terkunci pada mesin lokal; keputusan final + admin teknis menyusul.
14. **Dari user (jawaban Q6):** Semua fitur dosen dari iterasi V2 **wajib ada** di versi baru: pemilihan MK, ketersediaan jadwal mengajar, jadwal mengajar, absensi perkuliahan, bimbingan mahasiswa (guidance + progress), substitute teaching, payroll dosen. User mencatat: *"mungkin ada perubahan lagi"* — scope dosen masih bisa berubah.
15. **Dari user (jawaban Q7) — model peran:** (a) **Satu tipe akun Dosen** dengan akses semua fitur dosen; (b) peran dibedakan: **Dosen Wali vs Dosen Pengajar**; (c) peran baru **Admin Sistem** — superuser yang bisa mengakses **semua fitur, termasuk fitur mahasiswa dan dosen**; (d) **bimbingan mahasiswa ditangani oleh Dosen Wali**.
16. **Dari user (jawaban Q8):** Model peran dosen = **Opsi A** — satu tipe akun Dosen, semua dosen bisa semua fitur dosen; status **Wali adalah atribut** pada akun (diberikan ke sebagian dosen); hanya dosen berstatus Wali yang bisa approval KRS + bimbingan mahasiswa binaan. Dosen non-Wali tidak melihat menu approval KRS/bimbingan relevan.
17. **Dari user (jawaban Q9):** Struktur admin = **tiga peran terpisah**: **Admin Akademik** (master data, validasi KRS, nilai), **Admin Sistem** (superuser teknis: kelola akun, akses semua modul termasuk fitur mahasiswa & dosen), **Admin Keuangan** (khusus tagihan & update status pembayaran). Jumlah orang per peran belum dikonfirmasi.
18. **Dari user (jawaban Q10) — alur KRS (REVISI dari PRD):** (1) KRS hanya bisa diisi dalam **periode yang ditentukan admin**; (2) syarat: **harus sudah lunas SPP**; (3) mahasiswa pilih dari daftar matkul yang ditawarkan; **kelas penuh tidak bisa dipilih — hanya kelas tersedia yang ditampilkan**; (4) **REVISI PRD:** Dosen Wali **hanya melihat** daftar mahasiswa yang mengambil kelasnya (read-only, bukan approval); **yang menyetujui/menolak hanya Admin Akademik** (saat ini keputusan berdasarkan pelunasan SPP); (5) setelah disetujui, mahasiswa tinggal lihat jadwal kuliah; (6) **tidak ada daftar tunggu** (kuota penuh = langsung tidak bisa pilih); (7) setelah submit, KRS **tidak bisa diedit**.
19. **Dari user (jawaban Q11) — struktur akademik:** (1) kampus punya **fakultas & prodi**; (2) tiap prodi punya **kurikulum matkul per semester**; admin memilih matkul mana yang **dibuka** pada semester berjalan; (3) satu matkul bisa punya **beberapa kelas, dibedakan berdasarkan dosen** — mahasiswa memilih kelas berdasarkan dosennya; **kuota ±30 orang per kelas**; (4) mahasiswa **terikat ke satu prodi & satu angkatan** (tahun masuk).
20. **Dari user (jawaban Q12) — penilaian:** (1) skala nilai **A–E dengan plus/minus (A-, B+)**; (2) nilai akhir dihitung dari **komponen tugas + UTS + UAS, dan setiap komponen bisa remedial**; (3) IPK = **perhitungan standar kampus Indonesia** (SKS × bobot / total SKS); aturan khusus (mis. matkul diulang) akan disesuaikan kemudian; (4) **hanya dosen yang input nilai, langsung tampil di mahasiswa** (tanpa gate approval); **Admin Akademik boleh mengedit semua menu dosen, tetapi setiap data harus menampilkan jejak "diinput oleh user X"** (attribution tampak di UI) agar tidak menyalahi aturan.
21. **Dari user (jawaban Q13) — keuangan/SPP:** (1) **satu tagihan per semester per mahasiswa**; nominal sama untuk semua mahasiswa **per angkatan** sesuai ketentuan kampus (bisa berbeda antar angkatan); (2) tagihan **dibuat otomatis di awal semester untuk semua mahasiswa**; total tagihan **sudah include semua biaya**; pengecualian: **mahasiswa baru akan disesuaikan lagi**; (3) **pembayaran sebagian (partial) diperbolehkan**, tetapi ada batas waktu: **harus lunas maksimal 1 minggu sebelum batas periode pengisian KRS berakhir**; (4) syarat KRS: **harus lunas penuh**.
22. **Dari user (jawaban Q14) — payroll dosen (sebagian TBD):** (1) skema perhitungan honor — **belum diputuskan, perlu dipastikan user nanti**; (2) **yang menginput: Admin Keuangan**; **yang dapat melihat: hanya dosen yang bersangkutan + Admin Keuangan** (privasi ketat, tidak publik); (3) siklus: **dosen tetap per bulan**; aturan **dosen kontrak masih akan dibicarakan**; (4) hubungan honor dengan absensi — **masih akan dibicarakan lagi**.
23. **Dari user (jawaban Q15) — alur mengajar:** (1) **Pemilihan MK:** Admin Akademik menentukan prodi; **dosen hanya bisa memilih MK sesuai prodi-nya**; (2) **Ketersediaan jadwal:** dosen **hanya memilih dari jadwal yang sudah diinput Admin Akademik** (mode checklist, bukan membuat jadwal sendiri); (3) **Jadwal mengajar** terkait langsung dengan kelas KRS (kelas = matkul + dosen + jadwal); (4) **Absensi:** per pertemuan — **dosen harus input materi pertemuan dulu, baru bisa melakukan absensi**; setelah itu muncul daftar nama mahasiswa dengan tombol **Hadir / Tidak Hadir**.
24. **Dari user (jawaban Q18) — KRS ditolak & nilai:** (1) **KRS ditolak Admin Akademik → mahasiswa bisa revisi & submit ulang** selama periode KRS belum berakhir; kalau periode sudah lewat → tidak bisa KRS, harus hubungi Admin Akademik. **Sistem kirim notifikasi otomatis ke mahasiswa yang belum mengisi KRS** agar segera isi; (2) **Bobot nilai: tugas 20% / UTS 30% / UAS 50%**; (3) **Remedial:** ditentukan dosen; **nilai yang diambil = nilai tertinggi** (asli vs remedial).
25. **Dari user (jawaban Q19) — mahasiswa baru, konsekuensi tidak lunas, jumlah admin:** (A) **Mahasiswa baru:** tagihan **berbeda nominal** (termasuk biaya tes, gedung, dll); KRS **otomatis disiapkan prodi**; NIM sudah dibuat **sebelum pendaftaran di sistem ini** (dari sistem lain); (B) **Tidak lunas sampai batas (1 minggu sebelum akhir periode KRS):** **otomatis tidak bisa KRS semester itu**; **tanpa denda** untuk saat ini (nanti di-update); (C) **Jumlah petugas per peran:** Admin Akademik ±5, Admin Keuangan ±5, Admin Sistem ±5.
26. **Dari user (jawaban Q20) — skala nilai, matkul diulang, SPP:** (1) **Skala nilai lengkap:** A=4.0, A-=3.7, B+=3.3, B=3.0, B-=2.7, C+=2.3, C=2.0, D=1.0, E=0; (2) **Matkul diulang:** nilai lama **digantikan** nilai baru; (3) **Payroll:** TBD (skema honor, dosen kontrak, pengaruh absensi); (4) **SPP:** disamakan dengan V2 — **Ganjil Rp 970.000 / Genap Rp 950.000**.

---

## Assumptions

1. Proyek baru diletakkan di `C:\Users\ratih\source\repos\Siak\` (folder baru, terpisah dari iterasi lama); dokumen ini berada di `docs/`. *(Belum dikonfirmasi user — mohon koreksi jika salah.)*
2. PRD SIAKAD V2 adalah sumber kebutuhan utama. Detail teknis iterasi lama (mis. AGENTS.md Siakad_V2) **tidak otomatis terbawa** kecuali dikonfirmasi user.
3. Sistem dikembangkan dan dioperasikan oleh user sendiri (pengembang pribadi, laptop tidak menyala 24/7) kecuali dikonfirmasi lain.
4. Bahasa antarmuka: Bahasa Indonesia.
5. **Repo git belum diinisialisasi** (verifikasi 2026-08-01: `git status` → "not a git repository"). Diasumsikan pemilik menginisialisasi repo + remote (mis. GitHub) sebelum Developer mulai T1.2, karena CI GitHub Actions (docs/03) membutuhkan remote; commit/push tetap manual oleh pemilik (F-31).
6. **T1.1 selesai & reviewed** (CONDITIONALLY APPROVED); **T1.2 siap dimulai** setelah repo ready.
7. **Estimasi waktu** (docs/03, total ~24 minggu) diasumsikan 1 developer full-time; dapat diparalelkan jika tim >1.

---

## Open Questions

1. ~~Konteks penggunaan nyata~~ — ✅ **Confirmed:** kampus nyata (produksi sungguhan).
2. ~~Jumlah pengguna aktual dan nilai N~~ — ✅ **Confirmed:** ±2.000 mahasiswa aktif, ±100 dosen; puncak **±5.000 simultan** saat hari pertama KRS → **AC-01: N = 5.000** (semua perkiraan user).
3. ~~Apa spesifik yang kurang memuaskan dari iterasi sebelumnya~~ — ✅ **Confirmed:** (1) fitur jalan tapi butuh perbaikan kecil; (2) lambat + gagal login + loading terus; (3) kode berantakan; (4) UX belum estetik, error tidak pada tempatnya; (5) scope melebar karena hak akses membingungkan.
4. ~~Integrasi eksternal~~ — ✅ **Sebagian confirmed:** berjalan mandiri saat ini; pembayaran manual dulu (gateway nanti); PDDikti = pengembangan selanjutnya (belum dikonfirmasi detail). Sisa open: format data lama/Excel untuk impor.
5. ~~Di mana sistem akan di-hosting~~ — ✅ **Sebagian confirmed:** kemungkinan terbesar VPS/cloud; keputusan final belum diambil (bukan keputusan sekarang). Sisa open: siapa admin teknis (user sendiri vs tim IT kampus).
6. ~~Cakupan fitur dosen~~ — ✅ **Confirmed:** semua fitur dosen V2 wajib (pilih MK, ketersediaan jadwal, jadwal mengajar, absensi, bimbingan, substitute teaching, payroll). Catatan user: *"mungkin ada perubahan lagi"* — scope bisa berubah.
7. ~~Data awal~~ — ✅ **Sebagian confirmed:** input manual + impor dari sistem lama/Excel. Sisa open: format file & struktur data lama.
8. Ketentuan SPP/tagihan: nominal tetap per semester (V2: Ganjil Rp 970.000 / Genap Rp 950.000) — berlaku juga di versi baru?
9. ~~Model peran dosen~~ — ✅ **Confirmed (Opsi A):** satu tipe akun Dosen; status Wali = atribut; Wali bisa approval KRS + bimbingan; non-Wali tidak melihat menu tersebut.
10. ~~Admin Akademik vs Admin Sistem~~ — ✅ **Confirmed:** tiga peran admin terpisah — Admin Akademik, Admin Sistem (superuser), Admin Keuangan. Sisa open: jumlah orang/petugas per peran.
11. ~~KRS ditolak Admin Akademik~~ — ✅ **Confirmed:** mahasiswa bisa revisi & submit ulang selama periode KRS; lewat periode → tidak bisa KRS, hubungi admin. Notifikasi otomatis ke mahasiswa yang belum isi KRS.
12. ~~Detail nilai & IPK~~ — ✅ **Confirmed:** bobot tugas 20% / UTS 30% / UAS 50%; remedial ditentukan dosen, ambil nilai tertinggi; **skala nilai: A=4.0, A-=3.7, B+=3.3, B=3.0, B-=2.7, C+=2.3, C=2.0, D=1.0, E=0**; **matkul diulang: nilai lama digantikan nilai baru**. Sisa open: (tidak ada lagi yang kritis).
13. ~~Detail payroll dosen~~ — ✅ **Sebagian confirmed:** input oleh Admin Keuangan; visibilitas hanya dosen bersangkutan + Admin Keuangan; dosen tetap per bulan. **Sisa open (TBD): skema perhitungan honor, aturan dosen kontrak, pengaruh absensi terhadap honor** — user akan pastikan nanti.
14. ~~Mahasiswa baru~~ — ✅ **Confirmed:** tagihan berbeda (tes, gedung); KRS otomatis disiapkan prodi; NIM sudah ada dari sistem lain sebelum pendaftaran.
15. ~~Konsekuensi tidak lunas~~ — ✅ **Confirmed:** otomatis tidak bisa KRS semester itu; tanpa denda (saat ini); tidak bisa KRS semester itu.
16. ~~Jumlah admin~~ — ✅ **Confirmed:** Admin Akademik ±5, Admin Keuangan ±5, Admin Sistem ±5.
17. **Format file impor data lama (Excel/CSV)** — struktur kolom belum dipastikan.
18. **Siapa admin teknis** (user sendiri vs tim IT kampus)?
19. **Kanal notifikasi KRS otomatis** (email/WA/Telegram)?
20. **Denda keterlambatan pembayaran** (saat ini tanpa denda, akan di-update user).
21. **Visibilitas Dosen Wali terhadap transkrip/IPK binaan** — asumsi Analyst (docs/02 §15 #4); perlu konfirmasi sebelum implementasi Iterasi 1.

---

## Recommendations

1. **Teknologi sudah dipilih** (docs/02 DL-02 s.d. DL-07): Node.js 22 + TypeScript + Express; React 18 + Vite + Tailwind; PostgreSQL 16; Redis 7; Socket.io; Docker + Nginx; GitHub Actions; Prometheus/Grafana/Loki.
2. **Arsitektur deployment-ready** — karena hosting kemungkinan VPS/cloud, rancang dengan: Docker, environment variables, health checks, graceful shutdown, migrasi database terpisah dari kode.
3. **Standar kualitas kode sejak awal** — linter, formatter, unit test minimum 80% coverage, code review wajib (mencegah "kode berantakan" iterasi sebelumnya).
4. **RBAC sebagai satu-satunya sumber kebenaran akses** — matriks hak akses per peran + status Wali terdokumentasi di `docs/02-solution-spec.md` sebelum Developer mulai.
5. **Waiting room ambang realistis** — batas default **5.000, configurable** (DL-11), dikalibrasi lewat load test (T1.14, T4.5); implementasikan dengan fallback polling jika WebSocket bermasalah.
6. **Audit trail & atribusi built-in** — setiap mutasi data (termasuk edit admin di menu dosen) otomatis mencatat user ID + timestamp + aksi; UI menampilkan "diinput oleh X".
7. **Error handling inline** — tidak pakai toast/popup; validasi form & error API ditampilkan di dekat field yang bermasalah (sesuai preferensi UX user).
8. **Notifikasi otomatis KRS** — scheduler/background job cek mahasiswa yang belum isi KRS selama periode, kirim notifikasi (email/WA/Telegram sesuai integrasi nanti).
9. **Payroll detail ditunda** — F-26 diimplementasi minimal (input admin keuangan + visibilitas terbatas); logika perhitungan honor ditambah iterasi 4 setelah user pastikan.

---

## Risks

| Risiko | Dampak | Mitigasi |
|--------|--------|----------|
| ~~Target "ribuan pengguna simultan" tanpa kebutuhan produksi nyata~~ — ✅ sudah dikonfirmasi kampus nyata | — | **Skala pengguna aktual: puncak ±5.000 simultan (perkiraan user)** |
| Ketergantungan integrasi eksternal (payment gateway, PDDikti) | Blokir alur KRS/pembayaran | Desain mandiri dulu (manual); integrasi sebagai plugin/adapter nanti |
| Waiting room berbasis WebSocket + Redis sulit diverifikasi tanpa beban nyata | Klaim "siap ribuan pengguna" tidak teruji | Uji beban bertahap (k6/JMeter) + fallback polling sederhana |
| Data akademik sensitif (nilai, pembayaran) | Risiko privasi/kebocoran | RBAC ketat, audit trail, hashing kredensial, prepared statements |
| Model peran kompleks (5 tipe akun + atribut Wali) | Kebingungan hak akses terulang | Matriks RBAC terdokumentasi & di-review sebelum coding; 1 test per sel matrix (T1.4) |
| Payroll honor TBD | Estimasi usaha tidak akurat | F-26 minimal dulu; detail perhitungan iterasi 4 setelah keputusan user |
| NIM mahasiswa baru dari sistem lain | Impor data awal gagal/duplikat | Impor dengan validasi NIM unik + upsert (update jika sudah ada) |
| Kode berantakan iterasi sebelumnya terulang | Maintenance cost tinggi, bug berulang | Enforce lint/format/test/review sejak commit pertama; CI gate |
| **Repo git belum diinisialisasi** | Handoff Developer T1.2 tertunda | Pemilik inisialisasi repo + remote GitHub sebelum Developer mulai |
| **Gate APPROVE SPECIFICATION** — ✅ diberikan 2026-08-01 (Tugas #2) | — | T1.2 bisa start setelah repo ready |

---

## Goals & Non-Goals

| Goals | Non-Goals |
|-------|-----------|
| Memusatkan administrasi akademik mahasiswa dalam satu platform | *(Belum ditentukan — perlu konfirmasi, mis. SPMB/penerimaan mahasiswa baru, e-learning, sistem kepegawaian)* |
| Transparansi informasi akademik bagi mahasiswa (nilai, IPK, status bayar) | |
| Mengurangi beban administrasi manual (input nilai, verifikasi KRS, update pembayaran) | |
| Arsitektur siap menangani ribuan pengguna bersamaan | |

---

## Users

| Tipe | Jumlah | Deskripsi |
|------|--------|-----------|
| Mahasiswa | ±2.000 (perkiraan) | Pengguna utama; akses profil, nilai/transkrip, transaksi akademik (KRS), info pembayaran |
| Dosen (Wali/Pengajar) | ±100 (perkiraan) | Satu tipe akun; semua fitur dosen. Status **Wali** = atribut → tambahan: approval KRS + bimbingan mahasiswa binaan |
| Admin Akademik | ±5 | Master data, validasi KRS, nilai, buka periode KRS, input jadwal, buka matkul |
| Admin Keuangan | ±5 | Tagihan & update status pembayaran, input payroll dosen |
| Admin Sistem | ±5 | **Superuser** — kelola akun, akses semua modul termasuk fitur mahasiswa & dosen |

---

## Workflows

**Alur utama per semester:**

1. **Perencanaan Akademik** — Admin Akademik buka periode KRS, input jadwal, buka matkul per semester
2. **Persiapan Keuangan** — Sistem generate tagihan otomatis (mahasiswa lama + baru); mahasiswa baru tagihan beda (tes, gedung)
3. **Pembayaran** — Mahasiswa bayar SPP → Admin Keuangan update status lunas (partial diperbolehkan, batas 1 minggu sebelum akhir periode KRS)
4. **Pengisian KRS** — Mahasiswa pilih kelas (kuota real-time, hanya kelas tersedia yang tampil, tidak ada waitlist); syarat: SPP lunas penuh
5. **Validasi KRS** — Admin Akademik setuju/tolak (berdasar pelunasan SPP); ditolak → revisi & submit ulang selama periode; lewat periode → hubungi admin; notifikasi otomatis ke yang belum isi
6. **Perkuliahan** — Dosen pilih MK (sesuai prodi) → ketersediaan jadwal (checklist dari jadwal admin) → absensi per pertemuan (wajib input materi dulu, baru tombol Hadir/Tidak Hadir)
7. **Penilaian** — Dosen input nilai (tugas 20% / UTS 30% / UAS 50% + remedial per komponen, ambil nilai tertinggi); langsung tampil ke mahasiswa; Admin Akademik bisa edit dengan atribusi "diinput oleh X"
8. **Bimbingan & Substitute** — Dosen Wali catat bimbingan (catatan pertemuan yg sudah terjadi); Substitute teaching tanpa approval + akses penuh halaman dosen yg diganti
9. **Transkrip & Payroll** — Mahasiswa unduh transkrip (PDF/Excel, IPK standar Indonesia, matkul diulang nilai lama digantikan); Admin Keuangan input payroll (visibilitas terbatas: dosen bersangkutan + admin keuangan)
10. **Audit & Monitoring** — Semua aktivitas tercatat (audit trail + atribusi); Admin Sistem supervise

---

## Data & Integrations

| Entitas Data Utama | Deskripsi |
|-------------------|-----------|
| Fakultas / Prodi / Angkatan | Organisasi akademik; mahasiswa terikat 1 prodi + 1 angkatan |
| Kurikulum per Prodi | Daftar matkul per semester; admin memilih matkul yg dibuka semester berjalan |
| Mata Kuliah & Kelas | 1 matkul bisa punya beberapa kelas (dibedakan per dosen); kuota ±30/kelas |
| Mahasiswa | Profil, NIM (sudah ada dari sistem lain sebelum pendaftaran), status pembayaran, KRS, nilai, bimbingan |
| Dosen | Profil, status Wali (atribut), MK yang diampu, jadwal, absensi, bimbingan, payroll |
| KRS | Periode, item (kelas yg dipilih), status (draft/submitted/approved/rejected), locking kuota |
| Nilai | Komponen (tugas/UTS/UAS), remedial, nilai akhir, skala A=4.0...E=0 |
| Tagihan & Pembayaran | 1 tagihan/semester/mahasiswa; nominal per angkatan; partial diperbolehkan; status unpaid/partial/paid |
| Audit Log | Setiap mutasi data: user ID, timestamp, aksi, nilai lama/baru, atribusi "diinput oleh X" |

**Integrasi:**
- **Saat ini (mandiri):** Impor data awal (Excel/CSV/sistem lama), pembayaran manual
- **Pengembangan selanjutnya:** Payment gateway (API keluar), PDDikti (API dua arah)

---

## Security & Constraints

| Aspek | Detail |
|-------|--------|
| **Autentikasi** | Login NIM/kredensial unik, password hashing, session timeout, rate limiting anti brute force |
| **Otorisasi (RBAC)** | 5 tipe akun + atribut Wali; matriks hak akses terdokumentasi & di-enforce di backend & frontend |
| **Integritas Data** | Prepared statements (anti SQL injection), locking database kuota kelas, transaksi ACID |
| **Audit & Atribusi** | Semua perubahan data (termasuk edit admin di menu dosen) log: user, waktu, aksi, nilai lama/baru; UI tampil "diinput oleh X" |
| **Ketersediaan** | Target 5.000 simultan (puncak KRS); waiting room Redis+WebSocket (ambang default 5.000 configurable, fallback polling); load balancer; caching Redis |
| **Hosting** | Kemungkinan VPS/cloud; deployment-ready (Docker, env vars, health check, migrasi DB terpisah); laptop user tidak 24/7 |
| **Kualitas Kode** | Linter, formatter, unit test ≥80%, code review wajib, CI gate — mencegah "kode berantakan" iterasi sebelumnya |
| **UX Error Handling** | Error inline di field yg bermasalah (bukan toast/popup); notifikasi otomatis KRS ke mahasiswa yg belum isi |

---

## Priorities

*(Draf — akan difinalisasi setelah APPROVE REQUIREMENTS)*

| Iterasi | Fokus | Fitur Utama | Catatan |
|---------|-------|-------------|---------|
| **Iterasi 1 (MVP Core)** | Fondasi + KRS + Nilai dasar | Auth, RBAC, KRS flow, validasi admin, import data, audit trail, performa 2k users | F-01~F-07, F-07a~F-07d, F-09~F-11, F-13~F-15, F-18, NF-01~NF-06, S-01~S-07 |
| **Iterasi 2 (Keuangan & Transkrip)** | Pembayaran & pelaporan | Tagihan otomatis, SPP, status pembayaran, unduh transkrip PDF/Excel | F-08, F-08a~F-08f, F-12, F-16, F-19 |
| **Iterasi 3 (Dosen Mengajar)** | Alur mengajar lengkap | Pilih MK, jadwal, absensi (materi wajib), bimbingan, substitute teaching | F-10 (detail nilai), F-20~F-25 |
| **Iterasi 4 (Skala & Integrasi)** | Waiting room, integrasi | Virtual waiting room Redis+WebSocket, payment gateway, PDDikti, payroll detail | F-17, Integrasi, F-26 |
| **Iterasi 5 (UX & Polish)** | Perbaikan UX dari keluhan lama | Login andal, error inline, RBAC konsisten, estetika UI | AC-08, AC-09, AC-10 |

---

## Acceptance Criteria

*(Lengkap — dari Confirmed Facts & wawancara)*

| ID | Kriteria |
|----|----------|
| AC-01 | Sistem stabil saat diakses minimal **5.000** pengguna simultan (puncak hari pertama KRS) |
| AC-02 | Kuota mata kuliah terkunci real-time — tidak bisa melebihi kapasitas |
| AC-03 | Halaman isi KRS tidak dapat diakses sebelum mahasiswa melakukan pembayaran **lunas penuh** (partial tidak cukup) |
| AC-04 | Persetujuan KRS dilakukan **Admin Akademik** (setuju/tolak; saat ini berdasarkan pelunasan SPP); Dosen Wali hanya melihat daftar mahasiswa di kelasnya — **revisi dari PRD** |
| AC-04a | KRS hanya dapat diisi dalam periode yang ditentukan admin; di luar periode tidak bisa |
| AC-04b | Tidak ada daftar tunggu — kuota penuh berarti kelas tidak dapat dipilih |
| AC-04c | KRS ditolak → mahasiswa bisa revisi & submit ulang selama periode KRS; lewat periode → tidak bisa KRS, hubungi admin |
| AC-04d | **Notifikasi otomatis ke mahasiswa yang belum mengisi KRS** agar segera isi |
| AC-05 | Semua perubahan data (profil/nilai) terupdate instan dengan log aktivitas |
| AC-06 | Transkrip nilai dapat diunduh (format PDF/Excel) |
| AC-07 | Setelah KRS di-submit, mahasiswa tidak bisa menambah/mengubah KRS |
| AC-08 | Login andal: tidak ada gagal login / loading tanpa henti pada beban normal (keluhan iterasi lama) |
| AC-09 | Pesan error tampil inline di tempat yang tepat (bukan popup/toast di luar konteks) — sesuai preferensi UX user |
| AC-10 | Matriks hak akses per peran terdokumentasi dan konsisten — tidak ada aksi yang bisa dilakukan di luar perannya |