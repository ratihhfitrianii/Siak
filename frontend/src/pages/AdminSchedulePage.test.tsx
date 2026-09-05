import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminSchedulePage } from './AdminSchedulePage';

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, adminFacultyCode: 'FT' },
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

// Backend snake_case shape (normalisasi di api.ts → AdminClass camelCase)
const CLASSES = {
  success: true,
  data: {
    items: [
      {
        id: 10,
        class_code: 'A',
        day_of_week: 2,
        start_time: '08:00:00',
        end_time: '09:40:00',
        room: 'R.101',
        capacity: 40,
        current_enrolled: 20,
        is_active: true,
        lecturer_id: null,
        lecturer_name: null,
        curriculum_id: 1,
        semester_number: 1,
        course_code: 'TI101',
        course_name: 'Pemrograman Dasar',
        credits: 3,
        prodi_id: 1,
        prodi_name: 'Teknik Informatika',
        prodi_code: 'TI',
        faculty_id: 1,
        faculty_name: 'Fakultas Teknik',
        faculty_code: 'FT',
      },
    ],
  },
};

const CURRICULA = {
  success: true,
  data: {
    items: [
      {
        id: 1,
        course_code: 'TI101',
        course_name: 'Pemrograman Dasar',
        credits: 3,
        semester_number: 1,
        prodi_name: 'Teknik Informatika',
        semester_id: 3,
      },
    ],
  },
};

const PRODIS = {
  success: true,
  data: {
    items: [{ id: 1, code: 'TI', name: 'Teknik Informatika', facultyId: 1, isActive: true }],
    pagination: { page: 1, limit: 100, total: 1 },
  },
};

