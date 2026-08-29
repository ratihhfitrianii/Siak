# SIAK — Sistem Informasi Akademik
## Specification Sheet / Fitur Produk

**Versi Produk:** 1.0 (Siap Implementasi)
**Tanggal:** Agustus 2026
**Lisensi:** Apache 2.0 (source code + lisensi penggunaan)

---

## 1. Ringkasan Produk

**SIAK (Sistem Informasi Akademik)** adalah platform digital terintegrasi untuk pengelolaan operasional perguruan tinggi — mencakup akademik, keuangan, kepegawaian, dan pelaporan. Dibangun dengan arsitektur modern (React + Node.js + PostgreSQL), siap pakai untuk kampus dengan kapasitas hingga **5.000+ pengguna aktif**.

| Kriteria | Nilai |
|----------|-------|
| **Target pengguna** | Mahasiswa, Dosen, Admin Akademik, Admin Keuangan, Admin Sistem |
| **Jumlah peran (role)** | 5 peran + atribut peran khusus (Dosen Wali) |
| **Hak akses (permissions)** | 33 permission granular, enforce di backend |
| **Endpoint API** | 165+ endpoint RESTful |
| **Tabel database** | 32 tabel relasional (PostgreSQL) |
| **Halaman aplikasi** | 42+ halaman (React SPA) |
| **Baris kode** | ±33.000 baris (produksi) + ±22.500 baris (test) |
| **Automated tests** | 72 file test (unit + integration + E2E) |
| **Cakupan test (coverage)** | Backend ≥75%, Frontend ≥80% |
| **Skalabilitas** | 5.000+ pengguna (beban KRS massal teruji) |
| **Bahasa** | Bahasa Indonesia (UI sepenuhnya) |

---

## 2. Modul & Fitur Lengkap

### 🎓 2.1 Manajemen Akademik

| Fitur | Deskripsi |
|-------|-----------|
| **KRS Online** | Pengisian Kartu Rencana Studi online; periode KRS dikelola admin; validasi jadwal bentrok, duplikasi MK, prasyarat; alur draft → submit → approve/reject oleh Admin Akademik |
| **Kurikulum** | Manajemen kurikulum per program studi per semester; mata kuliah wajib/pilihan; SKS; pemetaan ke kelas |
| **Kelas & Jadwal** | Manajemen kelas (kode, ruang, kapasitas), jadwal per minggu (hari, jam) — kalender grid interaktif |
| **Penjadwalan Mengajar** | Dosen memilih mata kuliah (filter prodi), admin mengatur slot waktu, persetujuan MK oleh Admin Akademik |
| **Penilaian (Grades)** | Input nilai oleh dosen, edit dengan atribusi wajib (audit), perhitungan IPK/IP per semester otomatis |
| **Transkrip & IPK** | Transkrip nilai otomatis, perhitungan IPS per semester & IPK kumulatif, grafik batang nilai |
| **Hasil Studi** | Dashboard nilai mahasiswa, riwayat per semester, unduh transkrip |

### 👨‍🏫 2.2 Kehadiran (Absensi)

| Fitur | Deskripsi |
|-------|-----------|
| **Sesi Absensi** | Dosen membuat & membuka/menutup sesi absensi per pertemuan |
| **Check-in Mahasiswa** | Mahasiswa check-in mandiri via **ID Sesi** atau **QR code** (real-time) |
| **Rekap Kehadiran** | Rekap otomatis hadir/izin/sakit/tidak hadir, filter per kelas |
| **Sinkron Real-time** | Update status kehadiran real-time via WebSocket (Socket.IO) |

### 📝 2.3 Skripsi / Tugas Akhir

| Fitur | Deskripsi |
|-------|-----------|
| **Pengajuan Proposal** | Mahasiswa mengajukan proposal online (upload file, max 2 pembimbing) |
| **Review Proposal** | Dosen review & setujui/tolak dengan catatan; Admin kelola semua ajuan |
| **Riwayat Status** | Historis lengkap status pengajuan (diajukan → direview → disetujui/ditolak) |
| **Bimbingan** | Log bimbingan dosen pembimbing & dosen wali (dua domain terpisah) |
| **Mahasiswa Binaan** | Dosen wali melihat daftar mahasiswa binaan & progres akademik |

### 💳 2.4 Keuangan

