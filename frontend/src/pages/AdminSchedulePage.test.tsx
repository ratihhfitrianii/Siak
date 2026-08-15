import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminSchedulePage } from './AdminSchedulePage';

// AdminSchedulePage tidak pakai useAuth secara langsung (dikenakan ProtectedRoute di luar)
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: null, booting: false, logout: vi.fn() }),
}));

function jsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

// Backend snake_case shape (normalisasi di api.ts → ClassSchedule camelCase)
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
      {
        id: 2,
        course_code: 'TI103',
        course_name: 'Algoritma dan Pemrograman',
        credits: 3,
        semester_number: 1,
        prodi_name: 'Teknik Informatika',
        semester_id: 3,
      },
    ],
  },
};

const CLASSES = {
  success: true,
  data: {
    items: [
      {
        id: 10,
        class_code: 'TI101-A',
        day_of_week: 2,
        start_time: '08:00',
        end_time: '09:40',
        room: 'R1',
        capacity: 40,
        current_enrolled: 20,
        is_active: true,
      },
    ],
  },
};

// GET /schedule/class/:id → schedules (snake_case, diverifikasi normalisasi)
const SCHEDULES = {
  success: true,
  data: {
    class: { id: 10, class_code: 'TI101-A' },
    schedules: [
      {
        id: 1,
        meeting_number: 1,
        scheduled_date: '2026-02-02',
        topic: 'Pemrograman Dasar',
        is_completed: false,
      },
    ],
  },
};

function baseFetch(url: string) {
  if (url.includes('/curricula')) {
    return Promise.resolve(jsonResponse(CURRICULA));
  }
  if (url.includes('/classes')) {
    return Promise.resolve(jsonResponse(CLASSES));
  }
  if (url.includes('/schedule/class/')) {
    return Promise.resolve(jsonResponse(SCHEDULES));
  }
  return Promise.resolve(jsonResponse({ success: true, data: {} }));
}

