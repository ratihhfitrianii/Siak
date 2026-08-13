/**
 * One-off: reset password akun admin sistem (admin@siak.local) — produksi.
 * - Password baru dari env NEW_ADMIN_PASSWORD (tidak di-hardcode).
 * - Set must_change_password=true → dipaksa ganti saat login pertama.
 * - Reset failed_login_attempts & locked_until (antisipasi akun terkunci).
 *
 * Usage: NEW_ADMIN_PASSWORD=<pw> DATABASE_URL=<url> npx tsx scripts/reset-admin-password.ts
 */
import 'dotenv/config';
import bcrypt from 'bcrypt';
import { pgPool } from '../src/lib/pg';

const EMAIL = 'admin@siak.local';

async function main() {
  const newPassword = process.env.NEW_ADMIN_PASSWORD;
  if (!newPassword || newPassword.length < 12) {
    console.error('Set NEW_ADMIN_PASSWORD (min 12 karakter) dulu.');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  const res = await pgPool.query(
    `UPDATE users
        SET password_hash = $1,
            must_change_password = true,
            failed_login_attempts = 0,
            locked_until = NULL,
            updated_at = now()
      WHERE email = $2
        AND role_id = (SELECT id FROM roles WHERE code = 'admin_sistem')
      RETURNING id, email`,
    [passwordHash, EMAIL],
  );

  if (res.rowCount === 0) {
    console.error(`Tidak ada user admin_sistem dengan email ${EMAIL}.`);
    await pgPool.end();
    process.exit(1);
  }

  console.log(
    `OK: password admin (${EMAIL}) di-reset; must_change_password=true; kunci login dihapus.`,
  );
  await pgPool.end();
}

main().catch((e) => {
  console.error('Gagal:', e.message);
  process.exit(1);
});
