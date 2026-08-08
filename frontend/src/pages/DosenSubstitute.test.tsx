import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { controlFor } from '../test/controls';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DosenSubstitute } from './DosenSubstitute';
import type { SubstituteRequest } from '../lib/types';

function jsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

const REQUESTS: SubstituteRequest[] = [
  {
    id: 41,
    originalLecturerId: 1,
    originalLecturerName: 'Dr. Budi Santoso, M.Kom',
    substituteLecturerId: 2,
    substituteLecturerName: 'Prof. Ani Wijaya, Ph.D',
    classId: 1,
    classCode: 'TI101-A',
    courseCode: 'TI101',
    courseName: 'Dasar-Dasar Pemrograman',
    sessionDate: '2026-08-15',
    type: 'pencarian',
    status: 'diajukan',
    notes: 'Sakit',
    createdAt: '2026-08-14T08:00:00Z',
  },
];

describe('DosenSubstitute (T3.8)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('render awal — minta pilih dosen asli', () => {
    render(<DosenSubstitute />);
    expect(screen.getByText('Input Substitute Dosen')).toBeInTheDocument();
    expect(
      screen.getByText('Pilih dosen asli untuk melihat permintaan substitute.'),
    ).toBeInTheDocument();
  });

  it('pilih dosen asli → load requests → render daftar', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(jsonResponse({ data: { items: REQUESTS } }));
    render(<DosenSubstitute />);

    await user.selectOptions(controlFor('Dosen Asli', 'select'), '1');
    expect(
      await screen.findByText(/TI101-A - TI101 - Dasar-Dasar Pemrograman/),
    ).toBeInTheDocument();
    expect(screen.getByText('diajukan')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/substitute?lecturerId=1'),
      expect.any(Object),
    );
  });

  it('load requests gagal → error', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      jsonResponse({ success: false, error: { code: 'INTERNAL', message: 'x' } }, 500),
    );
    render(<DosenSubstitute />);
    await user.selectOptions(controlFor('Dosen Asli', 'select'), '1');
    expect(await screen.findByRole('alert')).toHaveTextContent('Gagal memuat daftar substitute');
  });

  it('tombol Ajukan disabled sampai semua field lengkap', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(jsonResponse({ data: { items: REQUESTS } }));
    render(<DosenSubstitute />);
    await user.selectOptions(controlFor('Dosen Asli', 'select'), '1');
    await screen.findByText(/TI101-A - TI101 - Dasar-Dasar Pemrograman/);

    const btn = screen.getByRole('button', { name: 'Ajukan Permintaan Substitute' });
    expect(btn).toBeDisabled();

    await user.selectOptions(controlFor('Jenis Substitute', 'select'), 'pencarian');
    await user.type(controlFor('Tanggal Substitute', 'input'), '2026-08-21');
    await user.selectOptions(controlFor('Dosen Pengganti', 'select'), '2');
    await user.selectOptions(controlFor('Mata Kuliah / Kelas', 'select'), '1');
    await user.type(controlFor('Catatan', 'textarea'), 'test');
    expect(btn).toBeEnabled();
  });

  it('dosen asli == dosen pengganti → warning + tombol disabled', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(jsonResponse({ data: { items: REQUESTS } }));
    render(<DosenSubstitute />);
    await user.selectOptions(controlFor('Dosen Asli', 'select'), '1');
    await screen.findByText(/TI101-A - TI101 - Dasar-Dasar Pemrograman/);

    await user.selectOptions(controlFor('Dosen Pengganti', 'select'), '1');
    await user.type(controlFor('Tanggal Substitute', 'input'), '2026-08-20');
    await user.type(controlFor('Catatan', 'textarea'), 'test');

    expect(
      screen.getByText('⚠️ Dosen pengganti tidak boleh sama dengan dosen asli'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ajukan Permintaan Substitute' })).toBeDisabled();
  });

  it('submit lengkap → POST /substitute + success + form reset', async () => {
    const user = userEvent.setup();
    let postBody: unknown = null;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && String(url).endsWith('/substitute')) {
        postBody = JSON.parse(String(init.body));
        return Promise.resolve(
          jsonResponse({
            success: true,
            data: {
              id: 42,
              originalLecturerId: 1,
              originalLecturerName: 'Dr. Budi Santoso, M.Kom',
              substituteLecturerId: 2,
              substituteLecturerName: 'Prof. Ani Wijaya, Ph.D',
              classId: 1,
              classCode: 'TI101-A',
              courseCode: 'TI101',
              courseName: 'Dasar-Dasar Pemrograman',
              sessionDate: '2026-08-20',
              type: 'penjadwalan',
              status: 'diajukan',
              notes: 'Ada acara',
              createdAt: '2026-08-20T08:00:00Z',
            },
          }),
        );
      }
      return Promise.resolve(jsonResponse({ data: { items: REQUESTS } }));
    });
    render(<DosenSubstitute />);
    await user.selectOptions(controlFor('Dosen Asli', 'select'), '1');
    await screen.findByText(/TI101-A - TI101 - Dasar-Dasar Pemrograman/);

    await user.selectOptions(controlFor('Jenis Substitute', 'select'), 'penjadwalan');
    await user.type(controlFor('Tanggal Substitute', 'input'), '2026-08-20');
    await user.selectOptions(controlFor('Dosen Pengganti', 'select'), '2');
    await user.selectOptions(controlFor('Mata Kuliah / Kelas', 'select'), '1');
    await user.type(controlFor('Catatan', 'textarea'), 'Ada acara');
    await user.click(screen.getByRole('button', { name: 'Ajukan Permintaan Substitute' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Permintaan pengganti berhasil dikirim',
    );
    expect(postBody).toEqual({
      originalLecturerId: 1,
      substituteLecturerId: 2,
      classId: 1,
      sessionDate: '2026-08-20',
      type: 'penjadwalan',
      notes: 'Ada acara',
    });
  });

  it('submit CONFLICT → pesan bentrok jadwal pengganti', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && String(url).endsWith('/substitute')) {
        return Promise.resolve(
          jsonResponse({ success: false, error: { code: 'CONFLICT', message: 'bentrok' } }, 409),
        );
      }
      return Promise.resolve(jsonResponse({ data: { items: REQUESTS } }));
    });
    render(<DosenSubstitute />);
    await user.selectOptions(controlFor('Dosen Asli', 'select'), '1');
    await screen.findByText(/TI101-A - TI101 - Dasar-Dasar Pemrograman/);

    await user.selectOptions(controlFor('Jenis Substitute', 'select'), 'pencarian');
    await user.type(controlFor('Tanggal Substitute', 'input'), '2026-08-21');
    await user.selectOptions(controlFor('Dosen Pengganti', 'select'), '2');
    await user.selectOptions(controlFor('Mata Kuliah / Kelas', 'select'), '1');
    await user.type(controlFor('Catatan', 'textarea'), 'test');
    await user.click(screen.getByRole('button', { name: 'Ajukan Permintaan Substitute' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Jadwal bentrok dengan jadwal dosen pengganti',
    );
  });

  it('submit VALIDATION_ERROR → pesan API', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && String(url).endsWith('/substitute')) {
        return Promise.resolve(
          jsonResponse(
            { success: false, error: { code: 'VALIDATION_ERROR', message: 'Data tidak valid' } },
            400,
          ),
        );
      }
      return Promise.resolve(jsonResponse({ data: { items: REQUESTS } }));
    });
    render(<DosenSubstitute />);
    await user.selectOptions(controlFor('Dosen Asli', 'select'), '1');
    await screen.findByText(/TI101-A - TI101 - Dasar-Dasar Pemrograman/);

    await user.selectOptions(controlFor('Jenis Substitute', 'select'), 'pencarian');
    await user.type(controlFor('Tanggal Substitute', 'input'), '2026-08-21');
    await user.selectOptions(controlFor('Dosen Pengganti', 'select'), '2');
    await user.selectOptions(controlFor('Mata Kuliah / Kelas', 'select'), '1');
    await user.type(controlFor('Catatan', 'textarea'), 'test');
    await user.click(screen.getByRole('button', { name: 'Ajukan Permintaan Substitute' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Data tidak valid');
  });

  it('dosen asli tanpa requests → pesan kosong', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(jsonResponse({ data: { items: [] } }));
    render(<DosenSubstitute />);
    await user.selectOptions(controlFor('Dosen Asli', 'select'), '3');
    expect(await screen.findByText('Belum ada permintaan substitute.')).toBeInTheDocument();
  });
});
