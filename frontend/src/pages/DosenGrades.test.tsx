import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { controlFor } from '../test/controls';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DosenGrades } from './DosenGrades';
import type { GradeItem } from '../lib/types';

function jsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

const GRADE_ITEMS: GradeItem[] = [
  {
    id: 51,
    krsItemId: 501,
    classId: 1,
    classCode: 'TI101-A',
    course: { code: 'TI101', name: 'Dasar-Dasar Pemrograman', credits: 3 },
    period: '2024/2025-1',
    semester: 'Ganjil 2024/2025',
    tugasScore: 80,
    utsScore: 70,
    uasScore: 60,
    finalScore: null,
    gradeLetter: null,
    gradePoint: null,
    isRemedial: false,
    remedialScore: null,
    inputBy: 7,
    inputAt: '2026-08-01T00:00:00Z',
    updatedBy: null,
    updatedAt: null,
    remedialTugasScore: null,
    remedialUtsScore: 90,
    remedialUasScore: null,
    nim: '2023110001',
    studentName: 'Budi Santoso',
  },
];

describe('DosenGrades (T3.8)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('render awal — tanpa kelas terpilih', () => {
    render(<DosenGrades />);
    expect(screen.getByText('Input Nilai')).toBeInTheDocument();
    expect(screen.queryByText('Simpan Nilai')).not.toBeInTheDocument();
  });

  it('pilih kelas → load nilai → render tabel + nilai akhir (max asli/remedial)', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(jsonResponse({ data: { items: GRADE_ITEMS } }));
    render(<DosenGrades />);

    await user.selectOptions(controlFor('Mata Kuliah / Kelas', 'select'), '1');
    expect(await screen.findByText('Budi Santoso')).toBeInTheDocument();
    expect(screen.getByText('2023110001')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/grades/class/1'),
      expect.any(Object),
    );

    // Final = max(80, -) * 0.2 + max(70, 90) * 0.3 + max(60, -) * 0.5
    //        = 16 + 27 + 30 = 73
    expect(screen.getByText('73')).toBeInTheDocument();
    // Remedial UTS 90 ditampilkan
    expect(screen.getByText('90')).toBeInTheDocument();
  });

  it('load nilai gagal → error', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      jsonResponse({ success: false, error: { code: 'INTERNAL', message: 'x' } }, 500),
    );
    render(<DosenGrades />);
    await user.selectOptions(controlFor('Mata Kuliah / Kelas', 'select'), '1');
    expect(await screen.findByRole('alert')).toHaveTextContent('Gagal memuat data nilai');
  });

  it('kelas tanpa nilai → pesan kosong', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(jsonResponse({ data: { items: [] } }));
    render(<DosenGrades />);
    await user.selectOptions(controlFor('Mata Kuliah / Kelas', 'select'), '2');
    expect(
      await screen.findByText('Belum ada mahasiswa terdaftar di kelas ini.'),
    ).toBeInTheDocument();
  });

  it('edit skor → submit → POST /grades per mahasiswa + success', async () => {
    const user = userEvent.setup();
    const postBodies: unknown[] = [];
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && String(url).endsWith('/grades')) {
        postBodies.push(JSON.parse(String(init.body)));
        return Promise.resolve(jsonResponse({ success: true, data: GRADE_ITEMS[0] }));
      }
      return Promise.resolve(jsonResponse({ data: { items: GRADE_ITEMS } }));
    });
    render(<DosenGrades />);
    await user.selectOptions(controlFor('Mata Kuliah / Kelas', 'select'), '1');
    await screen.findByText('Budi Santoso');

    // Ubah skor UTS dari 70 → 85 (remedial 90 tetap dipakai utk final display)
    const utsInput = screen.getByDisplayValue('70');
    await user.clear(utsInput);
    await user.type(utsInput, '85');

    await user.click(screen.getByRole('button', { name: 'Simpan Nilai' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Nilai berhasil disimpan');
    expect(postBodies).toEqual([
      {
        krsItemId: 501,
        tugasScore: 80,
        utsScore: 85,
        uasScore: 60,
        remedialTugasScore: null,
        remedialUtsScore: 90,
        remedialUasScore: null,
      },
    ]);
  });

  it('submit VALIDATION_ERROR → pesan API', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && String(url).endsWith('/grades')) {
        return Promise.resolve(
          jsonResponse(
            { success: false, error: { code: 'VALIDATION_ERROR', message: 'Skor > 100' } },
            400,
          ),
        );
      }
      return Promise.resolve(jsonResponse({ data: { items: GRADE_ITEMS } }));
    });
    render(<DosenGrades />);
    await user.selectOptions(controlFor('Mata Kuliah / Kelas', 'select'), '1');
    await screen.findByText('Budi Santoso');

    await user.click(screen.getByRole('button', { name: 'Simpan Nilai' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Skor > 100');
  });

  it('submit gagal non-validasi → pesan generik', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && String(url).endsWith('/grades')) {
        return Promise.resolve(
          jsonResponse({ success: false, error: { code: 'INTERNAL', message: 'x' } }, 500),
        );
      }
      return Promise.resolve(jsonResponse({ data: { items: GRADE_ITEMS } }));
    });
    render(<DosenGrades />);
    await user.selectOptions(controlFor('Mata Kuliah / Kelas', 'select'), '1');
    await screen.findByText('Budi Santoso');

    await user.click(screen.getByRole('button', { name: 'Simpan Nilai' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Gagal menyimpan nilai');
  });

  it('semua skor kosong (0) → final tampil "-"', async () => {
    const user = userEvent.setup();
    const emptyScores: GradeItem = {
      ...GRADE_ITEMS[0],
      tugasScore: null,
      utsScore: null,
      uasScore: null,
      remedialTugasScore: null,
      remedialUtsScore: null,
      remedialUasScore: null,
    };
    fetchMock.mockResolvedValue(jsonResponse({ data: { items: [emptyScores] } }));
    render(<DosenGrades />);
    await user.selectOptions(controlFor('Mata Kuliah / Kelas', 'select'), '1');
    expect(await screen.findByText('Budi Santoso')).toBeInTheDocument();
    // Nilai akhir "-" (bukan 0)
    expect(screen.getAllByText('-').length).toBeGreaterThanOrEqual(1);
  });
});