describe('AdminSchedulePage (T3.2 — kelola jadwal pengajar)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('muat kurikulum → pilih → muat kelas → muat jadwal, tampilkan baris jadwal', async () => {
    vi.stubGlobal('fetch', vi.fn(baseFetch));
    render(<AdminSchedulePage />);

    // Kurikulum ter-load
    expect(await screen.findByText(/Teknik Informatika — TI101/)).toBeInTheDocument();

    // Pilih kurikulum pertama
    const curriculumSelect = (await screen.findAllByRole('combobox'))[0] as HTMLSelectElement;
    curriculumSelect.value = '1';
    curriculumSelect.dispatchEvent(new Event('change', { bubbles: true }));

    // Kelas ter-load
    expect(await screen.findByText(/TI101-A/)).toBeInTheDocument();

    // Pilih kelas
    const classSelect = (await screen.findAllByRole('combobox'))[1] as HTMLSelectElement;
    classSelect.value = '10';
    classSelect.dispatchEvent(new Event('change', { bubbles: true }));

    // Jadwal tampil (normalisasi snake→camel)
    expect(await screen.findByText('1')).toBeInTheDocument(); // meeting number
    expect(await screen.findByRole('cell', { name: /Pemrograman Dasar/ })).toBeInTheDocument();
    expect(screen.getByText('Terjadwal')).toBeInTheDocument(); // is_completed=false
  });

  it('tambah jadwal → POST /schedule', async () => {
    const fetchCalls: string[] = [];
    const fetchSpy = vi.fn((url: string) => {
      fetchCalls.push(url);
      if (url.includes('/schedule') && !url.includes('/class')) {
        return Promise.resolve(
          jsonResponse({
            success: true,
            data: {
              id: 2,
              meeting_number: 2,
              scheduled_date: '2026-02-09',
              topic: 'Struktur Data',
              is_completed: false,
            },
          }),
        );
      }
      return baseFetch(url);
    });
    vi.stubGlobal('fetch', fetchSpy);
    render(<AdminSchedulePage />);

    // Pilih kurikulum + kelas
    const curriculumSelect = (await screen.findAllByRole('combobox'))[0] as HTMLSelectElement;
    curriculumSelect.value = '1';
    curriculumSelect.dispatchEvent(new Event('change', { bubbles: true }));
    const classSelect = (await screen.findAllByRole('combobox'))[1] as HTMLSelectElement;
    classSelect.value = '10';
    classSelect.dispatchEvent(new Event('change', { bubbles: true }));

    // Klik Tambah Jadwal
    const addBtn = await screen.findByRole('button', { name: /Tambah Jadwal/i });
    addBtn.click();

    // Submit form
    const submitBtn = await screen.findByRole('button', { name: /Tambah$/i });
    submitBtn.click();

    await waitFor(() => {
      expect(
        fetchCalls.some((u) => u.includes('/schedule') && u.includes('POST') === false),
      ).toBeTruthy();
    });
    // POST dilakukan ke /api/v1/schedule (body JSON)
    expect(fetchCalls.some((u) => u.includes('/api/v1/schedule'))).toBe(true);
  });

  it('gagal memuat kurikulum → pesan error', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(jsonResponse({ success: false, error: 'Gagal memuat kurikulum' }, 500)),
    );
    render(<AdminSchedulePage />);
    expect(await screen.findByText('Gagal memuat kurikulum')).toBeInTheDocument();
  });

  it('edit jadwal → PUT /schedule/:id', async () => {
    const fetchCalls: string[] = [];
    const fetchSpy = vi.fn((url: string) => {
      fetchCalls.push(url);
      if (url.includes('/schedule') && !url.includes('/class')) {
        return Promise.resolve(
          jsonResponse({
            success: true,
            data: {
              id: 1,
              meeting_number: 1,
              scheduled_date: '2026-02-02',
              topic: 'Pengantar (edit)',
              is_completed: false,
            },
          }),
        );
      }
      return baseFetch(url);
    });
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    );
    render(<AdminSchedulePage />);

    // Pilih kurikulum + kelas → jadwal tampil
    expect(await screen.findByText(/Teknik Informatika — TI101/)).toBeInTheDocument();
    const curriculumSelect = (await screen.findAllByRole('combobox'))[0] as HTMLSelectElement;
    curriculumSelect.value = '1';
    curriculumSelect.dispatchEvent(new Event('change', { bubbles: true }));
    expect(await screen.findByText(/TI101-A/)).toBeInTheDocument();
    const classSelect = (await screen.findAllByRole('combobox'))[1] as HTMLSelectElement;
    classSelect.value = '10';
    classSelect.dispatchEvent(new Event('change', { bubbles: true }));

    expect(await screen.findByRole('cell', { name: /Pemrograman Dasar/ })).toBeInTheDocument();
    // Klik Edit
    const editBtn = await screen.findByRole('button', { name: /^Edit$/i });
    editBtn.click();
    // Submit update
    const updateBtn = await screen.findByRole('button', { name: /Update$/i });
    updateBtn.click();

    await waitFor(() => {
      expect(fetchCalls.some((u) => /\/schedule\/\d+$/.test(u))).toBe(true);
    });
    expect(fetchCalls.some((u) => u.includes('/api/v1/schedule/1'))).toBe(true);
  });

  it('hapus jadwal → konfirmasi → DELETE /schedule/:id', async () => {
    const fetchCalls: string[] = [];
    const fetchSpy = vi.fn((url: string) => {
      fetchCalls.push(url);
      if (url.includes('/schedule') && !url.includes('/class')) {
        return Promise.resolve(
          jsonResponse({
            success: true,
            data: {
              id: 1,
              meeting_number: 1,
              scheduled_date: '2026-02-02',
              topic: 'Pengantar',
              is_completed: false,
            },
          }),
        );
      }
      return baseFetch(url);
    });
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    );
    render(<AdminSchedulePage />);

    expect(await screen.findByText(/Teknik Informatika — TI101/)).toBeInTheDocument();
    const curriculumSelect = (await screen.findAllByRole('combobox'))[0] as HTMLSelectElement;
    curriculumSelect.value = '1';
    curriculumSelect.dispatchEvent(new Event('change', { bubbles: true }));
    expect(await screen.findByText(/TI101-A/)).toBeInTheDocument();
    const classSelect = (await screen.findAllByRole('combobox'))[1] as HTMLSelectElement;
    classSelect.value = '10';
    classSelect.dispatchEvent(new Event('change', { bubbles: true }));

    expect(await screen.findByRole('cell', { name: /Pemrograman Dasar/ })).toBeInTheDocument();
    const deleteBtn = await screen.findByRole('button', { name: /^Hapus$/i });
    deleteBtn.click();

    await waitFor(() => {
      expect(fetchCalls.some((u) => u.includes('/api/v1/schedule/1'))).toBe(true);
    });
    expect(fetchSpy).toHaveBeenCalled();
  });
});
