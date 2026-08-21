import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { controlFor } from '../test/controls';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DosenGuidance } from './DosenGuidance';

vi.setConfig({ testTimeout: 20_000 });

function jsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

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
    student_email: 'budi@example.id',
    prodi_code: 'TI',
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

describe('DosenGuidance', () => {
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

  it('render — header + search + student cards + form', async () => {
    render(<DosenGuidance />);
    // Header card dihapus — cek langsung konten student cards
    // Student cards visible
    expect(await screen.findByText('Budi Santoso')).toBeInTheDocument();
    expect(screen.getByText('Ani Wijaya')).toBeInTheDocument();
    // Search bar
    expect(screen.getByPlaceholderText(/Cari berdasarkan NIM, nama, email/)).toBeInTheDocument();
    // Form
    expect(screen.getByText('Catat Bimbingan Baru')).toBeInTheDocument();
  });

  it('expand card — show session detail', async () => {
    const user = userEvent.setup();
    render(<DosenGuidance />);
    await screen.findByText('Budi Santoso');

    // Click on Budi's card to expand
    await user.click(screen.getByText('Budi Santoso'));
    // Session detail visible
    expect(await screen.findByText('Konsultasi KRS')).toBeInTheDocument();
  });

  it('collapse card — hide session detail', async () => {
    const user = userEvent.setup();
    render(<DosenGuidance />);
    await screen.findByText('Budi Santoso');

    // Expand then collapse
    await user.click(screen.getByText('Budi Santoso'));
    await screen.findByText('Konsultasi KRS');
    await user.click(screen.getByText('Budi Santoso'));
    expect(screen.queryByText('Konsultasi KRS')).not.toBeInTheDocument();
  });

  it('tanpa mahasiswa binaan — pesan kosong', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes('/guidance/mentees')) {
        return Promise.resolve(jsonResponse({ data: [] }));
      }
      return Promise.resolve(jsonResponse({ data: [] }));
    });
    render(<DosenGuidance />);
    expect(await screen.findByText('Belum ada mahasiswa binaan')).toBeInTheDocument();
  });

  it('load gagal — error', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: false, error: { code: 'INTERNAL', message: 'x' } }, 500),
    );
    render(<DosenGuidance />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Gagal memuat data bimbingan');
  });

  it('submit — POST /guidance/sessions + success', async () => {
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
    await screen.findByText('Budi Santoso');

    // Select student
    await user.selectOptions(controlFor('Mahasiswa Binaan', 'select'), '1');
    // Date
    await user.type(controlFor('Tanggal Bimbingan', 'input'), '2026-08-10');
    // Progress
    await user.selectOptions(controlFor('Progress', 'select'), 'berjalan');
    // Notes
    await user.type(controlFor('Catatan Bimbingan', 'textarea'), 'Bimbingan Bab 3');

    await user.click(screen.getByRole('button', { name: 'Simpan Catatan' }));
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

  it('click + Catat Bimbingan Baru pada card → pindah ke form', async () => {
    const user = userEvent.setup();
    render(<DosenGuidance />);
    await screen.findByText('Budi Santoso');

    // Expand Budi's card
    await user.click(screen.getByText('Budi Santoso'));
    // Click "Catat Bimbingan Baru" button inside expanded card
    const addBtn = screen.getByRole('button', { name: /Catat Bimbingan Baru/ });
    await user.click(addBtn);

    // Student should be selected in form
    const select = controlFor('Mahasiswa Binaan', 'select');
    expect(select).toHaveValue('1');
  });
});
