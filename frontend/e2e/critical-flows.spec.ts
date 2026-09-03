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

/** Penanda dashboard mahasiswa sudah render (header sapaan dihapus dari desain dashboard). */
const DASHBOARD_READY = 'Periode Pengisian KRS';

test.describe('Critical path: bayar (T5.7)', () => {
  test('mahasiswa lihat tagihan lunas di halaman Pembayaran', async ({ page }) => {
    await login(page, MHS.identifier, MHS.pass);
    await expect(page.getByText(DASHBOARD_READY)).toBeVisible({ timeout: 10_000 });

    // "Pembayaran" adalah child dari parent dropdown "Keuangan" → expand parent dulu
    await page.getByRole('button', { name: 'Keuangan' }).click();
    await page.getByRole('link', { name: 'Pembayaran', exact: true }).click();
    await expect(page).toHaveURL(/pembayaran/);
    await expect(page.getByText('Lunas').first()).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Critical path: KRS + PDF (T5.7)', () => {
  test('mahasiswa lihat KRS approved + download PDF', async ({ page }) => {
    await login(page, MHS.identifier, MHS.pass);
    await expect(page.getByText(DASHBOARD_READY)).toBeVisible({ timeout: 10_000 });

    // KRS sekarang parent dropdown → klik parent "KRS" dulu, lalu child "Pemrograman KRS"
    await page.getByRole('button', { name: 'KRS' }).click();
    await page.getByRole('link', { name: 'Pemrograman KRS', exact: true }).click();
    await expect(page).toHaveURL(/krs/);
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
    await expect(page.getByText(DASHBOARD_READY)).toBeVisible({ timeout: 10_000 });

    // "Kartu Hasil Studi (KHS)" child dari parent "Hasil Studi" → expand parent dulu
    await page.getByRole('button', { name: 'Hasil Studi' }).click();
    await page.getByRole('link', { name: 'Kartu Hasil Studi (KHS)', exact: true }).click();
    await expect(page).toHaveURL(/transkrip/);
    // Header semester format baru: "2024/2025 Ganjil" (TA + Ganjil/Genap)
    await expect(page.getByText(/\d{4}\/\d{4} (Ganjil|Genap)/).first()).toBeVisible({
      timeout: 10_000,
    });
    // Redesigned TranscriptPage: "Download Semua" button di header, "Download Semester" di panel kiri
    await expect(page.getByRole('button', { name: /Download Semua/i })).toBeVisible();
  });
});

test.describe('Critical path: absensi & nilai dosen (T5.7)', () => {
  test('dosen lihat kelas di menu Absensi & Nilai (sidebar — keluhan #5)', async ({ page }) => {
    await login(page, DOSEN.identifier, DOSEN.pass);
    // Header "Dashboard Dosen" dihapus — pakai kartu ringkasan sebagai penanda login sukses
    await expect(page.getByText('Total Pertemuan')).toBeVisible({ timeout: 10_000 });

    // Keluhan #5: navigasi via sidebar. Menu "Absensi" kini parent dropdown (punya anak
    // Rekap Kehadiran) → expand parent dulu, lalu klik link anak "Kelola Absensi".
    await page.getByRole('button', { name: 'Absensi' }).click();
    await page.locator('aside nav a[aria-label="Kelola Absensi"]').click();
    await expect(page).toHaveURL(/\/dosen\/absensi/);
    // /dosen/absensi = DosenAttendance (halaman "Sesi Absensi"), bukan DosenAttendanceRecap
    await expect(page.getByText('Sesi Absensi').first()).toBeVisible({ timeout: 10_000 });

    // Menu Nilai di sidebar → /dosen/nilai
    await page.locator('aside nav a[aria-label="Nilai"]').click();
    await expect(page).toHaveURL(/\/dosen\/nilai/);
    await expect(page.getByText(/Nilai|Kelas/i).first()).toBeVisible({ timeout: 10_000 });
  });
});
