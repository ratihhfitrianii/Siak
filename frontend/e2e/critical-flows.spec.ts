import { expect, test } from '@playwright/test';

/**
 * T5.7 — Critical paths selain login: bayar, KRS (+PDF), transkrip, absensi & nilai dosen.
 * Data di-seed oleh backend/scripts/seed-e2e.ts (e2e.mahasiswa / e2e.dosen, pass E2ePass123!).
 */
const MHS = { identifier: 'E2E0001', pass: 'E2ePass123!', name: 'E2E Mahasiswa' };
const DOSEN = { identifier: 'E2EDS001', pass: 'E2ePass123!', name: 'E2E Dosen' };

async function login(page: import('@playwright/test').Page, identifier: string, pass: string) {
  await page.goto('/login');
  await page.getByLabel('NIM / NIK / Email', { exact: true }).fill(identifier);
  await page.getByLabel('Password', { exact: true }).fill(pass);
  await page.getByRole('button', { name: 'Masuk' }).click();
}

test.describe('Critical path: bayar (T5.7)', () => {
  test('mahasiswa lihat tagihan lunas di halaman Pembayaran', async ({ page }) => {
    await login(page, MHS.identifier, MHS.pass);
    await expect(page.getByText(/Selamat datang, E2E Mahasiswa/)).toBeVisible({ timeout: 10_000 });

    await page.getByRole('link', { name: 'Pembayaran', exact: true }).click();
    await expect(page).toHaveURL(/\/pembayaran/);
    await expect(page.getByText('Lunas').first()).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Critical path: KRS + PDF (T5.7)', () => {
  test('mahasiswa lihat KRS approved + download PDF', async ({ page }) => {
    await login(page, MHS.identifier, MHS.pass);
    await expect(page.getByText(/Selamat datang, E2E Mahasiswa/)).toBeVisible({ timeout: 10_000 });

    await page.getByRole('link', { name: 'KRS', exact: true }).click();
    await expect(page).toHaveURL(/\/krs/);
    // Status badge "Disetujui" dari STATUS_LABEL['approved']
    await expect(page.getByText('Disetujui')).toBeVisible({ timeout: 10_000 });

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download PDF' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^krs-.*\.pdf$/);
  });
});

test.describe('Critical path: transkrip (T5.7)', () => {
  test('mahasiswa lihat transkrip (semester + nilai) + tombol download', async ({ page }) => {
    await login(page, MHS.identifier, MHS.pass);
    await expect(page.getByText(/Selamat datang, E2E Mahasiswa/)).toBeVisible({ timeout: 10_000 });

    await page.getByRole('link', { name: 'Transkrip', exact: true }).click();
    await expect(page).toHaveURL(/\/transkrip/);
    await expect(page.getByText(/Semester \d/).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /Download PDF/i })).toBeVisible();
  });
});

test.describe('Critical path: absensi & nilai dosen (T5.7)', () => {
  test('dosen lihat kelas di menu Absensi & Nilai (sidebar — keluhan #5)', async ({ page }) => {
    await login(page, DOSEN.identifier, DOSEN.pass);
    await expect(page.getByText('Dashboard Dosen')).toBeVisible({ timeout: 10_000 });

    // Keluhan #5: tab teks diganti menu sidebar ikon → navigasi via sidebar link /dosen/absensi
    // Gunakan link di sidebar (aria-label) untuk menghindari collision dengan card/link lain
    await page.locator('aside nav a[aria-label="Absensi"]').click();
    await expect(page).toHaveURL(/\/dosen\/absensi/);
    await expect(page.getByText(/Kelas|Pilih kelas/i).first()).toBeVisible({ timeout: 10_000 });

    // Menu Nilai di sidebar → /dosen/nilai
    await page.locator('aside nav a[aria-label="Nilai"]').click();
    await expect(page).toHaveURL(/\/dosen\/nilai/);
    await expect(page.getByText(/Nilai|Kelas/i).first()).toBeVisible({ timeout: 10_000 });
  });
});
