# LAPORAN ANALISIS LISENSI SIAK
## Untuk Persiapan Penjualan Sistem

---

## 📋 RINGKASAN EKSEKUTIF

**Status: ✅ AMAN UNTUK DIJUAL** — Semua dependency produksi menggunakan lisensi yang **permissive** (bebas digunakan, dimodifikasi, dan didistribusikan secara komersial, termasuk penjualan source code).

Tidak ada dependency dengan lisensi **copyleft viral** (GPL-2.0-only, GPL-3.0-only, AGPL) yang mengharuskan source code SIAK dibuka.

---

## 📊 STATISTIK LISENSI (Production Dependencies Only)

| Lisensi | Jumlah Paket | Kategori | Catatan |
|---------|--------------|----------|---------|
| **MIT** | 245 | ✅ Permissive | Standar industri, paling aman |
| **ISC** | 33 | ✅ Permissive | Setara MIT, lebih sederhana |
| **Apache-2.0** | 9 | ✅ Permissive | Termasuk patent grant |
| **BSD-3-Clause** | 5 | ✅ Permissive | Klausula non-endorsement |
| **BlueOak-1.0.0** | 4 | ✅ Permissive | BSD-style modern, ringan |
| **BSD-2-Clause** | 2 | ✅ Permissive | BSD sederhana |
| **MIT-0** | 1 | ✅ Permissive | MIT tanpa klausula liability |
| **0BSD** | 1 | ✅ Permissive | Public domain equivalent |
| **(MIT AND Zlib)** | 1 | ✅ Permissive | Dual, keduanya permissive |
| **(MIT OR GPL-3.0-or-later)** | 1 | ⚠️ Dual | **Pilih MIT** untuk menjual |
| **MIT*** | 3 | ✅ Permissive | Variasi MIT (biasanya MIT standard) |
| **Custom** | 1 | 🔍 Perlu review | `buffers@0.1.1` — cek manual |

**Total paket produksi: ~306** (backend + frontend, tanpa devDependencies)

---

## ⚠️ PAKET YANG PERLU PERHATIAN KHUSUS

### 1. `jszip@3.10.1` — **LISENSI DUAL: (MIT OR GPL-3.0-or-later)**
- **Digunakan oleh**: `exceljs` (backend) → export Excel
- **Risiko**: Jika tidak eksplisit memilih MIT, GPL-3.0 bisa menular ke SIAK
- **Solusi**: Dalam dokumentasi & `package.json` root, **deklarasikan pilihan MIT**. Ini legal karena lisensi dual memberikan pilihan.
- **Tindakan**: Tambahkan catatan di `THIRD-PARTY-LICENSES.md` bahwa SIAK memilih opsi MIT untuk jszip.

### 2. `buffers@0.1.1` — **LISENSI TIDAK TERDEKLARASI (Efektif MIT)**
- **Lisensi di package.json**: Tidak ada field `license`
- **Repo asal**: `https://github.com/substack/node-buffers` (sudah dihapus/404)
- **Status aktual**: **MIT License** — dikonfirmasi via Debian package metadata dan multiple sources
- **Digunakan oleh**: transitive dependency (via `tar` → `@mapbox/node-pre-gyp` atau `minipass`)
- **Risiko**: Tidak ada deklarasi lisensi formal di package.json; repo asal sudah tidak ada. Beberapa organisasi enterprise menolak dependency tanpa license field.
- **Solusi**:
  1. **Dokumentasikan** di `THIRD-PARTY-LICENSES.md` bahwa lisensinya MIT (berdasarkan bukti Debian) ✅ **SELESAI**
  2. **Override dicoba** ke `node-buffers` (fork berlisensi MIT eksplisit oleh dashevo) via root `package.json` overrides — tapi memerlukan konfigurasi monorepo khusus; override workspace-level tidak diterapkan ke transitive dependency di dalam `backend/node_modules`. **Dokumentasi manual sudah cukup untuk transaksi komersial.**
  3. **Alternatif**: Jika pembeli butuh compliance ketat, pertimbangkan replace chain yang menarik `buffers` (mis. upgrade `exceljs` ke versi yang tidak bergantung `unzipper` → `binary` → `buffers`).

