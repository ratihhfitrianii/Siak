import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { controlFor } from '../test/controls';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DosenGuidance } from './DosenGuidance';
import type { GuidanceSession } from '../lib/types';

function jsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

const SESSIONS: GuidanceSession[] = [
  {
    id: 21,
    studentId: 1,
    nim: '2023110001',
    studentName: 'Budi Santoso',
    lecturerId: 7,
    type: 'konsultasi',
    date: '2026-08-01',
    description: 'Konsultasi KRS',
    createdAt: '2026-08-01T08:00:00Z',
  },
];

describe('DosenGuidance (T3.8)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('render awal — form bimbingan tersembunyi sampai kelas dipilih', () => {
    render(<DosenGuidance />);
    expect(screen.getByText('Input Bimbingan')).toBeInTheDocument();
    expect(screen.getByText('Pilih kelas terlebih dahulu.')).toBeInTheDocument();
  });

  it('pilih kelas → load sesi bimbingan → render daftar', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(jsonResponse({ data: { items: SESSIONS } }));
    render(<DosenGuidance />);

    await user.selectOptions(controlFor('Pilih Kelas Binaan', 'select'), '1');
    expect(await screen.findByText('Budi Santoso (2023110001)')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/guidance?classId=1'),
      expect.any(Object),
    );
  });

  it('load gagal → error', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      jsonResponse({ success: false, error: { code: 'INTERNAL', message: 'x' } }, 500),
    );
    render(<DosenGuidance />);
    await user.selectOptions(controlFor('Pilih Kelas Binaan', 'select'), '1');
    expect(await screen.findByRole('alert')).toHaveTextContent('Gagal memuat catatan bimbingan');
  });

  it('tombol Simpan Bimbingan disabled sampai form lengkap', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(jsonResponse({ data: { items: SESSIONS } }));
    render(<DosenGuidance />);
    await user.selectOptions(controlFor('Pilih Kelas Binaan', 'select'), '1');
    await screen.findByText('Budi Santoso (2023110001)');

    expect(screen.getByRole('button', { name: 'Simpan Bimbingan' })).toBeDisabled();

    // Lengkapi form → enabled
    await user.selectOptions(controlFor('Mahasiswa', 'select'), '1');
    await user.selectOptions(controlFor('Jenis Bimbingan', 'select'), 'konsultasi');
    await user.type(controlFor('Tanggal Bimbingan', 'input'), '2026-08-11');
    await user.type(controlFor('Deskripsi', 'textarea'), 'test');
    expect(screen.getByRole('button', { name: 'Simpan Bimbingan' })).toBeEnabled();
  });

  it('isi form → preview muncul → submit → POST /guidance + success', async () => {
    const user = userEvent.setup();
    let postBody: unknown = null;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && String(url).endsWith('/guidance')) {
        postBody = JSON.parse(String(init.body));
        return Promise.resolve(
          jsonResponse({
            success: true,
            data: {
              id: 22,
              studentId: 1,
              nim: '2023110001',
              studentName: 'Budi Santoso',
              lecturerId: 7,
              type: 'skripsi',
              date: '2026-08-10',
              description: 'Bimbingan Bab 3',
              createdAt: '2026-08-10T09:00:00Z',
            },
          }),
        );
      }
      return Promise.resolve(jsonResponse({ data: { items: SESSIONS } }));
    });
    render(<DosenGuidance />);
    await user.selectOptions(controlFor('Pilih Kelas Binaan', 'select'), '1');
    await screen.findByText('Budi Santoso (2023110001)');

    await user.selectOptions(controlFor('Mahasiswa', 'select'), '1');
    await user.selectOptions(controlFor('Jenis Bimbingan', 'select'), 'skripsi');
    await user.type(controlFor('Tanggal Bimbingan', 'input'), '2026-08-10');
    await user.type(controlFor('Deskripsi', 'textarea'), 'Bimbingan Bab 3');

    // Preview muncul saat semua field terisi (teks jenis muncul di option & preview)
    expect(screen.getByText('Pratinjau Bimbingan:')).toBeInTheDocument();
    expect(screen.getAllByText(/Pembimbing Skripsi/).length).toBeGreaterThanOrEqual(2);

    await user.click(screen.getByRole('button', { name: 'Simpan Bimbingan' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Catatan bimbingan berhasil disimpan',
    );
    expect(postBody).toEqual({
      studentId: 1,
      type: 'skripsi',
      date: '2026-08-10',
      description: 'Bimbingan Bab 3',
    });
  });

  it('submit FORBIDDEN → pesan hanya dosen Wali', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && String(url).endsWith('/guidance')) {
        return Promise.resolve(
          jsonResponse(
            { success: false, error: { code: 'FORBIDDEN', message: 'bukan wali' } },
            403,
          ),
        );
      }
      return Promise.resolve(jsonResponse({ data: { items: SESSIONS } }));
    });
    render(<DosenGuidance />);
    await user.selectOptions(controlFor('Pilih Kelas Binaan', 'select'), '1');
    await screen.findByText('Budi Santoso (2023110001)');

    await user.selectOptions(controlFor('Mahasiswa', 'select'), '1');
    await user.selectOptions(controlFor('Jenis Bimbingan', 'select'), 'konsultasi');
    await user.type(controlFor('Tanggal Bimbingan', 'input'), '2026-08-11');
    await user.type(controlFor('Deskripsi', 'textarea'), 'test');
    await user.click(screen.getByRole('button', { name: 'Simpan Bimbingan' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Anda tidak memiliki izin untuk bimbingan mahasiswa ini (hanya dosen Wali)',
    );
  });

  it('submit VALIDATION_ERROR → pesan API', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && String(url).endsWith('/guidance')) {
        return Promise.resolve(
          jsonResponse(
            { success: false, error: { code: 'VALIDATION_ERROR', message: 'Tanggal invalid' } },
            400,
          ),
        );
      }
      return Promise.resolve(jsonResponse({ data: { items: SESSIONS } }));
    });
    render(<DosenGuidance />);
    await user.selectOptions(controlFor('Pilih Kelas Binaan', 'select'), '1');
    await screen.findByText('Budi Santoso (2023110001)');

    await user.selectOptions(controlFor('Mahasiswa', 'select'), '1');
    await user.selectOptions(controlFor('Jenis Bimbingan', 'select'), 'konsultasi');
    await user.type(controlFor('Tanggal Bimbingan', 'input'), '2026-08-11');
    await user.type(controlFor('Deskripsi', 'textarea'), 'test');
    await user.click(screen.getByRole('button', { name: 'Simpan Bimbingan' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Tanggal invalid');
  });

  it('kelas tanpa sesi → pesan kosong', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(jsonResponse({ data: { items: [] } }));
    render(<DosenGuidance />);
    await user.selectOptions(controlFor('Pilih Kelas Binaan', 'select'), '2');
    expect(
      await screen.findByText('Belum ada catatan bimbingan untuk kelas ini.'),
    ).toBeInTheDocument();
  });
});
