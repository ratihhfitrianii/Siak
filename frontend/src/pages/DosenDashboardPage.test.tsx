import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DosenDashboardPage } from './DosenDashboardPage';

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 4, username: 'dosen.TI1', isWali: false },
    booting: false,
    logout: vi.fn(),
  }),
}));

function jsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

/**
 * Dashboard Dosen (T3.7 + keluhan #5) — container modul; tab aktif dari URL
 * (/dosen/:tab) karena menu dipindah ke sidebar. Verifikasi render per tab.
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
      if (u.includes('/dosen/available-classes')) {
        return jsonResponse({ data: { items: [] } });
      }
      if (u.includes('/dosen/semesters')) {
        return jsonResponse({ data: { items: [] } });
      }
      if (u.includes('/attendance/sessions')) {
        return jsonResponse({ data: [] });
      }
      if (u.includes('/dosen/my-classes')) {
        return jsonResponse({ success: true, data: { items: [] } });
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

  function renderAt(path: string) {
    return render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/dosen/:tab?" element={<DosenDashboardPage />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('render — header dashboard + konten default Pilih MK (keluhan #5: tanpa tab bar teks)', () => {
    renderAt('/dosen');
    expect(screen.getByText('Dashboard Dosen')).toBeInTheDocument();
    expect(
      screen.getByText('Ringkasan aktivitas mengajar: kelas, jadwal, absensi, dan bimbingan'),
    ).toBeInTheDocument();
    // Tab teks horizontal TIDAK ada lagi (menu pindah ke sidebar)
    expect(screen.queryByRole('button', { name: 'Jadwal' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nilai' })).not.toBeInTheDocument();
    // Konten dashboard: kartu ringkasan + aksi cepat
    expect(screen.getByText('Kelas Diampu')).toBeInTheDocument();
    expect(screen.getByText('Total Pertemuan')).toBeInTheDocument();
    expect(screen.getByText('Pertemuan Selesai')).toBeInTheDocument();
    expect(screen.getByText('Akan Datang')).toBeInTheDocument();
    expect(screen.getByText('Aksi Cepat')).toBeInTheDocument();
    expect(screen.getByText('Pilih MK')).toBeInTheDocument();
    expect(screen.getByText('Klaim Jadwal')).toBeInTheDocument();
    expect(screen.getByText('Input Absensi')).toBeInTheDocument();
  });

  it('route /dosen/jadwal → render DosenSchedule (checklist klaim) — TIDAK ada header Dashboard Dosen', async () => {
    renderAt('/dosen/jadwal');
    expect(await screen.findByText('Belum ada kelas yang diampu.')).toBeInTheDocument();
    expect(screen.queryByText('Dashboard Dosen')).not.toBeInTheDocument();
  });

  it('route /dosen/absensi → render DosenAttendance — TIDAK ada header Dashboard Dosen', () => {
    renderAt('/dosen/absensi');
    expect(screen.getByText('Absensi Mengajar')).toBeInTheDocument();
    expect(screen.queryByText('Dashboard Dosen')).not.toBeInTheDocument();
  });

  it('route /dosen/bimbingan → render DosenGuidance — TIDAK ada header Dashboard Dosen', () => {
    renderAt('/dosen/bimbingan');
    expect(screen.getByText('Bimbingan Mahasiswa Binaan')).toBeInTheDocument();
    expect(screen.queryByText('Dashboard Dosen')).not.toBeInTheDocument();
  });

  it('route /dosen/substitute → render DosenSubstitute — TIDAK ada header Dashboard Dosen', () => {
    renderAt('/dosen/substitute');
    expect(screen.getByText('Substitute Teaching')).toBeInTheDocument();
    expect(screen.queryByText('Dashboard Dosen')).not.toBeInTheDocument();
  });

  it('route /dosen/nilai → render DosenGrades — TIDAK ada header Dashboard Dosen', () => {
    renderAt('/dosen/nilai');
    expect(screen.getByText('Input Nilai')).toBeInTheDocument();
    expect(screen.queryByText('Dashboard Dosen')).not.toBeInTheDocument();
  });

  it('route /dosen/pilih-mk → render DosenSelectMK', () => {
    renderAt('/dosen/pilih-mk');
    expect(screen.getByText('Pilih Mata Kuliah')).toBeInTheDocument();
  });

  it('tab tidak dikenal → render dashboard overview (bukan Pilih MK)', () => {
    renderAt('/dosen/tidak-ada');
    expect(screen.getByText('Dashboard Dosen')).toBeInTheDocument();
    expect(screen.getByText('Kelas Diampu')).toBeInTheDocument();
  });
});
