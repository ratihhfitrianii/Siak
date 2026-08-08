import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DosenDashboardPage } from './DosenDashboardPage';

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: { id: 4, username: 'dosen.TI1' }, booting: false, logout: vi.fn() }),
}));

function jsonResponse(payload: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  } as Response;
}

/**
 * Dashboard Dosen (T3.7) — container tab; verifikasi navigasi antar 6 tab.
 * Fetch dimock per-URL dengan payload valid sesuai kontrak API nyata agar
 * setiap subkomponen (fetch saat mount) merender tanpa error.
 */
describe('DosenDashboardPage (T3.7)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    fetchMock.mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes('/krs/period')) {
        return jsonResponse({
          data: {
            id: 1,
            semesterId: 1,
            semesterCode: '2025/2026-1',
            name: 'Ganjil 2025/2026',
            startDate: null,
            endDate: null,
            isRevision: false,
            status: 'open',
          },
        });
      }
      if (u.includes('/schedule/availability')) {
        return jsonResponse({
          data: {
            date: '2026-08-10',
            dayOfWeek: 1,
            busySlots: [],
            availableSlots: [],
            isAvailable: true,
          },
        });
      }
      if (u.includes('/attendance/sessions')) {
        return jsonResponse({ data: [] });
      }
      if (u.includes('/dosen/my-classes')) {
        return jsonResponse({ data: { items: [] } });
      }
      if (u.includes('/dosen/lecturers')) {
        return jsonResponse({ data: { items: [] } });
      }
      if (u.includes('/guidance/mentees') || u.includes('/guidance/sessions')) {
        return jsonResponse({ data: [] });
      }
      if (u.includes('/substitute')) {
        return jsonResponse({ data: [] });
      }
      if (u.includes('/dosen/courses/available')) {
        return jsonResponse({ data: { items: [] } });
      }
      return jsonResponse({ data: { items: [] } });
    });
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

  it('klik tab Jadwal → render DosenSchedule (view availability)', async () => {
    const user = userEvent.setup();
    render(<DosenDashboardPage />);
    await user.click(screen.getByRole('button', { name: 'Jadwal' }));
    expect(screen.getByText('Jadwal Mengajar')).toBeInTheDocument();
  });

  it('klik tab Absensi → render DosenAttendance', async () => {
    const user = userEvent.setup();
    render(<DosenDashboardPage />);
    await user.click(screen.getByRole('button', { name: 'Absensi' }));
    expect(screen.getByText('Absensi Mengajar')).toBeInTheDocument();
  });

  it('klik tab Bimbingan → render DosenGuidance', async () => {
    const user = userEvent.setup();
    render(<DosenDashboardPage />);
    await user.click(screen.getByRole('button', { name: 'Bimbingan' }));
    expect(screen.getByText('Bimbingan Mahasiswa Binaan')).toBeInTheDocument();
  });

  it('klik tab Substitute → render DosenSubstitute', async () => {
    const user = userEvent.setup();
    render(<DosenDashboardPage />);
    await user.click(screen.getByRole('button', { name: 'Substitute' }));
    expect(screen.getByText('Substitute Teaching')).toBeInTheDocument();
  });

  it('klik tab Nilai → render DosenGrades', async () => {
    const user = userEvent.setup();
    render(<DosenDashboardPage />);
    await user.click(screen.getByRole('button', { name: 'Nilai' }));
    expect(screen.getByText('Input Nilai')).toBeInTheDocument();
  });
});
