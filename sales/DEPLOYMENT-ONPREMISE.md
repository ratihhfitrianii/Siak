# DEPLOYMENT ON-PREMISE — SIAK Sistem Informasi Akademik

**Versi:** 1.0 | **Target Pembaca:** Admin Sistem / Tim IT Kampus

Dokumen ini adalah panduan lengkap untuk menginstal SIAK di server sendiri (on-premise) atau VPS/cloud. Seluruh stack berjalan dengan **Docker Compose** — cepat, konsisten, dan mudah dipelihara.

---

## 1. Arsitektur Deployment

```
                        ┌──────────────────────────────┐
   Browser Pengguna ──► │  Nginx (reverse proxy + SSL) │
   (HTTPS)              │  • serve frontend (static)   │
                        │  • proxy /api → backend       │
                        │  • proxy /socket.io → backend │
                        │  • rate limiting             │
                        └──────────────┬───────────────┘
                                       │
                ┌──────────────────────┼──────────────────────┐
                │                      │                      │
        ┌───────▼───────┐      ┌───────▼───────┐      ┌───────▼───────┐
        │   frontend    │      │   backend     │      │    migrate    │
        │  Nginx static │      │ Node.js:3000  │      │  (one-shot)   │
        │   (SPA build) │      │ Express+TS    │      │  migrasi DB   │
        └───────────────┘      └───┬───────┬───┘      └───────────────┘
                                   │       │
                           ┌───────▼───┐ ┌─▼────────┐
                           │ PostgreSQL│ │  Redis   │
                           │    16     │ │    7     │
                           └───────────┘ └──────────┘
```

| Container | Peran | Port Internal |
|-----------|-------|---------------|
| `nginx` | Reverse proxy, SSL, serve frontend, rate limit | 80/443 (eksternal) |
| `frontend` | Static build React SPA (Nginx) | 80 |
| `backend` | API Node.js (Express) | 3000 |
| `migrate` | Menjalankan migrasi DB (one-shot, lalu exit) | — |
| `postgres` | Database PostgreSQL 16 | 5432 |
| `redis` | Cache, session, rate limit, waiting room | 6379 |

---

## 2. Spesifikasi Server Minimum

### Rekomendasi (5.000+ mahasiswa)

| Resource | Minimum | Rekomendasi |
|----------|---------|-------------|
| **CPU** | 2 core | 4 core |
| **RAM** | 4 GB | 8 GB |
| **Storage** | 40 GB SSD | 100 GB SSD |
| **OS** | Ubuntu 22.04 LTS+ | Ubuntu 24.04 LTS |
| **Docker** | 24+ | 26+ |
| **Docker Compose** | v2 | v2 |
| **Koneksi** | 50 Mbps | 100 Mbps upstream |
| **Domain** | siak.kampus.ac.id | + wildcard SSL |

> Estimasi kapasitas: 1 vCPU ≈ 2.000–3.000 user aktif; beban puncak KRS massal ditangani waiting room + rate limiting.

---

## 3. Prasyarat

### 3.1 Install Docker & Docker Compose

```bash
# Ubuntu/Debian
sudo apt update && sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update && sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo systemctl enable --now docker
```

### 3.2 Domain & DNS
- Siapkan domain, misal `siak.kampus.ac.id`
- Arahkan A record ke IP server
- Siapkan email admin untuk Let's Encrypt SSL

---

## 4. Struktur Direktori

```
/opt/siak/
├── docker-compose.prod.yml   # dari paket: infra/docker-compose.prod.yml
├── .env.prod                 # environment production (RAHASIA — jangan commit)
├── nginx.prod.conf           # dari paket: infra/nginx.prod.conf
├── certs/                    # SSL certificate & key
│   ├── fullchain.pem
│   └── privkey.pem
├── backend/                  # source backend + Dockerfile
└── frontend/                 # source frontend + Dockerfile + nginx.conf
```

---

## 5. Langkah Instalasi

### 5.1 Salin file dari paket

```bash
sudo mkdir -p /opt/siak/certs
cd /opt/siak
# Salin dari source package:
cp /path/ke/paket-siak/infra/docker-compose.prod.yml .
cp /path/ke/paket-siak/infra/nginx.prod.conf .
cp -r /path/ke/paket-siak/backend .
cp -r /path/ke/paket-siak/frontend .
```

### 5.2 Buat file environment