| Fitur | Deskripsi |
|-------|-----------|
| **Tagihan (Billing)** | Generate tagihan per mahasiswa per semester (UKT, SPP, dll) |
| **Pembayaran Online** | Mahasiswa melihat tagihan, status pembayaran, riwayat |
| **Verifikasi Pembayaran** | Admin keuangan update status (lunas/belum), upload bukti bayar |
| **Pembayaran Grouped** | Rekap pembayaran per mahasiswa — semua semester dalam satu tampilan |
| **Blokir KRS Otomatis** | Mahasiswa dengan tunggakan **otomatis diblokir** dari KRS (3-layer gate) |
| **Payroll Dosen** | Hitung gaji dosen otomatis (jumlah MK, SKS), batch approve, **slip gaji PDF** otomatis |
| **Export Excel** | Rekap data keuangan export ke Excel |

### 👥 2.5 Manajemen Pengguna & Master Data

| Fitur | Deskripsi |
|-------|-----------|
| **Manajemen User** | CRUD pengguna (mahasiswa, dosen, admin), reset password, aktivasi |
| **Master Fakultas/Prodi** | CRUD fakultas, program studi, departemen, tahun akademik, semester |
| **Master Mahasiswa** | CRUD data mahasiswa (NIM, prodi, angkatan, jalur masuk), pagination 10/halaman |
| **Master Dosen** | CRUD data dosen (NIK, NIDN, prodi), status aktif |
| **Mata Kuliah** | CRUD global, atribut SKS, kurikulum |
| **Import Data** | Import massal via **CSV & Excel** (mahasiswa, dosen, MK, kelas) |

### 📢 2.6 Komunikasi & Notifikasi

| Fitur | Deskripsi |
|-------|-----------|
| **Informasi Penting** | Pengumuman/announcement CRUD oleh admin, tampil di dashboard |
| **Notifikasi** | Pusat notifikasi per pengguna (read/unread) |

### 🔄 2.7 Integrasi & Regulasi

| Fitur | Deskripsi |
|-------|-----------|
| **PDDikti Sync** | Modul sinkronisasi data ke PDDikti (Neo Feeder ready) |
| **Payment Gateway** | Modul integrasi payment gateway (VA/bank transfer) — arsitektur siap |
| **Email** | Nodemailer terintegrasi (notifikasi email) |

### 🛡️ 2.8 Keamanan & Tata Kelola

| Fitur | Deskripsi |
|-------|-----------|
| **RBAC Lengkap** | 5 peran × 33 permission, enforce di backend (bukan hanya UI) |
| **JWT Auth** | Access token (15 menit) + refresh token (rotasi), logout |
| **Password Policy** | Minimum 12 karakter, must-change-password, lockout setelah gagal login |
| **Audit Log** | Log semua aksi penting (siapa, kapan, apa) — traceable |
| **Helmet Security** | HTTP security headers (CSP, XSS protection) |
| **Rate Limiting** | Proteksi anti-brute-force di endpoint auth |
| **Waiting Room** | Antrian saat beban puncak (KRS massal) — mencegah server down |
| **Input Validation** | Zod schema validation di semua endpoint |

---

## 3. Arsitektur Teknologi

```
┌─────────────────────────────────────────────────────┐
│                  FRONTEND (Vercel/CDN)              │
│         React 19 + Vite + Tailwind CSS + TS         │
│              • SPA 42+ halaman                      │
│              • Real-time via Socket.IO              │
│              • Bundle ≤200 kB gzip                  │
└──────────────────────┬──────────────────────────────┘
                       │ REST API (HTTPS)
┌──────────────────────▼──────────────────────────────┐
│                  BACKEND (Node.js)                  │
│        Express + TypeScript (modular monolith)      │
│              • 24 modul, 165+ endpoint              │
│              • Zod validation semua input           │
│              • JWT + RBAC middleware                │
│              • Audit log seluruh transaksi          │
└──────┬──────────────────────┬───────────────────────┘
       │                      │
┌──────▼──────┐      ┌────────▼────────┐
│ PostgreSQL  │      │    Redis        │
│ (Neon/self) │      │  • Session     │
│ 32 tabel    │      │  • Rate limit  │
│ relasional  │      │  • Queue       │
└─────────────┘      └─────────────────┘
```

