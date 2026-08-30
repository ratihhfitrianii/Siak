// Test setup - configure test database
process.env.NODE_ENV = 'test';
// Gunakan env PG* bila tersedia (CI: PGHOST/PGPORT/Gunakan PGPASSWORD dari workflow),
// fallback ke Docker lokal (port 5433) bila tidak ada (untuk pengembangan lokal).
process.env.DATABASE_URL ??= `postgres://${process.env.PGUSER || 'siak'}:${process.env.PGPASSWORD || 'siak_dev_password'}@${process.env.PGHOST || 'localhost'}:${process.env.PGPORT || 5433}/${process.env.PGDATABASE || 'siak'}`;
process.env.REDIS_URL = 'redis://localhost:6380';
process.env.JWT_SECRET = 'test-secret-key-for-testing-only-32chars!!';
process.env.JWT_ACCESS_EXPIRY = '15m';
process.env.JWT_REFRESH_EXPIRY = '7d';