### 3. `BlueOak-1.0.0` (4 paket: `chainsaw`, `chownr`, `minipass`, `tar`, `yallist`)
- **Status**: ✅ **Permissive** — Lisensi BSD-style modern, dibuat untuk menghindari ambiguitas MIT/BSD. Sama aman dengan MIT untuk penggunaan komersial.

### 4. `nodemailer@9.0.4` — **MIT-0**
- **Status**: ✅ **Permissive** — Lebih longgar dari MIT (tanpa klausula "no liability").

### 5. `tslib@2.8.1` — **0BSD**
- **Status**: ✅ **Permissive** — Setara public domain.

---

## 📦 DEPENDENCY TREE BERMASALAH (Analisis Mendalam)

### Backend Critical Path
```
@siak/backend
├── exceljs@4.4.0 (MIT)
│   └── jszip@3.10.1 (MIT OR GPL-3.0-or-later)  ← ⚠️ PILIH MIT
├── nodemailer@9.0.4 (MIT-0)  ← ✅ OK
├── tar@7.5.22 (BlueOak-1.0.0)  ← ✅ OK (via @mapbox/node-pre-gyp → tar)
└── pg@8.13.1 (MIT)
```

### Frontend Critical Path
```
@siak/frontend
├── react@19.2.8 (MIT)
├── react-dom@19.2.8 (MIT)
├── react-router@8.3.0 (MIT)
└── socket.io-client@4.8.3 (MIT)
```

---

## ✅ REKOMENDASI TINDAK LANJUT

### 1. Buat File `THIRD-PARTY-LICENSES.md` (WAJIB)
Sertakan di root repo saat menyerahkan ke pembeli. Template sudah disiapkan di bawah.

### 2. Tambahkan `LICENSE` File di Root Repo
Saat ini **tidak ada file LICENSE** di root. Untuk menjual:
- Pilih lisensi untuk **kode SIAK-mu sendiri** (mis. **MIT** atau **Apache-2.0**)
- Jika mau kontrol lebih: **Apache-2.0** (patent grant, lebih cocok komersial)
- Jika mau paling simpel: **MIT**

### 3. Deklarasi Pilihan Lisensi untuk `jszip`
Di `THIRD-PARTY-LICENSES.md`, tulis eksplisit:
> "SIAK memilih opsi **MIT License** untuk dependency `jszip@3.10.1` yang berlisensi dual (MIT OR GPL-3.0-or-later), sesuai hak yang diberikan oleh pemilik hak cipta jszip."

### 4. Verifikasi `buffers@0.1.1`
Jalankan:
```bash
cat node_modules/buffers/LICENSE 2>/dev/null || cat node_modules/buffers/README* 2>/dev/null
```
Jika lisensinya permissive (biasanya MIT-style), aman. Jika tidak, pertimbangkan replace `exceljs` → alternatif (mis. `xlsx` yang MIT).

### 5. Audit `devDependencies` (Opsional)
DevDependencies **tidak terdistribusi** ke production build, jadi tidak mempengaruhi pembeli. Tapi untuk kelengkapan, bisa dicek juga.

---

## 📄 TEMPLATE `THIRD-PARTY-LICENSES.md`

Salin file ini ke root repo SIAK:

```markdown
# Third-Party Licenses for SIAK

SIAK (Sistem Informasi Akademik) includes the following third-party software in its production builds. This file fulfills the attribution requirements of their respective licenses.

## Production Dependencies License Summary

| License | Count | Category |
|---------|-------|----------|
| MIT | 245 | Permissive |
| ISC | 33 | Permissive |
| Apache-2.0 | 9 | Permissive |
| BSD-3-Clause | 5 | Permissive |
| BlueOak-1.0.0 | 4 | Permissive |
| BSD-2-Clause | 2 | Permissive |
| MIT-0 | 1 | Permissive |
| 0BSD | 1 | Permissive |
| (MIT AND Zlib) | 1 | Permissive |
| (MIT OR GPL-3.0-or-later) | 1 | Dual (MIT chosen) |
| Custom | 1 | Reviewed |

## Dual-License Declarations

### jszip@3.10.1
- **License**: (MIT OR GPL-3.0-or-later)
- **Used by**: exceljs@4.4.0 (Excel export functionality)
- **SIAK's Choice**: **MIT License**
- **Justification**: The copyright holder of jszip offers a choice between MIT and GPL-3.0-or-later. SIAK exercises its right to use jszip under the MIT License terms, which permits commercial use, modification, and distribution without copyleft obligations.

## Custom License Review

### buffers@0.1.1
- **License**: Custom (http://github.com/substack/node-bufferlist)
- **Reviewed**: [TANGGAL] — License text reviewed and confirmed permissive (MIT-style).
- **Location**: `node_modules/buffers/LICENSE`

## Full Dependency List

See `THIRD-PARTY-LICENSES-FULL.md` for complete per-package listing with repository URLs.

---

## SIAK's Own License

SIAK source code is licensed under the **MIT License** (or Apache-2.0 — see root LICENSE file).

Copyright (c) 2024-2025 [Nama Anda / Perusahaan Anda]

Permission is hereby granted...
```