```bash
# /opt/siak/.env.prod — isi dengan nilai asli!
cat > .env.prod << 'EOF'
# ===== SIAK Production Environment =====
NODE_ENV=production

# PostgreSQL
POSTGRES_DB=siak
POSTGRES_USER=siak
POSTGRES_PASSWORD=GANTI_PASSWORD_STRONG_32_CHAR

# Redis
# REDIS_PASSWORD=opsional

# Auth — WAJIB 64 karakter acak
JWT_SECRET=GANTI_DENGAN_64_KARAKTER_ACAK_MINIMAL

# Expiry
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
SESSION_TIMEOUT_MS=900000

# Rate limit & waiting room
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=100
WAITING_ROOM_THRESHOLD=2000

# CORS — origin frontend production
CORS_ORIGIN=https://siak.kampus.ac.id

# Notifikasi
NOTIFICATION_PROVIDER=inapp
# SMTP_HOST=mail.kampus.ac.id
# SMTP_PORT=587
# SMTP_USER=no-reply@kampus.ac.id
# SMTP_PASS=GANTI

# Koneksi DB (compose membentuk URL otomatis dari POSTGRES_*)
DATABASE_POOL_MAX=200

EOF
sudo chmod 600 .env.prod
```

Generate JWT secret aman:
```bash
openssl rand -hex 64
```

### 5.3 Pasang SSL Certificate

**Opsi A — Let's Encrypt (rekomendasi):**
```bash
sudo apt install -y certbot
sudo certbot certonly --standalone -d siak.kampus.ac.id --email admin@kampus.ac.id --agree-tos
sudo cp /etc/letsencrypt/live/siak.kampus.ac.id/fullchain.pem certs/
sudo cp /etc/letsencrypt/live/siak.kampus.ac.id/privkey.pem certs/
```

**Opsi B — Self-signed (testing saja):**
```bash
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout certs/privkey.pem -out certs/fullchain.pem \
  -subj "/CN=siak.kampus.ac.id"
```

### 5.4 Siapkan struktur & build

```bash
# Pastikan layout sesuai yang diharapkan compose:
# (backend/ dan frontend/ berada di level yang sama dengan docker-compose.prod.yml)
cd /opt/siak
sudo docker compose -f docker-compose.prod.yml --env-file .env.prod config   # validasi
```

### 5.5 Jalankan stack

```bash
sudo docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

Proses:
1. Container `postgres` & `redis` start → healthcheck
2. Container `migrate` menjalankan semua migrasi DB (30 file SQL) → exit
3. Container `backend` start (tunggu DB ready)
4. Container `frontend` build static → start
5. Container `nginx` start (SSL termination)

### 5.6 Verifikasi

```bash
# Cek semua container sehat
sudo docker compose -f docker-compose.prod.yml ps

# Cek health endpoint
curl -s https://siak.kampus.ac.id/api/v1/health
# → {"status":"ok","timestamp":"..."}

# Cek frontend
curl -sI https://siak.kampus.ac.id/ | head -5
# → HTTP/2 200

# Login pertama (admin)
curl -s -X POST https://siak.kampus.ac.id/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"identifier":"admin@siak.local","password":"<password-awal>"}'
```

> **PENTING:** Ganti password admin default segera setelah login pertama (password policy mewajibkan perubahan saat first login).

---

## 6. Operasional Harian

### 6.1 Melihat log
```bash
sudo docker compose -f docker-compose.prod.yml logs -f backend
sudo docker compose -f docker-compose.prod.yml logs -f nginx
```

### 6.2 Restart service
```bash
sudo docker compose -f docker-compose.prod.yml restart backend
```

### 6.3 Backup database (WAJIB terjadwal)

```bash
# Manual
sudo docker compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U siak -d siak | gzip > backup-siak-$(date +%Y%m%d).sql.gz

# Cron harian (02:00)
sudo crontab -e
# 0 2 * * * cd /opt/siak && docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U siak -d siak | gzip > /opt/backups/siak-$(date +\%Y\%m\%d).sql.gz --retries 5
```

### 6.4 Restore database
```bash
gunzip -c backup-siak-20260101.sql.gz | sudo docker compose -f docker-compose.prod.yml exec -T postgres psql -U siak -d siak
```

### 6.5 Update aplikasi (versi baru)
```bash
cd /opt/siak
# Ganti source code backend/ & frontend/ dengan versi baru
sudo docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

### 6.6 Perpanjang SSL (Let's Encrypt — setiap 90 hari)
```bash
sudo certbot renew --standalone --pre-hook "sudo docker compose -f docker-compose.prod.yml stop nginx" --post-hook "sudo docker compose -f docker-compose.prod.yml start nginx"
# atau atur cron:
# 0 3 1 * * certbot renew --quiet --deploy-hook "cp /etc/letsencrypt/live/siak.kampus.ac.id/fullchain.pem /opt/siak/certs/ && cp /etc/letsencrypt/live/siak.kampus.ac.id/privkey.pem /opt/siak/certs/ && docker compose -f /opt/siak/docker-compose.prod.yml restart nginx"
```

