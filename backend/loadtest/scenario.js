// Load Test k6 — T1.14 (NF-06, AC-01) — simulasi puncak hari pertama KRS.
//
// Mode:
//   capacity (default): ukur kapasitas murni — 1k → 3k → 5k VU, flow KRS lengkap
//     (login → period → available-classes → draft → submit). Semua VU dari IP sama
//     → waiting room tak terpicu (1 userKey), mengukur throughput backend maksimal.
//   queue: buktikan waiting room bekerja E2E — threshold kecil (env
//     WAITING_ROOM_THRESHOLD=50) + X-Forwarded-For unik per VU → sebagian 429
//     RATE_LIMITED dengan token; /waiting-room/status tetap 200 (exempt).
//
// Usage (docker):
//   docker run --rm -i -v <abs>/backend/loadtest:/scripts grafana/k6 run \
//     /scripts/scenario.js -e MODE=capacity -e BASE_URL=http://localhost:3000
import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

const MODE = (__ENV.MODE || 'capacity').toLowerCase();
const BASE = __ENV.BASE_URL || 'http://localhost:3000';
const CLASSES = new SharedArray('classes', () => [JSON.parse(open('./classes.json'))]);
const META = CLASSES[0];
const PASSWORD = META.password;
const PRODI_KEYS = Object.keys(META.prodi); // ['1','2',...]

// email VU: lt-<6 digit>@siak.local (seed.ts). __VU mulai dari 1.
function emailOf(vu) {
  return `lt-${String(vu).padStart(6, '0')}@siak.local`;
}
function prodiOf(vu) {
  return PRODI_KEYS[(vu - 1) % PRODI_KEYS.length];
}
// 3 classIds deterministik dari pool prodi VU (round-robin agar kuota merata).
function pickClassIds(prodiKey, vu) {
  const pool = META.prodi[prodiKey];
  const ids = [];
  for (let i = 0; i < 3; i++) {
    ids.push(pool[(vu * 3 + i) % pool.length]);
  }
  return ids;
}
// ── Skenario ─────────────────────────────────────────────────────────────────
export const options =
  MODE === 'queue'
    ? {
        scenarios: {
          queue: {
            executor: 'ramping-vus',
            startVUs: 1,
            stages: [
              { duration: '30s', target: 200 }, // 200 VU × IP unik > threshold 50
              { duration: '30s', target: 200 },
              { duration: '15s', target: 0 },
            ],
          },
        },
        thresholds: {
          http_req_failed: ['rate<0.10'], // 429 bukan failure k6; hanya error server
        },
      }
    : {
        scenarios: {
          capacity: {
            executor: 'ramping-vus',
            startVUs: 1,
            stages: [
              { duration: '45s', target: 1000 }, // 1k
              { duration: '60s', target: 1000 },
              { duration: '60s', target: 3000 }, // 3k
              { duration: '90s', target: 5000 }, // 5k
              { duration: '120s', target: 5000 }, // steady 5k
              { duration: '30s', target: 0 },
            ],
          },
        },
        thresholds: {
          http_req_duration: ['p(99)<2000'], // DoD: p99 < 2s
          http_req_failed: ['rate<0.01'], // DoD: error < 1%
          http_req_duration: ['p(95)<1200'], // indikator kenyamanan
        },
      };

// ── Queue mode: buktikan gate 429 + token + status exempt ─────────────────────
export function queue() {
  const vu = __VU;
  const xff = `10.200.0.${(vu % 254) + 1}`;
  const params = { headers: { 'x-forwarded-for': xff } };

  const login = http.post(
    `${BASE}/api/v1/auth/login`,
    JSON.stringify({ email: emailOf(vu), password: PASSWORD }),
    { headers: { 'Content-Type': 'application/json', 'x-forwarded-for': xff } },
  );
  const queued = login.status === 429;
  check(login, {
    'login 200 atau 429 (gate)': (r) => r.status === 200 || r.status === 429,
  });
  if (queued) {
    const body = login.json();
    check(login, {
      '429 code RATE_LIMITED': (r) => body.code === 'RATE_LIMITED',
      '429 membawa token antrean': (r) => !!body.data && !!body.data.token,
    });
  }
  // Status endpoint TIDAK boleh digate (fallback polling K-09).
  const status = http.get(`${BASE}/api/v1/waiting-room/status?token=abc`, params);
  check(status, {
    'waiting-room/status respons (exempt gate)': (r) => r.status === 200 || r.status === 400,
  });
  sleep(1);
}

// ── Capacity mode: flow KRS lengkap, submit sekali per VU ─────────────────────
// k6: tiap VU punya instance modul sendiri → closure `cachedToken` per VU.
let cachedToken = '';

export function capacity() {
  const vu = __VU;
  const prodiKey = prodiOf(vu);
  const classIds = pickClassIds(prodiKey, vu);
  const h = cachedToken ? { Authorization: `Bearer ${cachedToken}` } : null;

  // Iterasi pertama VU: login + flow KRS penuh (draft + submit sekali).
  if (!h) {
    const login = http.post(
      `${BASE}/api/v1/auth/login`,
      JSON.stringify({ email: emailOf(vu), password: PASSWORD }),
      { headers: { 'Content-Type': 'application/json' } },
    );
    check(login, { 'login 200': (r) => r.status === 200 });
    if (login.status !== 200) {
      return; // gagal login → VU berhenti (tidak menambah noise)
    }
    cachedToken = login.json('data.accessToken');
    const authH = { Authorization: `Bearer ${cachedToken}`, 'Content-Type': 'application/json' };

    const period = http.get(`${BASE}/api/v1/krs/period`, { headers: authH });
    check(period, { 'GET /krs/period 200': (r) => r.status === 200 });

    const payload = JSON.stringify({ classIds });
    const draft = http.post(`${BASE}/api/v1/krs/draft`, payload, { headers: authH });
    check(draft, {
      'POST /krs/draft 200': (r) => r.status === 200,
      'draft tidak CLASS_FULL': (r) => r.status !== 409 || r.json('code') !== 'CLASS_FULL',
    });

    const submit = http.post(`${BASE}/api/v1/krs/submit`, payload, { headers: authH });
    check(submit, {
      'POST /krs/submit 200': (r) => r.status === 200,
      'submit tidak CLASS_FULL': (r) => r.status !== 409 || r.json('code') !== 'CLASS_FULL',
    });
    sleep(0.5 + Math.random());
    return;
  }

  // Iterasi berikutnya: beban read kontinu (periode + kelas tersedia, cache Redis 30s).
  const period = http.get(`${BASE}/api/v1/krs/period`, { headers: h });
  check(period, { 'read: GET /krs/period 200': (r) => r.status === 200 });
  const classes = http.get(`${BASE}/api/v1/krs/available-classes`, { headers: h });
  check(classes, { 'read: GET /krs/available-classes 200': (r) => r.status === 200 });
  sleep(0.5 + Math.random());
}

export default MODE === 'queue' ? queue : capacity;