const ROOMS = {
  success: true,
  data: {
    items: [
      {
        id: 1,
        code: 'R.101',
        name: 'Ruang 101',
        capacity: 40,
        facultyCode: 'FT',
        facultyId: 1,
        facultyName: 'Fakultas Teknik',
        isActive: true,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ],
    pagination: { page: 1, limit: 100, total: 1 },
  },
};

function baseFetch(url: string) {
  if (url.includes('/admin/classes')) {
    return Promise.resolve(jsonResponse(CLASSES));
  }
  if (url.includes('/curricula')) {
    return Promise.resolve(jsonResponse(CURRICULA));
  }
  if (url.includes('/rooms')) {
    return Promise.resolve(jsonResponse(ROOMS));
  }
  if (url.includes('/prodis')) {
    return Promise.resolve(jsonResponse(PRODIS));
  }
  return Promise.resolve(jsonResponse({ success: true, data: {} }));
}

describe('AdminSchedulePage (T3.2 — kelola jadwal pengajar)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('menampilkan daftar kelas fakultas admin dengan info jadwal & kapasitas', async () => {
    vi.stubGlobal('fetch', vi.fn(baseFetch));
    render(<AdminSchedulePage />);

    // Header + tombol
    expect(await screen.findByText('Kelola Jadwal')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tambah Kelas/i })).toBeInTheDocument();

    // Baris kelas tampil
    expect(await screen.findByText('TI101-A')).toBeInTheDocument();
    expect(screen.getByText('Pemrograman Dasar')).toBeInTheDocument();
    expect(screen.getByText('Teknik Informatika')).toBeInTheDocument();
    expect(screen.getByText('Selasa 08:00–09:40')).toBeInTheDocument();
    expect(screen.getByText('R.101')).toBeInTheDocument();
    expect(screen.getByText('20/40')).toBeInTheDocument();
    expect(screen.getByText('Belum ada pengampu')).toBeInTheDocument();
  });

  it('buka form tambah kelas → pilih prodi, MK, hari/jam, ruangan → POST /admin/classes', async () => {
    const fetchCalls: string[] = [];
    const fetchSpy = vi.fn((url: string, init?: RequestInit) => {
      fetchCalls.push(url);
      const isPost = init?.method === 'POST';
      if (url.includes('/admin/classes') && isPost) {
        return Promise.resolve(
          jsonResponse({
            success: true,
            data: {
              id: 11,
              class_code: 'B',
              day_of_week: 3,
              start_time: '10:00:00',
              end_time: '11:40:00',
              room: 'R.101',
              capacity: 40,
              current_enrolled: 0,
              curriculum_id: 1,
            },
          }),
        );
      }
      return baseFetch(url);
    });
    vi.stubGlobal('fetch', fetchSpy);
    render(<AdminSchedulePage />);

    await screen.findByText('TI101-A');

    // Buka form
    fireEvent.click(screen.getByRole('button', { name: /Tambah Kelas/i }));
    expect(await screen.findByText('Tambah Kelas Baru')).toBeInTheDocument();

    // Pilih prodi (SearchableDropdown: klik tombol → pilih opsi)
    const prodiBtn = screen.getByText('Pilih Prodi');
    fireEvent.click(prodiBtn);
    const prodiOption = await screen.findByText('TI — Teknik Informatika');
    fireEvent.click(prodiOption);

    // Pilih MK
    const mkPlaceholder = screen.getByText('Pilih Mata Kuliah');
    fireEvent.click(mkPlaceholder);
    const mkOption = await screen.findByText('TI101 — Pemrograman Dasar (Sem 1)');
    fireEvent.click(mkOption);

    // Kode kelas
    const codeInput = screen.getByPlaceholderText('Contoh: A, B, C');
    fireEvent.change(codeInput, { target: { value: 'B' } });

    // Hari
    const daySelect = screen.getByLabelText('Hari');
    fireEvent.change(daySelect, { target: { value: '3' } });

    // Jam
    const startInput = screen.getByPlaceholderText('08:00');
    const endInput = screen.getByPlaceholderText('09:40');
    fireEvent.change(startInput, { target: { value: '10:00' } });
    fireEvent.change(endInput, { target: { value: '11:40' } });

    // Ruangan (pilih R.101)
    const roomBtn = await screen.findByText('Pilih Ruangan');
    fireEvent.click(roomBtn);
    const roomOption = await screen.findByText(/R\.101 — Ruang 101 \(40 kursi\)/);
    fireEvent.click(roomOption);

    // Submit
    fireEvent.click(screen.getByRole('button', { name: /Simpan Kelas/i }));

    await waitFor(() => {
      expect(fetchCalls.some((u) => u.includes('/admin/classes'))).toBe(true);
    });
    // POST /admin/classes (bukan GET)
    const postCall = fetchCalls.find((u) => u.includes('/admin/classes') && !u.includes('?'));
    expect(postCall).toBeTruthy();
  });

  it('ruangan yang dipakai kelas lain di hari/jam sama tidak muncul di dropdown', async () => {
    vi.stubGlobal('fetch', vi.fn(baseFetch));
    render(<AdminSchedulePage />);

    await screen.findByText('TI101-A');

    // Buka form
    fireEvent.click(screen.getByRole('button', { name: /Tambah Kelas/i }));
    await screen.findByText('Tambah Kelas Baru');

    const prodiBtn = screen.getByText('Pilih Prodi');
    fireEvent.click(prodiBtn);
    const prodiOption = await screen.findByText('TI — Teknik Informatika');
    fireEvent.click(prodiOption);

    const mkPlaceholder = screen.getByText('Pilih Mata Kuliah');
    fireEvent.click(mkPlaceholder);
    const mkOption = await screen.findByText('TI101 — Pemrograman Dasar (Sem 1)');
    fireEvent.click(mkOption);

    fireEvent.change(screen.getByPlaceholderText('Contoh: A, B, C'), {
      target: { value: 'C' },
    });
    // Hari Selasa (2) = hari kelas R.101 yang sudah dipakai; atur jam tumpang tindih
    const daySelect = screen.getByLabelText('Hari');
    fireEvent.change(daySelect, { target: { value: '2' } });
    fireEvent.change(screen.getByPlaceholderText('08:00'), { target: { value: '08:30' } });
    fireEvent.change(screen.getByPlaceholderText('09:40'), { target: { value: '10:10' } });

    // Semua ruangan bentrok → pesan peringatan muncul; R.101 TIDAK tersedia di dropdown
    expect(
      await screen.findByText(/Semua ruangan fakultas ini sedang dipakai/),
    ).toBeInTheDocument();
  });

  it('gagal memuat data → pesan error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          jsonResponse(
            {
              success: false,
              error: { code: 'INTERNAL_ERROR', message: 'Gagal memuat data jadwal' },
            },
            500,
          ),
        ),
      ),
    );
    render(<AdminSchedulePage />);
    expect(await screen.findByText('Gagal memuat data jadwal')).toBeInTheDocument();
  });
});