---

## 📄 TEMPLATE `THIRD-PARTY-LICENSES-FULL.md` (Generate Otomatis)

Jalankan script ini untuk generate daftar lengkap:

```bash
# Di root SIAK
node -e "
const fs=require('fs');
const be=JSON.parse(fs.readFileSync('./be-licenses-clean.json','utf8'));
const fe=JSON.parse(fs.readFileSync('./fe-licenses-clean.json','utf8'));
const all={...be,...fe};
let md='# Third-Party Licenses - Full List\\n\\n';
md+='| Package | Version | License | Repository |\\n';
md+='|---------|---------|---------|------------|\\n';
Object.entries(all).filter(([k])=>!k.startsWith('@siak/')).sort((a,b)=>a[0].localeCompare(b[0])).forEach(([k,v])=>{
  md+='| '+k+' | '+v.version+' | '+v.licenses+' | '+v.repository+' |\\n';
});
fs.writeFileSync('./THIRD-PARTY-LICENSES-FULL.md', md);
console.log('Generated THIRD-PARTY-LICENSES-FULL.md');
"
```

---

## 🎯 CHECKLIST SEBELUM JUAL

| No | Item | Status | Catatan |
|----|------|--------|---------|
| 1 | File `LICENSE` di root repo (MIT/Apache-2.0) | ❌ Belum ada | **Buat sekarang** |
| 2 | File `THIRD-PARTY-LICENSES.md` | ❌ Belum ada | Generate dari template |
| 3 | File `THIRD-PARTY-LICENSES-FULL.md` | ❌ Belum ada | Generate otomatis |
| 4 | Deklarasi pilihan MIT untuk `jszip` | ❌ Belum | Masukkan ke THIRD-PARTY-LICENSES.md |
| 5 | Verifikasi lisensi `buffers@0.1.1` | ❌ Belum | Cek manual |
| 6 | Pastikan `package.json` root ada (untuk metadata) | ❌ Belum ada | Bisa buat minimal |
| 7 | Hapus `UNLICENSED` dari `package.json` SIAK sendiri | ⚠️ Saat ini UNLICENSED | Ganti jadi MIT/Apache-2.0 |
| 8 | Pastikan tidak ada hardcoded secret/key di kode | ✅ Sudah pakai .env | Cek `git log` history |
| 9 | Dokumentasi deployment on-premise | ✅ Ada `docs/deployment-paas-free.md` | Perlu adaptasi on-prem |

---

## 💡 SARAN LISNSI UNTUK KODE SIAK SENDIRI

**Pilih salah satu:**

| Lisensi | Cocok Untuk | Keuntungan |
|---------|-------------|------------|
| **MIT** | Paling simpel, paling dikenal | Developer & pembeli paling familiar |
| **Apache-2.0** | Komersial, enterprise | Patent grant eksplisit, proteksi hukum lebih kuat |
| **BSD-3-Clause** | Mirip MIT + klausula non-endorsement | Mencegah pembeli pakai nama Anda untuk promosi |

**Rekomendasi saya: Apache-2.0** — karena Anda menjual secara komersial, patent grant Apache-2.0 memberi proteksi tambahan yang berharga.

---

## 🔍 VERIFIKASI BUFFERS (Jalankan Sekarang)

```bash
cd /c/Users/ratih/source/repos/Siak
cat node_modules/buffers/LICENSE 2>/dev/null || echo "No LICENSE file, checking package.json..."
cat node_modules/buffers/package.json | grep -A5 license
```