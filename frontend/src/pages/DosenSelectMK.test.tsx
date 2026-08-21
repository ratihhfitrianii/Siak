import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DosenSelectMK } from './DosenSelectMK';
import type { SemesterOption } from '../lib/types';

function jsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

const SEMESTERS: SemesterOption[] = [
  { id: 1, code: '2025/2026-1', name: 'Ganjil 2025/2026' },
  { id: 2, code: '2024/2025-2', name: 'Genap 2024/2025' },
];

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

const COURSES_RESPONSE = { success: true, data: { items: COURSES } };

describe('DosenSelectMK (T3.9 — semester dari /dosen/semesters + search 3 huruf)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('render — semester dari /dosen/semesters → MK langsung termuat (semester default yang terbaru)', async () => {
    const fetchCalls: string[] = [];
    fetchMock.mockImplementation((url: string) => {
      fetchCalls.push(url);
      if (String(url).includes('/dosen/semesters')) {
        return Promise.resolve(jsonResponse({ success: true, data: { items: SEMESTERS } }));
      }
      if (String(url).includes('/dosen/courses/available')) {
        return Promise.resolve(jsonResponse(COURSES_RESPONSE));
      }
      return Promise.resolve(jsonResponse({ success: true, data: { items: [] } }));
    });

    render(<DosenSelectMK />);

    expect(screen.getByText('Mata Kuliah Tersedia')).toBeInTheDocument();

    // Default semester should be the first one (latest)
    expect(await screen.findByText('Dasar-Dasar Pemrograman')).toBeInTheDocument();
    expect(screen.getByText('TI102')).toBeInTheDocument();
    expect(screen.getByText('disetujui')).toBeInTheDocument();

    // Verify semesters loaded then courses for semesterId=1
    expect(fetchCalls).toContainEqual(expect.stringContaining('/dosen/semesters'));
    expect(fetchCalls).toContainEqual(
      expect.stringContaining('/dosen/courses/available?semesterId=1'),
    );
  });

  it('ganti semester → load ulang MK untuk semester terpilih', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes('/dosen/semesters')) {
        return Promise.resolve(jsonResponse({ success: true, data: { items: SEMESTERS } }));
      }
      if (String(url).includes('/dosen/courses/available')) {
        // Return different courses based on semesterId in URL
        const u = String(url);
        if (u.includes('semesterId=2')) {
          return Promise.resolve(
            jsonResponse({
              success: true,
              data: {
                items: [
                  {
                    curriculum_id: 201,
                    course_code: 'TI201',
                    course_name: 'Pemrograman Lanjut',
                    credits: 3,
                    semester_number: 3,
                    is_mandatory: true,
                    available_classes: 1,
                    selection_status: 'belum_diajukan',
                    priority: null,
                    notes: null,
                  },
                ],
              },
            }),
          );
        }
        return Promise.resolve(jsonResponse(COURSES_RESPONSE));
      }
      return Promise.resolve(jsonResponse({ success: true, data: { items: [] } }));
    });

    render(<DosenSelectMK />);
    await screen.findByText('Dasar-Dasar Pemrograman');

    // Change semester to 2
    const select = screen.getByDisplayValue('Ganjil 2025/2026');
    await userEvent.selectOptions(select, '2');

    // Wait for reload
    expect(await screen.findByText('Pemrograman Lanjut')).toBeInTheDocument();
    expect(screen.queryByText('Dasar-Dasar Pemrograman')).not.toBeInTheDocument();
  });

  it('load semester gagal → error', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: false, error: { code: 'INTERNAL', message: 'gagal' } }, 500),
    );
    render(<DosenSelectMK />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Gagal memuat daftar semester');
  });

  it('load MK gagal → tampilkan error', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes('/dosen/semesters')) {
        return Promise.resolve(jsonResponse({ success: true, data: { items: SEMESTERS } }));
      }
      return Promise.resolve(
        jsonResponse({ success: false, error: { code: 'INTERNAL', message: 'gagal' } }, 500),
      );
    });
    render(<DosenSelectMK />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Gagal memuat daftar MK');
  });

  it('search 3 huruf minimal → debounced API call dengan query param search', async () => {
    const user = userEvent.setup();
    const fetchCalls: string[] = [];

    fetchMock.mockImplementation((url: string) => {
      fetchCalls.push(url);
      if (String(url).includes('/dosen/semesters')) {
        return Promise.resolve(jsonResponse({ success: true, data: { items: SEMESTERS } }));
      }
      if (String(url).includes('/dosen/courses/available')) {
        return Promise.resolve(jsonResponse(COURSES_RESPONSE));
      }
      return Promise.resolve(jsonResponse({ success: true, data: { items: [] } }));
    });

    render(<DosenSelectMK />);
    await screen.findByText('Dasar-Dasar Pemrograman');

    // Type 2 chars — should NOT trigger API yet (debounce + min 3 chars enforced by backend)
    await user.type(screen.getByPlaceholderText('Cari berdasarkan nama atau kode MK'), 'St');
    await waitFor(() =>
      expect(fetchCalls.filter((u) => u.includes('/dosen/courses/available'))).toHaveLength(1),
    );

    // Type 3rd char — should trigger debounced API call with search=Str
    await user.type(screen.getByPlaceholderText('Cari berdasarkan nama atau kode MK'), 'r');
    await waitFor(() =>
      expect(fetchCalls).toContainEqual(
        expect.stringContaining('/dosen/courses/available?semesterId=1&search=Str'),
      ),
    );
  });

  it('submit tanpa pilih MK → tombol disabled', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes('/dosen/semesters')) {
        return Promise.resolve(jsonResponse({ success: true, data: { items: SEMESTERS } }));
      }
      return Promise.resolve(jsonResponse(COURSES_RESPONSE));
    });
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
      if (u.includes('/dosen/semesters')) {
        return Promise.resolve(jsonResponse({ success: true, data: { items: SEMESTERS } }));
      }
      return Promise.resolve(jsonResponse(COURSES_RESPONSE));
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
      if (u.includes('/dosen/semesters')) {
        return Promise.resolve(jsonResponse({ success: true, data: { items: SEMESTERS } }));
      }
      return Promise.resolve(jsonResponse(COURSES_RESPONSE));
    });

    render(<DosenSelectMK />);
    await screen.findByText('Dasar-Dasar Pemrograman');

    await user.click(screen.getAllByRole('checkbox')[0]);
    await user.click(screen.getByRole('button', { name: /Ajukan 1 MK/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('MK sudah pernah diajukan');
  });

  it('checkbox dalam kartu MK dengan label Pilih/Dipilih', async () => {
    const user = userEvent.setup();

    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes('/dosen/semesters')) {
        return Promise.resolve(jsonResponse({ success: true, data: { items: SEMESTERS } }));
      }
      return Promise.resolve(jsonResponse(COURSES_RESPONSE));
    });

    render(<DosenSelectMK />);
    await screen.findByText('Dasar-Dasar Pemrograman');

    const card = screen.getByText('Dasar-Dasar Pemrograman').closest('div.border');
    expect(card).not.toBeNull();
    const cb = card!.querySelector('input[type="checkbox"]');
    expect(cb).not.toBeNull();
    await user.click(cb!);
    // Find the label span that says "Pilih" or "Dipilih"
    const labelSpan = card!.querySelector('label span');
    expect(labelSpan?.textContent).toContain('Dipilih');
  });

  it('toggle tampilan grid/list — tombol ikon mengubah layout', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes('/dosen/semesters')) {
        return Promise.resolve(jsonResponse({ success: true, data: { items: SEMESTERS } }));
      }
      return Promise.resolve(jsonResponse(COURSES_RESPONSE));
    });

    render(<DosenSelectMK />);
    await screen.findByText('Dasar-Dasar Pemrograman');

    // Default grid: ada 2 kolom (grid-cols-2 md:grid-cols-2)
    const gridContainer = screen.getByText('Dasar-Dasar Pemrograman').closest('.grid');
    expect(gridContainer).not.toBeNull();

    // Klik tombol list (ikon)
    const listBtn = screen.getByRole('button', { name: 'Tampilan list' });
    expect(listBtn).toBeInTheDocument();
    await user.click(listBtn);
    expect(listBtn).toHaveAttribute('aria-pressed', 'true');

    // Setelah list: kartu tidak lagi di dalam container .grid
    const afterGrid = screen.getByText('Dasar-Dasar Pemrograman').closest('.grid');
    expect(afterGrid).toBeNull();

    // Kembali ke grid
    const gridBtn = screen.getByRole('button', { name: 'Tampilan grid' });
    await user.click(gridBtn);
    expect(screen.getByText('Dasar-Dasar Pemrograman').closest('.grid')).not.toBeNull();
  });

  it('MK dengan status disetujui/diajukan → checkbox disabled + label "Sudah diajukan"', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes('/dosen/semesters')) {
        return Promise.resolve(jsonResponse({ success: true, data: { items: SEMESTERS } }));
      }
      return Promise.resolve(jsonResponse(COURSES_RESPONSE));
    });

    render(<DosenSelectMK />);
    await screen.findByText('Dasar-Dasar Pemrograman');

    // TI102 (disetujui) muncul HANYA di section "Sudah Diajukan" (tidak di grid selectable)
    expect(screen.getAllByText('Struktur Data')).toHaveLength(1);

    // Grid selectable tetap berisi MK belum_diajukan dengan 1 checkbox
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(1); // hanya Dasar-Dasar Pemrograman yang selectable

    // Muncul di section "Mata Kuliah Sudah Diajukan" dengan badge disetujui
    const submittedHeading = screen.getByText(/Mata Kuliah Sudah Diajukan \(1\)/);
    expect(submittedHeading).toBeInTheDocument();
    const submittedSection = submittedHeading.closest('div.border-t') as HTMLElement;
    expect(submittedSection.textContent).toContain('Struktur Data');
    expect(submittedSection.textContent).toContain('disetujui');
    // Tidak ada checkbox di section submitted (sudah tidak bisa dipilih)
    expect(submittedSection.querySelector('input[type="checkbox"]')).toBeNull();

    // Tombol submit tetap disabled karena belum ada yang dipilih
    expect(screen.getByRole('button', { name: /Ajukan 0 MK/ })).toBeDisabled();
  });
});
