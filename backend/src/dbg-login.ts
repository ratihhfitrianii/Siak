process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgres://siak:siak_dev_password@localhost:5433/siak';
process.env.REDIS_URL ??= 'redis://localhost:6380';
process.env.JWT_SECRET ??= 'test-secret-min-32-chars-long-for-hs256-alg';
import { createApp } from './app';
import { pgPool } from './lib/pg';
import request from 'supertest';
async function main() {
  const app = createApp();
  const users = await pgPool.query(
    "SELECT u.id, u.email, r.code FROM users u JOIN roles r ON r.id=u.role_id WHERE u.is_active AND r.code IN ('admin_sistem','admin_akademik','dosen','mahasiswa') ORDER BY u.id",
  );
  const out: string[] = [];
  for (const u of users.rows) {
    const pw = u.code.startsWith('admin')
      ? 'Admin123!'
      : u.code === 'dosen'
        ? 'Dosen123!'
        : 'Mhs123!';
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: u.email, password: pw });
    out.push(
      `${u.id} ${u.code} ${u.email} -> ${login.status} ${JSON.stringify(login.body).slice(0, 160)}`,
    );
  }
  console.log(out.join('\n'));
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
