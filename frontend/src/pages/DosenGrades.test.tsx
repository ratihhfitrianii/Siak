import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DosenGrades } from './DosenGrades';
import type { GradeClassItem } from '../lib/types';

function jsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

const MY_CLASSES = {
  items: [
    {
      id: 1,
      classCode: 'TI101-A',
      dayOfWeek: 1,
      startTime: '07:30',
      endTime: '09:00',
      room: 'R.101',
      capacity: 40,
      currentEnrolled: 1,
      curriculumId: 10,
      semesterId: 1,
      semesterNumber: 1,
      courseCode: 'TI101',
      courseName: 'Dasar-Dasar Pemrograman',
      credits: 3,
      schedules: [],
    },
    {
      id: 2,
      classCode: 'TI101-B',
      dayOfWeek: 2,
      startTime: '10:00',
      endTime: '11:30',
      room: 'R.102',
      capacity: 40,
      currentEnrolled: 1,
      curriculumId: 10,
      semesterId: 1,
      semesterNumber: 1,
      courseCode: 'TI101',
      courseName: 'Dasar-Dasar Pemrograman',
      credits: 3,
      schedules: [],
    },
    {
      id: 3,
      classCode: 'TI202-A',
      dayOfWeek: 3,
      startTime: '13:00',
      endTime: '14:30',
      room: 'R.201',
      capacity: 35,
      currentEnrolled: 0,
      curriculumId: 20,
      semesterId: 1,
      semesterNumber: 3,
      courseCode: 'TI202',
      courseName: 'Struktur Data',
      credits: 3,
      schedules: [],
    },
  ],
};

const GRADE_ITEMS: GradeClassItem[] = [
  {
    id: 51,
    krsItemId: 501,
    tugasScore: 80,
    utsScore: 70,
    uasScore: 60,
    finalScore: null,
    gradeLetter: null,
    gradePoint: null,
    remedialTugasScore: null,
    remedialUtsScore: 90,
    remedialUasScore: null,
    inputBy: 4,
    inputAt: '2026-08-01T00:00:00Z',
    updatedBy: null,
    updatedAt: null,
    student: { nim: '2023110001', name: 'Budi Santoso' },
  },
];

// Kelas paralel TI101-B — mahasiswa beda, digabung dalam satu tabel saat MK TI101 dipilih
const GRADE_ITEMS_B: GradeClassItem[] = [
  {
    id: 52,
    krsItemId: 502,
    tugasScore: null,
    utsScore: null,
    uasScore: null,
    finalScore: null,
    gradeLetter: null,
    gradePoint: null,
    remedialTugasScore: null,
    remedialUtsScore: null,
    remedialUasScore: null,
    inputBy: 4,
    inputAt: '2026-08-01T00:00:00Z',
    updatedBy: null,
    updatedAt: null,
    student: { nim: '2023110002', name: 'Siti Aminah' },
  },
];

