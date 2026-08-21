import { expect, test } from '@playwright/test';

/**
 * T5.7 — E2E critical path: login (AC-08).
 * User di-seed oleh backend/scripts/seed-e2e.ts.
 */
test.describe('Login — critical path (T5.7)', () => {
  test('login sukses mahasiswa → dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('NIM / NIK / Email', { exact: true }).fill('E2E0001');
    await page.getByLabel('Password', { exact: true }).fill('E2ePass123!');
    await page.getByRole('button', { name: 'Masuk' }).click();

    await expect(page.getByText(/Selamat datang, E2E Mahasiswa/)).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/$/);
  });

  test('kredensial salah → pesan error inline', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('NIM / NIK / Email', { exact: true }).fill('E2E0001');
    await page.getByLabel('Password', { exact: true }).fill('Salah123!');
    await page.getByRole('button', { name: 'Masuk' }).click();

    await expect(page.getByRole('alert')).toContainText(/NIM\/NIK atau password salah/);
  });

  test('sesi bertahan setelah reload (session recovery)', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('NIM / NIK / Email', { exact: true }).fill('E2EDS001');
    await page.getByLabel('Password', { exact: true }).fill('E2ePass123!');
    await page.getByRole('button', { name: 'Masuk' }).click();
    // Header "Dashboard Dosen" dihapus — pakai kartu ringkasan sebagai penanda login sukses
    await expect(page.getByText('Total Pertemuan')).toBeVisible({ timeout: 10_000 });

    await page.reload();
    await expect(page.getByText('Total Pertemuan')).toBeVisible({ timeout: 10_000 });
  });

  test('logout → kembali ke halaman login', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('NIM / NIK / Email', { exact: true }).fill('E2E0001');
    await page.getByLabel('Password', { exact: true }).fill('E2ePass123!');
    await page.getByRole('button', { name: 'Masuk' }).click();
    await expect(page.getByText(/Selamat datang/)).toBeVisible({ timeout: 10_000 });

    // Buka menu dropdown terlebih dahulu
    await page.getByRole('button', { name: 'Menu pengguna' }).click();
    await page.getByRole('menuitem', { name: 'Keluar' }).click();
    await expect(page.getByRole('heading', { name: /Masuk ke Siak/ })).toBeVisible();
  });

  test('rute terproteksi tanpa login → redirect ke /login', async ({ page }) => {
    await page.goto('/krs');
    await expect(page).toHaveURL(/login/);
    await expect(page.getByRole('heading', { name: /Masuk ke Siak/ })).toBeVisible();
  });
});
