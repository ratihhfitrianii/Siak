import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { controlFor } from '../test/controls';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DosenGuidance } from './DosenGuidance';

function jsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

/** Raw snake_case dari backend (normalisasi di lib/api). */
const MENTEES_RAW = [
  {
    student_id: 1,
    nim: '2023110001',
    student_name: 'Budi Santoso',
    email: 'budi@example.id',
    status: 'aktif',
    prodi_code: 'TI',
  },
  {
    student_id: 2,
    nim: '2023110002',
    student_name: 'Ani Wijaya',
    email: 'ani@example.id',
    status: 'aktif',
    prodi_code: 'TI',
  },
];

const SESSIONS_RAW = [
  {
    id: 21,
    student_id: 1,
    nim: '2023110001',
    student_name: 'Budi Santoso',
    lecturer_id: 4,
    lecturer_name: 'Dosen Satu',
    session_date: '2026-08-01',
    notes: 'Konsultasi KRS',
    progress: 'berjalan',
    is_visible_to_student: true,
    created_at: '2026-08-01T08:00:00Z',
    updated_at: '2026-08-01T08:00:00Z',
  },
];

describe('DosenGuidance (T3.8)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    fetchMock.mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes('/guidance/mentees')) {
        return Promise.resolve(jsonResponse({ data: MENTEES_RAW }));
      }
      if (u.includes('/guidance/sessions')) {
        return Promise.resolve(jsonResponse({ data: SESSIONS_RAW }));
      }
      return Promise.resolve(jsonResponse({ data: [] }));
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('render — header + form bimbingan + daftar sesi dari API', async () => {
    render(<DosenGuidance />);
    expect(screen.getByText('Bimbingan Mahasiswa Binaan')).toBeInTheDocument();
    expect(await screen.findByText('Budi Santoso (2023110001)')).toBeInTheDocument();
    expect(screen.getByText('Konsultasi KRS')).toBeInTheDocument();
    // Badge progress di daftar sesi (bukan option select "Berjalan")
    expect(screen.getByText('Berjalan', { selector: 'span' })).toBeInTheDocument();
  });

  it('tanpa mahasiswa binaan → pesan khusus', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes('/guidance/mentees')) {
        return Promise.resolve(jsonResponse({ data: [] }));
      }
      return Promise.resolve(jsonResponse({ data: [] }));
    });
    render(<DosenGuidance />);
    expect(
      await screen.findByText('Anda belum memiliki mahasiswa binaan (atribut Wali).'),
    ).toBeInTheDocument();
  });

  it('load gagal → error', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: false, error: { code: 'INTERNAL', message: 'x' } }, 500),
    );
    render(<DosenGuidance />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Gagal memuat data bimbingan');
  });

  it('submit lengkap → POST /guidance/sessions + success', async () => {
    const user = userEvent.setup();
    let postBody: unknown = null;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const u = String(url);
      if (init?.method === 'POST' && u.endsWith('/guidance/sessions')) {
        postBody = JSON.parse(String(init.body));
        return Promise.resolve(
          jsonResponse({
            success: true,
            data: {
              id: 22,
              student_id: 1,
              nim: '2023110001',
              student_name: 'Budi Santoso',
              lecturer_id: 4,
              lecturer_name: 'Dosen Satu',
              session_date: '2026-08-10',
              notes: 'Bimbingan Bab 3',
              progress: 'berjalan',
              is_visible_to_student: true,
              created_at: '2026-08-10T09:00:00Z',
              updated_at: '2026-08-10T09:00:00Z',
            },
          }),
        );
      }
      if (u.includes('/guidance/mentees')) {
        return Promise.resolve(jsonResponse({ data: MENTEES_RAW }));
      }
      return Promise.resolve(jsonResponse({ data: SESSIONS_RAW }));
    });
    render(<DosenGuidance />);
    await screen.findByText('Budi Santoso (2023110001)');

    await user.selectOptions(controlFor('Mahasiswa Binaan', 'select'), '1');
    await user.type(controlFor('Tanggal Bimbingan', 'input'), '2026-08-10');
    await user.selectOptions(controlFor('Progress', 'select'), 'berjalan');
    await user.type(controlFor('Catatan', 'textarea'), 'Bimbingan Bab 3');

    await user.click(screen.getByRole('button', { name: 'Simpan Bimbingan' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Catatan bimbingan berhasil disimpan',
    );
    expect(postBody).toEqual({
      studentId: 1,
      sessionDate: '2026-08-10',
      progress: 'berjalan',
      notes: 'Bimbingan Bab 3',
    });
  });

  it('submit FORBIDDEN → pesan hanya dosen Wali', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const u = String(url);
      if (init?.method === 'POST' && u.endsWith('/guidance/sessions')) {
        return Promise.resolve(
          jsonResponse(
            { success: false, error: { code: 'FORBIDDEN', message: 'bukan wali' } },
            403,
          ),
        );
      }
      if (u.includes('/guidance/mentees')) {
        return Promise.resolve(jsonResponse({ data: MENTEES_RAW }));
      }
      return Promise.resolve(jsonResponse({ data: SESSIONS_RAW }));
    });
    render(<DosenGuidance />);
    await screen.findByText('Budi Santoso (2023110001)');

    await user.selectOptions(controlFor('Mahasiswa Binaan', 'select'), '1');
    await user.type(controlFor('Tanggal Bimbingan', 'input'), '2026-08-11');
    await user.type(controlFor('Catatan', 'textarea'), 'test');
    await user.click(screen.getByRole('button', { name: 'Simpan Bimbingan' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Anda tidak memiliki izin untuk bimbingan mahasiswa ini (hanya dosen Wali)',
    );
  });

  it('filter sesi berdasarkan mahasiswa', async () => {
    const user = userEvent.setup();
    render(<DosenGuidance />);
    await screen.findByText('Budi Santoso (2023110001)');

    // Sesi Budi (student 1) tampil; pilih Ani (student 2) → daftar kosong
    await user.selectOptions(controlFor('Mahasiswa Binaan', 'select'), '2');
    expect(
      await screen.findByText('Belum ada catatan bimbingan untuk mahasiswa ini.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Konsultasi KRS')).not.toBeInTheDocument();
  });
});