describe('DosenGrades (T3.8)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    fetchMock.mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes('/dosen/my-classes')) {
        return Promise.resolve(jsonResponse({ data: MY_CLASSES }));
      }
      if (u.includes('/grades/class/1')) {
        return Promise.resolve(
          jsonResponse({
            data: {
              class: {
                id: 1,
                classCode: 'TI101-A',
                courseCode: 'TI101',
                courseName: 'Dasar-Dasar Pemrograman',
              },
              items: GRADE_ITEMS,
            },
          }),
        );
      }
      if (u.includes('/grades/class/2')) {
        return Promise.resolve(
          jsonResponse({
            data: {
              class: {
                id: 2,
                classCode: 'TI101-B',
                courseCode: 'TI101',
                courseName: 'Dasar-Dasar Pemrograman',
              },
              items: GRADE_ITEMS_B,
            },
          }),
        );
      }
      return Promise.resolve(jsonResponse({ data: { items: [] } }));
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('render — dropdown digabung per mata kuliah dari getMyClasses', async () => {
    render(<DosenGrades />);
    expect(screen.getByText('Form Nilai')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Simpan Nilai' })).not.toBeInTheDocument();
    // Kelas paralel TI101-A & TI101-B digabung → hanya 1 opsi "Dasar-Dasar Pemrograman (TI101)"
    await screen.findByText('Dasar-Dasar Pemrograman (TI101)');
    const options = screen
      .getByLabelText('Mata Kuliah / Kelas')
      .querySelectorAll('option:not([value=""])');
    expect(options.length).toBe(2); // TI101 (gabungan A+B) + TI202
  });

  it('pilih MK → kelas paralel digabung: load nilai A+B dalam satu tabel + kolom Kelas', async () => {
    const user = userEvent.setup();
    render(<DosenGrades />);
    await screen.findByText('Dasar-Dasar Pemrograman (TI101)');

    await user.selectOptions(screen.getByLabelText('Mata Kuliah / Kelas'), 'TI101');
    expect(await screen.findByText('Budi Santoso')).toBeInTheDocument();
    // Mahasiswa dari kelas paralel B ikut termuat dalam tabel yang sama
    expect(screen.getByText('Siti Aminah')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/grades/class/1'),
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/grades/class/2'),
      expect.any(Object),
    );
    // Kolom Kelas membedakan seksi asal
    expect(screen.getByText('TI101-A')).toBeInTheDocument();
    expect(screen.getByText('TI101-B')).toBeInTheDocument();

    // Final = max(80, -) * 0.2 + max(70, 90) * 0.3 + max(60, -) * 0.5 = 16 + 27 + 30 = 73
    expect(screen.getByText('73')).toBeInTheDocument();
    expect(screen.getByText('90')).toBeInTheDocument();
  });

  it('load nilai gagal → error', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes('/dosen/my-classes')) {
        return Promise.resolve(jsonResponse({ data: MY_CLASSES }));
      }
      return Promise.resolve(
        jsonResponse({ success: false, error: { code: 'INTERNAL', message: 'x' } }, 500),
      );
    });
    render(<DosenGrades />);
    await screen.findByText('Dasar-Dasar Pemrograman (TI101)');
    await user.selectOptions(screen.getByLabelText('Mata Kuliah / Kelas'), 'TI101');
    expect(await screen.findByRole('alert')).toHaveTextContent('Gagal memuat data nilai');
  });

  it('kelas tanpa nilai → pesan kosong', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes('/dosen/my-classes')) {
        return Promise.resolve(jsonResponse({ data: MY_CLASSES }));
      }
      if (u.includes('/grades/class/1')) {
        return Promise.resolve(
          jsonResponse({
            data: {
              class: { id: 1, classCode: 'TI101-A', courseCode: 'TI101', courseName: 'x' },
              items: [],
            },
          }),
        );
      }
      return Promise.resolve(jsonResponse({ data: { items: [] } }));
    });
    render(<DosenGrades />);
    await screen.findByText('Dasar-Dasar Pemrograman (TI101)');
    await user.selectOptions(screen.getByLabelText('Mata Kuliah / Kelas'), 'TI101');
    expect(
      await screen.findByText('Belum ada mahasiswa terdaftar di mata kuliah ini.'),
    ).toBeInTheDocument();
  });

  it('edit skor → submit → PUT /grades/:id + success + reload', async () => {
    const user = userEvent.setup();
    const putBodies: unknown[] = [];
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const u = String(url);
      if (init?.method === 'PUT' && u.includes('/grades/')) {
        putBodies.push(JSON.parse(String(init.body)));
        return Promise.resolve(jsonResponse({ success: true, data: { id: 52 } }));
      }
      if (u.includes('/dosen/my-classes')) {
        return Promise.resolve(jsonResponse({ data: MY_CLASSES }));
      }
      if (u.includes('/grades/class/1')) {
        return Promise.resolve(
          jsonResponse({
            data: {
              class: {
                id: 1,
                classCode: 'TI101-A',
                courseCode: 'TI101',
                courseName: 'Dasar-Dasar Pemrograman',
              },
              items: GRADE_ITEMS,
            },
          }),
        );
      }
      return Promise.resolve(jsonResponse({ data: { items: [] } }));
    });
    render(<DosenGrades />);
    await screen.findByText('Dasar-Dasar Pemrograman (TI101)');
    await user.selectOptions(screen.getByLabelText('Mata Kuliah / Kelas'), 'TI101');
    await screen.findByText('Budi Santoso');

    const utsInput = screen.getByDisplayValue('70');
    await user.clear(utsInput);
    await user.type(utsInput, '85');

    await user.click(screen.getByRole('button', { name: 'Simpan Nilai' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Nilai berhasil disimpan');
    expect(putBodies).toEqual([
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
      const u = String(url);
      if (init?.method === 'PUT' && u.includes('/grades/')) {
        return Promise.resolve(
          jsonResponse(
            { success: false, error: { code: 'VALIDATION_ERROR', message: 'Skor > 100' } },
            400,
          ),
        );
      }
      if (u.includes('/dosen/my-classes')) {
        return Promise.resolve(jsonResponse({ data: MY_CLASSES }));
      }
      if (u.includes('/grades/class/1')) {
        return Promise.resolve(
          jsonResponse({
            data: {
              class: { id: 1, classCode: 'TI101-A', courseCode: 'TI101', courseName: 'x' },
              items: GRADE_ITEMS,
            },
          }),
        );
      }
      return Promise.resolve(jsonResponse({ data: { items: [] } }));
    });
    render(<DosenGrades />);
    await screen.findByText('Dasar-Dasar Pemrograman (TI101)');
    await user.selectOptions(screen.getByLabelText('Mata Kuliah / Kelas'), 'TI101');
    await screen.findByText('Budi Santoso');

    await user.click(screen.getByRole('button', { name: 'Simpan Nilai' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Skor > 100');
  });

  it('semua skor kosong → final tampil "-"', async () => {
    const user = userEvent.setup();
    const emptyScores: GradeClassItem = {
      ...GRADE_ITEMS[0],
      tugasScore: null,
      utsScore: null,
      uasScore: null,
      remedialTugasScore: null,
      remedialUtsScore: null,
      remedialUasScore: null,
    };
    fetchMock.mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes('/dosen/my-classes')) {
        return Promise.resolve(jsonResponse({ data: MY_CLASSES }));
      }
      if (u.includes('/grades/class/1')) {
        return Promise.resolve(
          jsonResponse({
            data: {
              class: { id: 1, classCode: 'TI101-A', courseCode: 'TI101', courseName: 'x' },
              items: [emptyScores],
            },
          }),
        );
      }
      return Promise.resolve(jsonResponse({ data: { items: [] } }));
    });
    render(<DosenGrades />);
    await screen.findByText('Dasar-Dasar Pemrograman (TI101)');
    await user.selectOptions(screen.getByLabelText('Mata Kuliah / Kelas'), 'TI101');
    expect(await screen.findByText('Budi Santoso')).toBeInTheDocument();
    expect(screen.getAllByText('-').length).toBeGreaterThanOrEqual(1);
  });
});
