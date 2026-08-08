import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { controlFor } from '../test/controls';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DosenSelectMK } from './DosenSelectMK';
import type { LecturerCourseAvailable } from '../lib/types';

function jsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

const COURSES: LecturerCourseAvailable[] = [
  {
    curriculumId: 101,
    courseCode: 'TI101',
    courseName: 'Dasar-Dasar Pemrograman',
    credits: 3,
    semesterNumber: 1,
    isMandatory: true,
    availableClasses: 2,
    selectionStatus: 'belum_diajukan',
    priority: null,
    notes: null,
  },
  {
    curriculumId: 102,
    courseCode: 'TI102',
    courseName: 'Struktur Data',
    credits: 3,
    semesterNumber: 2,
    isMandatory: true,
    availableClasses: 1,
    selectionStatus: 'disetujui',
    priority: 2,
    notes: null,
  },
];

describe('DosenSelectMK (T3.8)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('render awal — minta pilih semester sebelum menampilkan MK', () => {
    render(<DosenSelectMK />);
    expect(screen.getByText('Pilih Mata Kuliah')).toBeInTheDocument();
    expect(screen.getByText('Pilih semester untuk menampilkan daftar MK.')).toBeInTheDocument();
  });

  it('pilih semester → load MK dari API → render daftar + status', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(jsonResponse({ data: { items: COURSES } }));
    render(<DosenSelectMK />);

    await user.selectOptions(controlFor('Semester', 'select'), '1');
    expect(await screen.findByText('Dasar-Dasar Pemrograman')).toBeInTheDocument();
    expect(screen.getByText('TI102')).toBeInTheDocument();
    expect(screen.getByText('disetujui')).toBeInTheDocument();
    // URL benar (semesterId=1)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/dosen/courses/available?semesterId=1'),
      expect.any(Object),
    );
  });

  it('load MK gagal → tampilkan error', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      jsonResponse({ success: false, error: { code: 'INTERNAL', message: 'gagal' } }, 500),
    );
    render(<DosenSelectMK />);
    await user.selectOptions(controlFor('Semester', 'select'), '1');
    expect(await screen.findByRole('alert')).toHaveTextContent('Gagal memuat daftar MK');
  });

  it('search memfilter daftar MK', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(jsonResponse({ data: { items: COURSES } }));
    render(<DosenSelectMK />);
    await user.selectOptions(controlFor('Semester', 'select'), '1');
    await screen.findByText('Dasar-Dasar Pemrograman');

    await user.type(controlFor('Cari Mata Kuliah', 'input'), 'Struktur');
    expect(screen.queryByText('Dasar-Dasar Pemrograman')).not.toBeInTheDocument();
    expect(screen.getByText('Struktur Data')).toBeInTheDocument();

    await user.clear(screen.getByPlaceholderText('Cari berdasarkan nama atau kode MK'));
    await user.type(screen.getByPlaceholderText('Cari berdasarkan nama atau kode MK'), 'TI101');
    expect(screen.getByText('Dasar-Dasar Pemrograman')).toBeInTheDocument();
    expect(screen.queryByText('Struktur Data')).not.toBeInTheDocument();
  });

  it('submit tanpa pilih MK → error validasi lokal', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(jsonResponse({ data: { items: COURSES } }));
    render(<DosenSelectMK />);
    await user.selectOptions(controlFor('Semester', 'select'), '1');
    await screen.findByText('Dasar-Dasar Pemrograman');

    const btn = screen.getByRole('button', { name: /Ajukan 0 MK/ });
    expect(btn).toBeDisabled();
  });

  it('pilih MK lalu submit → POST /dosen/courses/select per MK + success', async () => {
    const user = userEvent.setup();
    const postBody: unknown[] = [];
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && String(url).includes('/dosen/courses/select')) {
        postBody.push(JSON.parse(String(init.body)));
        return Promise.resolve(
          jsonResponse({
            success: true,
            data: {
              id: 1,
              lecturerId: 7,
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
      return Promise.resolve(jsonResponse({ data: { items: COURSES } }));
    });
    render(<DosenSelectMK />);
    await user.selectOptions(controlFor('Semester', 'select'), '1');
    await screen.findByText('Dasar-Dasar Pemrograman');

    await user.click(screen.getAllByRole('checkbox')[0]);
    await user.click(screen.getByRole('button', { name: /Ajukan 1 MK/ }));

    expect(await screen.findByRole('status')).toHaveTextContent('1 MK berhasil diajukan');
    expect(postBody).toEqual([{ curriculumId: 101, priority: 1, notes: '' }]);
  });

  it('submit gagal VALIDATION_ERROR → tampilkan pesan API', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && String(url).includes('/dosen/courses/select')) {
        return Promise.resolve(
          jsonResponse(
            {
              success: false,
              error: {
                code: 'VALIDATION_ERROR',
                message: 'MK sudah pernah diajukan',
              },
            },
            400,
          ),
        );
      }
      return Promise.resolve(jsonResponse({ data: { items: COURSES } }));
    });
    render(<DosenSelectMK />);
    await user.selectOptions(controlFor('Semester', 'select'), '1');
    await screen.findByText('Dasar-Dasar Pemrograman');

    await user.click(screen.getAllByRole('checkbox')[0]);
    await user.click(screen.getByRole('button', { name: /Ajukan 1 MK/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('MK sudah pernah diajukan');
  });

  it('submit gagal non-validasi → pesan generik', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && String(url).includes('/dosen/courses/select')) {
        return Promise.resolve(
          jsonResponse({ success: false, error: { code: 'INTERNAL', message: 'x' } }, 500),
        );
      }
      return Promise.resolve(jsonResponse({ data: { items: COURSES } }));
    });
    render(<DosenSelectMK />);
    await user.selectOptions(controlFor('Semester', 'select'), '1');
    await screen.findByText('Dasar-Dasar Pemrograman');

    await user.click(screen.getAllByRole('checkbox')[0]);
    await user.click(screen.getByRole('button', { name: /Ajukan 1 MK/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Gagal mengajukan MK');
  });

  it('tampilkan checkbox dalam kartu MK dengan label Pilih/Dipilih', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(jsonResponse({ data: { items: COURSES } }));
    render(<DosenSelectMK />);
    await user.selectOptions(controlFor('Semester', 'select'), '1');
    await screen.findByText('Dasar-Dasar Pemrograman');

    const card = screen.getByText('Dasar-Dasar Pemrograman').closest('div.border');
    expect(card).not.toBeNull();
    const cb = within(card as HTMLElement).getByRole('checkbox');
    await user.click(cb);
    expect(within(card as HTMLElement).getByText('Dipilih')).toBeInTheDocument();
  });
});