| Layer | Teknologi | Keterangan |
|-------|-----------|------------|
| **Frontend** | React 19, Vite 6, TypeScript 5, Tailwind CSS 3 | SPA modern, code-splitting per halaman |
| **Backend** | Node.js 22, Express 4, TypeScript | Monolith modular (24 modul) |
| **Database** | PostgreSQL (relasional, 32 tabel) | Migrasi versioned (30 file SQL) |
| **Cache/Queue** | Redis (ioredis) | Session, rate-limit, waiting room |
| **Real-time** | Socket.IO | Absensi real-time, notifikasi |
| **Auth** | JWT (access+refresh), bcrypt | Standar keamanan modern |
| **Validation** | Zod | Schema validation level produksi |
| **Logging** | Pino (structured JSON logs) | Monitor & debugging |
| **Metrics** | Prometheus client | Observability siap |
| **PDF** | PDFKit | Slip gaji, laporan |
| **Excel/CSV** | ExcelJS, csv-parse | Import/export massal |

---

## 4. Skalabilitas & Kinerja

- **Target kapasitas:** 5.000+ mahasiswa aktif
- **Beban puncak teruji:** KRS massal (semua mahasiswa akses bersamaan) — desain waiting room + rate limiting mencegah breakdown
- **Kinerja frontend:** bundle gzip ≤ 200 kB (code-splitting per halaman, lazy loading)
- **Arsitektur stateless** backend → mudah di-scale horizontal
- **Database terindeks** untuk query umum (NIM, semester, kelas)
- **CI/CD siap:** lint, typecheck, build, test (coverage threshold), format check — semua bergate

---

## 5. Penjaminan Mutu (Quality Assurance)

| Aspek | Detail |
|-------|--------|
| **77+ automated tests** | Unit, integration (supertest + PostgreSQL), frontend (Vitest + Testing Library), E2E (Playwright) |
| **Coverage wajib** | Backend: 75% branch/lines, 80% funcs/stmts; Frontend: 80% |
| **Standard kode** | ESLint (0 warning), Prettier (format check), TypeScript strict |
| **Keamanan dependency** | npm audit dipertahankan, override untuk vulnerability |
| **Dokumentasi** | Docs teknis lengkap (arsitektur, modul, deployment, RBAC matrix) |

---

## 6. Paket Penawaran

### Opsi A — Lisensi + Implementasi (Beli Putus)
| Komponen | Termasuk |
|----------|----------|
| Source code lengkap (frontend + backend + migrations) | ✅ |
| Lisensi penggunaan (Apache 2.0) | ✅ |
| Instalasi & konfigurasi server | ✅ |
| Migrasi data awal (CSV/Excel) | ✅ |
| Pelatihan admin & staf (2 sesi) | ✅ |
| Dokumentasi teknis & panduan pengguna | ✅ |
| Garansi perbaikan bug (3 bulan) | ✅ |
| Dukungan teknis (1 tahun) | ✅ |

### Opsi B — SaaS / Langganan Tahunan (Hosting Kami)
| Komponen | Termasuk |
|----------|----------|
| Penggunaan penuh semua modul | ✅ |
| Hosting & maintenance (uptime target 99,9%) | ✅ |
| Backup data terjadwal | ✅ |
| Update regulasi & fitur | ✅ |
| Support teknis | ✅ |

### Opsi C — Source Code Saja
| Komponen | Termasuk |
|----------|----------|
| Source code lengkap + dokumentasi | ✅ |
| Lisensi Apache 2.0 | ✅ |
| Bimbingan instalasi (1 sesi remote) | ✅ |

---

## 7. Roadmap Pengembangan (Kustomisasi Opsional)

Modul tambahan yang bisa dikembangkan sesuai kebutuhan kampus:

| Modul | Estimasi Harga |
|-------|---------------|
| **PMB (Penerimaan Mahasiswa Baru)** online | Rp 15–30 juta |
| **E-Learning / LMS** (materi, kuis, tugas) | Rp 20–40 juta |
| **E-Library / Perpustakaan** | Rp 10–25 juta |
| **E-Office / Surat-menyurat** | Rp 10–20 juta |
| **EDOM** (Evaluasi Dosen oleh Mahasiswa) | Rp 8–15 juta |
| **Tracer Study** (pelacakan alumni) | Rp 8–15 juta |
| **SIREKAT** (rencana kerja tahunan) | Rp 10–20 juta |
| **Integrasi SIMPEG** (kepegawaian) | Rp 10–20 juta |

---

*Dokumen ini adalah bagian dari paket penawaran SIAK. Harga & detail implementasi terdapat di dokumen quotation terpisah.*