---

## 7. Manajemen Pengguna Awal (Seed)

Akun yang dibuat otomatis saat migrasi/seed:

| Role | Identifier | Password Awal |
|------|-----------|---------------|
| Admin Sistem | `admin@siak.local` | [Diatur saat instalasi] |
| Mahasiswa Test | `test.mahasiswa@siak.local` / NIM | [Diatur saat instalasi] |
| Dosen Test | `dosen.TI1@siak.local` | [Diatur saat instalasi] |

> **WAJIB** ganti semua password default segera setelah instalasi. Akun test (e2e) harus dihapus/dinonaktifkan di produksi.

---

## 8. Troubleshooting Umum

| Gejala | Kemungkinan Penyebab | Solusi |
|--------|---------------------|--------|
| `ERR_CONNECTION_REFUSED` | Nginx belum start / port 80-443 terblokir | `docker compose ps`; cek firewall `ufw allow 80,443/tcp` |
| API 502 Bad Gateway | Backend belum ready / crash | `docker compose logs backend` |
| Login gagal | DB belum migrasi / env salah | Cek log `migrate`; pastikan `migrate` exit 0 |
| Health check gagal | `DATABASE_URL` salah | Cek `.env.prod`; pastikan `POSTGRES_PASSWORD` cocok |
| WebSocket tidak connect | Nginx proxy websocket | Pastikan `location /socket.io/` dengan header Upgrade ada (sudah di nginx.prod.conf) |
| Upload foto besar gagal (413) | Body limit | Sudah di-set 5mb di app.ts; pastikan Nginx `client_max_body_size 10m` |
| Waiting room aktif terus | `WAITING_ROOM_THRESHOLD` terlalu rendah | Naikkan ke 2000+ atau sesuaikan kapasitas server |

---

## 9. Checklist Go-Live

- [ ] Semua container `up` & healthy
- [ ] `curl https://domain/api/v1/health` → `{"status":"ok"}`
- [ ] Frontend dapat diakses via HTTPS, tidak ada mixed-content warning
- [ ] Login admin berhasil; password default diganti
- [ ] Semua akun test/e2e dinonaktifkan/dihapus
- [ ] Migrasi data master selesai (mahasiswa, dosen, MK, kurikulum)
- [ ] Backup cron terpasang & teruji restore
- [ ] SSL certificate valid (bukan self-signed)
- [ ] UAT dengan skenario utama: KRS, nilai, pembayaran, absensi
- [ ] Tim admin & staf terlatih
- [ ] Monitoring: akses log backend & nginx

---

## 10. Referensi Konfigurasi

### Environment Variables Backend

| Variable | Wajib? | Default | Deskripsi |
|----------|--------|---------|-----------|
| `NODE_ENV` | Ya | production | Mode produksi |
| `PORT` | — | 3000 | Port backend (internal) |
| `DATABASE_URL` | Ya | — | Koneksi PostgreSQL (compose: dari POSTGRES_*) |
| `REDIS_URL` | Ya | — | Koneksi Redis |
| `JWT_SECRET` | Ya | — | Secret JWT (64 char acak) |
| `JWT_ACCESS_EXPIRY` | — | 15m | Umur access token |
| `JWT_REFRESH_EXPIRY` | — | 7d | Umur refresh token |
| `SESSION_TIMEOUT_MS` | — | 900000 | Timeout sesi (15 menit) |
| `RATE_LIMIT_WINDOW_MS` | — | 60000 | Window rate limiting |
| `RATE_LIMIT_MAX` | — | 100 | Max request per window |
| `WAITING_ROOM_THRESHOLD` | — | 2000 | Ambang antrian waiting room |
| `CORS_ORIGIN` | Ya | — | Origin frontend (HTTPS) |
| `NOTIFICATION_PROVIDER` | — | inapp | inapp atau email |
| `SMTP_HOST/PORT/USER/PASS` | jika email | — | Konfigurasi SMTP |
| `DATABASE_POOL_MAX` | — | 200 | Max pool koneksi DB |

### Port yang Dibuka (Firewall)
| Port | Tujuan |
|------|--------|
| 80 | HTTP → redirect HTTPS |
| 443 | HTTPS |
| 5432 | **JANGAN dibuka publik** (internal Docker network) |
| 6379 | **JANGAN dibuka publik** (internal Docker network) |

---

*Dokumen ini merupakan bagian dari paket delivery SIAK. Untuk pertanyaan teknis selama implementasi, hubungi vendor.*