import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DosenDashboardPage } from './DosenDashboardPage';

/**
 * Dashboard Dosen (T3.7) — container tab; verifikasi navigasi antar 6 tab
 * dan bahwa komponen aktif dirender. Fetch dimock agar subkomponen
 * (yang fetch saat mount/berinteraksi) tidak menyentuh jaringan.
 */
describe('DosenDashboardPage (T3.7)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { items: [] } }),
    } as Response);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('render — header + 6 tab + tab pertama aktif (Pilih MK)', () => {
    render(<DosenDashboardPage />);
    expect(screen.getByText('Dashboard Dosen')).toBeInTheDocument();
    for (const label of ['Pilih MK', 'Jadwal', 'Absensi', 'Bimbingan', 'Substitute', 'Nilai']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    // Tab pertama aktif → konten Pilih MK tampil
    expect(screen.getByText('Pilih Mata Kuliah')).toBeInTheDocument();
  });

  it('klik tab Jadwal → render DosenSchedule', async () => {
    const user = userEvent.setup();
    render(<DosenDashboardPage />);
    await user.click(screen.getByRole('button', { name: 'Jadwal' }));
    expect(screen.getByText('Input Jadwal Mengajar')).toBeInTheDocument();
  });

  it('klik tab Absensi → render DosenAttendance', async () => {
    const user = userEvent.setup();
    render(<DosenDashboardPage />);
    await user.click(screen.getByRole('button', { name: 'Absensi' }));
    expect(screen.getByText('Input Absensi')).toBeInTheDocument();
  });

  it('klik tab Bimbingan → render DosenGuidance', async () => {
    const user = userEvent.setup();
    render(<DosenDashboardPage />);
    await user.click(screen.getByRole('button', { name: 'Bimbingan' }));
    expect(screen.getByText('Input Bimbingan')).toBeInTheDocument();
  });

  it('klik tab Substitute → render DosenSubstitute', async () => {
    const user = userEvent.setup();
    render(<DosenDashboardPage />);
    await user.click(screen.getByRole('button', { name: 'Substitute' }));
    expect(screen.getByText('Input Substitute Dosen')).toBeInTheDocument();
  });

  it('klik tab Nilai → render DosenGrades', async () => {
    const user = userEvent.setup();
    render(<DosenDashboardPage />);
    await user.click(screen.getByRole('button', { name: 'Nilai' }));
    expect(screen.getByText('Input Nilai')).toBeInTheDocument();
  });
});
