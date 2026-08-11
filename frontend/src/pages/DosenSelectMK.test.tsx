import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { controlFor } from '../test/controls';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DosenSelectMK } from './DosenSelectMK';

function jsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

const PERIOD_OPEN = {
  id: 1,
  semesterId: 1,
  semesterCode: '2025/2026-1',
  name: 'Ganjil 2025/2026',
  startDate: null,
  endDate: null,
  isRevision: false,
  status: 'open',
};

const COURSES = [
  {
    curriculum_id: 101,
    course_code: 'TI101',
    course_name: 'Dasar-Dasar Pemrograman',
    credits: 3,
    semester_number: 1,
    is_mandatory: true,
    available_classes: 2,
    selection_status: 'belum_diajukan',
    priority: null,
    notes: null,
  },
  {
    curriculum_id: 102,
    course_code: 'TI102',
    course_name: 'Struktur Data',
    credits: 3,
    semester_number: 2,
    is_mandatory: true,
    available_classes: 1,
    selection_status: 'disetujui',
    priority: 2,
    notes: null,
  },
];

describe('DosenSelectMK (T3.8)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    fetchMock.mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes('/krs/period')) {
        return Promise.resolve(jsonResponse({ data: PERIOD_OPEN }));
      }
      if (u.includes('/dosen/courses/available')) {
        return Promise.resolve(jsonResponse({ data: COURSES }));
      }
      return Promise.resolve(jsonResponse({ data: [] }));
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('render — semester aktif dari /krs/period → MK langsung termuat', async () => {
    render(<DosenSelectMK />);
    expect(screen.getByText('Pilih Mata Kuliah')).toBeInTheDocument();

    expect(await screen.findByText('Dasar-Dasar Pemrograman')).toBeInTheDocument();
    expect(screen.getByText('TI102')).toBeInTheDocument();
    expect(screen.getByText('disetujui')).toBeInTheDocument();
    // URL benar (semesterId aktif = 1) — tanpa interaksi user
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/dosen/courses/available?semesterId=1'),
      expect.any(Object),
    );
    // Dropdown semester berisi periode aktif saja
    expect(controlFor('Semester', 'select')).toHaveValue('1');
  });

  it('periode tidak buka → pesan tidak ada periode aktif', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes('/krs/period')) {
        return Promise.resolve(jsonResponse({ data: { ...PERIOD_OPEN, status: 'closed' } }));
      }
      return Promise.resolve(jsonResponse({ data: { items: [] } }));
    });
    render(<DosenSelectMK />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Tidak ada periode KRS yang sedang buka',
    );
  });

  it('load periode gagal → error', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: false, error: { code: 'INTERNAL', message: 'gagal' } }, 500),
    );
    render(<DosenSelectMK />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Gagal memuat periode aktif');
  });

  it('load MK gagal → tampilkan error', async () => {
    fetchMock.mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes('/krs/period')) {
        return Promise.resolve(jsonResponse({ data: PERIOD_OPEN }));
      }
      return Promise.resolve(
        jsonResponse({ success: false, error: { code: 'INTERNAL', message: 'gagal' } }, 500),
      );
    });
    render(<DosenSelectMK />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Gagal memuat daftar MK');
  });

  it('search memfilter daftar MK (debounced API call) dan mengirim query param search)', async () => {
    const user = userEvent.setup();
    render(<DosenSelectMK />);
    await screen.findByText('Dasar-Dasar Pemrograman');

    // Type search term - this triggers debounced API call
    await user.type(controlFor('Cari Mata Kuliah', 'input'), 'Struktur');

    // Wait for debounced search to complete (300ms + API call)
    await new Promise((r) => setTimeout(r, 400));

    // Verify fetch called with search param
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/dosen/courses/available?semesterId=1&search=Struktur'),
      expect.any(Object),
    );

    // UI still shows courses (mock returns all) – focus is on debounce behavior
    expect(screen.getByText('Struktur Data')).toBeInTheDocument();
    expect(screen.getByText('Dasar-Dasar Pemrograman')).toBeInTheDocument();

    // Clear search
    await user.clear(screen.getByPlaceholderText('Cari berdasarkan nama atau kode MK'));
    await new Promise((r) => setTimeout(r, 400));
    // After clearing, fetch should be called without search param
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/dosen/courses/available?semesterId=1'),
      expect.any(Object),
    );
    expect(screen.getByText('Dasar-Dasar Pemrograman')).toBeInTheDocument();
  });

  it('submit tanpa pilih MK → tombol disabled', async () => {
    render(<DosenSelectMK />);
    await screen.findByText('Dasar-Dasar Pemrograman');
    expect(screen.getByRole('button', { name: /Ajukan 0 MK/ })).toBeDisabled();
  });

  it('pilih MK lalu submit → POST /dosen/courses/select per MK + success', async () => {
    const user = userEvent.setup();
    const postBody: unknown[] = [];
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const u = String(url);
      if (init?.method === 'POST' && u.includes('/dosen/courses/select')) {
        postBody.push(JSON.parse(String(init.body)));
        return Promise.resolve(
          jsonResponse({
            success: true,
            data: {
              id: 1,
              lecturerId: 4,
              semesterId: 1,
              curriculumId: 101,
              status: 'diajukan',
              priority: 1,
              notes: null,
              createdAt: '2026-08-08T00:00:00Z',
              updatedAt: '2026-08-08T00:00:00Z',
            },
          }),
        );
      }
      if (u.includes('/krs/period')) {
        return Promise.resolve(jsonResponse({ data: PERIOD_OPEN }));
      }
      return Promise.resolve(jsonResponse({ data: COURSES }));
    });
    render(<DosenSelectMK />);
    await screen.findByText('Dasar-Dasar Pemrograman');

    await user.click(screen.getAllByRole('checkbox')[0]);
    await user.click(screen.getByRole('button', { name: /Ajukan 1 MK/ }));

    expect(await screen.findByRole('status')).toHaveTextContent('1 MK berhasil diajukan');
    expect(postBody).toEqual([{ curriculumId: 101, priority: 1, notes: '' }]);
  });

  it('submit gagal VALIDATION_ERROR → tampilkan pesan API', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const u = String(url);
      if (init?.method === 'POST' && u.includes('/dosen/courses/select')) {
        return Promise.resolve(
          jsonResponse(
            {
              success: false,
              error: { code: 'VALIDATION_ERROR', message: 'MK sudah pernah diajukan' },
            },
            400,
          ),
        );
      }
      if (u.includes('/krs/period')) {
        return Promise.resolve(jsonResponse({ data: PERIOD_OPEN }));
      }
      return Promise.resolve(jsonResponse({ data: COURSES }));
    });
    render(<DosenSelectMK />);
    await screen.findByText('Dasar-Dasar Pemrograman');

    await user.click(screen.getAllByRole('checkbox')[0]);
    await user.click(screen.getByRole('button', { name: /Ajukan 1 MK/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('MK sudah pernah diajukan');
  });

  it('tampilkan checkbox dalam kartu MK dengan label Pilih/Dipilih', async () => {
    const user = userEvent.setup();
    render(<DosenSelectMK />);
    await screen.findByText('Dasar-Dasar Pemrograman');

    const card = screen.getByText('Dasar-Dasar Pemrograman').closest('div.border');
    expect(card).not.toBeNull();
    const cb = within(card as HTMLElement).getByRole('checkbox');
    await user.click(cb);
    expect(within(card as HTMLElement).getByText('Dipilih')).toBeInTheDocument();
  });
});
