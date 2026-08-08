import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { controlFor } from '../test/controls';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DosenAttendance } from './DosenAttendance';
import type { AttendanceSession, AttendanceRecord } from '../lib/types';

function jsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

const SESSIONS: AttendanceSession[] = [
  {
    id: 31,
    classId: 1,
    classCode: 'TI101-A',
    courseCode: 'TI101',
    courseName: 'Dasar-Dasar Pemrograman',
    sessionDate: '2026-08-03',
    topic: 'Pertemuan 1',
    material: 'Pengenalan',
    createdAt: '2026-08-03T07:00:00Z',
  },
];

const RECORDS: AttendanceRecord[] = [
  {
    id: 311,
    sessionId: 31,
    studentId: 1,
    nim: '2023110001',
    studentName: 'Budi Santoso',
    status: 'hadir',
    createdAt: '2026-08-03T07:00:00Z',
  },
  {
    id: 312,
    sessionId: 31,
    studentId: 2,
    nim: '2023110002',
    studentName: 'Ani Wijaya',
    status: 'tidak_hadir',
    createdAt: '2026-08-03T07:00:00Z',
  },
];

describe('DosenAttendance (T3.8)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('render awal — minta pilih kelas', () => {
    render(<DosenAttendance />);
    expect(screen.getByText('Input Absensi')).toBeInTheDocument();
    expect(screen.getByText('Pilih kelas terlebih dahulu.')).toBeInTheDocument();
  });

  it('pilih kelas → load sesi absensi → render daftar sesi', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(jsonResponse({ data: { items: SESSIONS } }));
    render(<DosenAttendance />);

    await user.selectOptions(controlFor('Pilih Kelas', 'select'), '1');
    expect(await screen.findByText(/Pertemuan 1/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/attendance?classId=1'),
      expect.any(Object),
    );
  });

  it('load sesi gagal → error', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      jsonResponse({ success: false, error: { code: 'INTERNAL', message: 'x' } }, 500),
    );
    render(<DosenAttendance />);
    await user.selectOptions(controlFor('Pilih Kelas', 'select'), '1');
    expect(await screen.findByRole('alert')).toHaveTextContent('Gagal memuat sesi absensi');
  });

  it('buat sesi baru tanpa lengkap → error validasi lokal', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(jsonResponse({ data: { items: SESSIONS } }));
    render(<DosenAttendance />);
    await user.selectOptions(controlFor('Pilih Kelas', 'select'), '1');
    await screen.findByText(/Pertemuan 1/);

    await user.click(screen.getByRole('button', { name: 'Buat Sesi Baru' }));
    await user.click(screen.getByRole('button', { name: 'Buat Sesi' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Lengkapi semua field sesi absensi');
  });

  it('buat sesi baru lengkap → POST /attendance + success + otomatis pilih sesi baru', async () => {
    const user = userEvent.setup();
    let postBody: unknown = null;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && String(url).endsWith('/attendance')) {
        postBody = JSON.parse(String(init.body));
        return Promise.resolve(
          jsonResponse({
            success: true,
            data: {
              id: 99,
              classId: 1,
              classCode: 'TI101-A',
              courseCode: 'TI101',
              courseName: 'Dasar-Dasar Pemrograman',
              sessionDate: '2026-08-10',
              topic: 'Pertemuan 2',
              material: 'Array',
              createdAt: '2026-08-10T07:00:00Z',
            },
          }),
        );
      }
      if (String(url).includes('/attendance/records?sessionId=')) {
        return Promise.resolve(jsonResponse({ data: { items: [] } }));
      }
      return Promise.resolve(jsonResponse({ data: { items: SESSIONS } }));
    });
    render(<DosenAttendance />);
    await user.selectOptions(controlFor('Pilih Kelas', 'select'), '1');
    await screen.findByText(/Pertemuan 1/);

    await user.click(screen.getByRole('button', { name: 'Buat Sesi Baru' }));
    await user.type(controlFor('Tanggal', 'input'), '2026-08-10');
    await user.type(controlFor('Topik', 'input'), 'Pertemuan 2');
    await user.type(controlFor('Materi', 'textarea'), 'Array');
    await user.click(screen.getByRole('button', { name: 'Buat Sesi' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Sesi absensi berhasil dibuat');
    expect(postBody).toEqual({
      classId: 1,
      sessionDate: '2026-08-10',
      topic: 'Pertemuan 2',
      material: 'Array',
    });
    // Form sesi baru tertutup setelah sukses
    expect(screen.queryByText('Buat Sesi Absensi Baru')).not.toBeInTheDocument();
  });

  it('buat sesi gagal VALIDATION_ERROR → pesan API', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && String(url).endsWith('/attendance')) {
        return Promise.resolve(
          jsonResponse(
            { success: false, error: { code: 'VALIDATION_ERROR', message: 'Tanggal sudah lewat' } },
            400,
          ),
        );
      }
      return Promise.resolve(jsonResponse({ data: { items: SESSIONS } }));
    });
    render(<DosenAttendance />);
    await user.selectOptions(controlFor('Pilih Kelas', 'select'), '1');
    await screen.findByText(/Pertemuan 1/);

    await user.click(screen.getByRole('button', { name: 'Buat Sesi Baru' }));
    await user.type(controlFor('Tanggal', 'input'), '2026-08-01');
    await user.type(controlFor('Topik', 'input'), 'P');
    await user.type(controlFor('Materi', 'textarea'), 'M');
    await user.click(screen.getByRole('button', { name: 'Buat Sesi' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Tanggal sudah lewat');
  });

  it('pilih sesi → load records → toggle kehadiran → submit absensi', async () => {
    const user = userEvent.setup();
    let submitBody: unknown = null;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && String(url).endsWith('/attendance/submit')) {
        submitBody = JSON.parse(String(init.body));
        return Promise.resolve(jsonResponse({ success: true, data: { message: 'ok' } }));
      }
      if (String(url).includes('/attendance/records?sessionId=')) {
        return Promise.resolve(jsonResponse({ data: { items: RECORDS } }));
      }
      return Promise.resolve(jsonResponse({ data: { items: SESSIONS } }));
    });
    render(<DosenAttendance />);
    await user.selectOptions(controlFor('Pilih Kelas', 'select'), '1');
    await screen.findByText(/Pertemuan 1/);

    // Pilih sesi → records muncul (dynamic import getAttendanceRecords)
    await user.selectOptions(screen.getAllByRole('combobox')[1], '31');
    expect(await screen.findByText('Budi Santoso (2023110001)')).toBeInTheDocument();
    expect(screen.getByText('Ani Wijaya (2023110002)')).toBeInTheDocument();
    // Statistik: 1 hadir dari 2
    expect(screen.getByText(/Hadir: 1/)).toBeInTheDocument();

    // Toggle Ani → hadir
    await user.click(screen.getByLabelText('Ani Wijaya (2023110002)'));
    expect(screen.getByText(/Hadir: 2/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Simpan Absensi' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Absensi berhasil disimpan');
    expect(submitBody).toEqual({
      sessionId: 31,
      records: [
        { studentId: 1, status: 'hadir' },
        { studentId: 2, status: 'hadir' },
      ],
    });
  });

  it('submit absensi tanpa sesi → error', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(jsonResponse({ data: { items: SESSIONS } }));
    render(<DosenAttendance />);
    await user.selectOptions(controlFor('Pilih Kelas', 'select'), '1');
    await screen.findByText(/Pertemuan 1/);

    // Tanpa memilih sesi, tombol Simpan Absensi tidak ada — verifikasi state placeholder
    expect(screen.getByText('Pilih atau buat sesi absensi terlebih dahulu.')).toBeInTheDocument();
  });
});
