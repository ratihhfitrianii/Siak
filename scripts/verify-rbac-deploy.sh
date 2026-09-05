#!/usr/bin/env bash
# Verifikasi setelah deploy ulang Render: cek kolom users.admin_faculty_code aktif di prod.
# Jalankan: bash scripts/verify-rbac-deploy.sh
set -euo pipefail

BASE="https://siak-backend.onrender.com/api/v1"
echo "1) Login akademik@siak.local..."
TOKEN=$(curl -s -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"identifier":"akademik@siak.local","password":"Admin123!"}' \
  | python -c "import sys,json;print(json.load(sys.stdin)['data']['accessToken'])")
echo "   login OK (token didapat)"

echo "2) GET /users/me dengan token..."
HTTP=$(curl -s -o /tmp/me.json -w "%{http_code}" "$BASE/users/me" -H "Authorization: Bearer $TOKEN")
echo "   HTTP $HTTP"
if [ "$HTTP" = "200" ]; then
  python -c "import json;d=json.load(open('/tmp/me.json'))['data'];print('   role:',d.get('role'),'| adminFacultyCode:',d.get('adminFacultyCode'))"
  echo "   ✅ Kolom users.admin_faculty_code AKTIF di prod."
else
  cat /tmp/me.json | head -c 300
  echo
  echo "   ❌ Masih 401 — kolom admin_faculty_code BELUM ada di DB prod."
fi
