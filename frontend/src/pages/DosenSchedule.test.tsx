import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DosenSchedule } from './DosenSchedule';
import * as api from '../lib/api';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, getMyClasses: vi.fn(), apiRequest: vi.fn() };
});

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 4, fullName: 'Dr. Budi Santoso', role: 'dosen' },
    booting: false,
    logout: vi.fn(),
  }),
}));

const mockedApi = vi.mocked(api);

const MY_CLASSES_RAW = [
  {
    id: 1,
    classCode: 'TI101-A',
    dayOfWeek: 1,
    startTime: '07:30',
    endTime: '09:00',
    room: 'A101',
    capacity: 30,
    currentEnrolled: 15,
    curriculumId: 101,
    semesterId: 1,
    semesterNumber: 1,
    semesterCode: '2025/2026-1',
    semesterName: 'Ganjil 2025/2026',
    courseCode: 'TI101',
    courseName: 'Dasar-Dasar Pemrograman',
    credits: 3,
    schedules: [
      {
        id: 11,
        meetingNumber: 1,
        scheduledDate: '2026-08-10',
        topic: 'Pengenalan',
        isCompleted: false,
      },
      { id: 12, meetingNumber: 2, scheduledDate: '2026-08-17', topic: null, isCompleted: true },
    ],
  },
  {
    id: 2,
    classCode: 'TI102-A',
    dayOfWeek: 3,
    startTime: '09:15',
    endTime: '10:45',
    room: 'B202',
    capacity: 30,
    currentEnrolled: 20,
    curriculumId: 102,
    semesterId: 1,
    semesterNumber: 1,
    semesterCode: '2025/2026-1',
    semesterName: 'Ganjil 2025/2026',
    courseCode: 'TI102',
    courseName: 'Struktur Data',
    credits: 3,
    schedules: [
      {
        id: 21,
        meetingNumber: 1,
        scheduledDate: '2026-08-12',
        topic: 'Array & Linked List',
        isCompleted: false,
      },
    ],
  },
];

describe('DosenSchedule (jadwal mengajar)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('render awal — header + Panel Kiri cards + Panel Kanan kalender', async () => {
    mockedApi.getMyClasses.mockResolvedValueOnce({ items: MY_CLASSES_RAW });

    render(<DosenSchedule />);

    expect(await screen.findByText('Dr. Budi Santoso')).toBeInTheDocument();
    expect(screen.getByText('Ganjil 2025/2026')).toBeInTheDocument();
    expect(screen.getByText('Disetujui')).toBeInTheDocument();

    // Panel Kiri
    expect(screen.getByText('Daftar Mata Kuliah')).toBeInTheDocument();
    // Name appears in card AND calendar block → use getAllByText
    expect(screen.getAllByText('Dasar-Dasar Pemrograman').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Struktur Data').length).toBeGreaterThanOrEqual(1);

    // Panel Kanan — calendar
    expect(screen.getByText('Jadwal Mingguan')).toBeInTheDocument();
    expect(screen.getByText('Senin–Sabtu • 07:00–18:00')).toBeInTheDocument();
  });

  it('kelas terjadwal → blok warna di kalender dengan info lengkap', async () => {
    mockedApi.getMyClasses.mockResolvedValueOnce({ items: MY_CLASSES_RAW });

    render(<DosenSchedule />);
    await screen.findByText('Dr. Budi Santoso');

    const block = document.querySelector('[title*="TI101-A"]');
    expect(block).toBeInTheDocument();
    expect(block?.textContent).toContain('Dasar-Dasar Pemrograman');
    expect(block?.textContent).toContain('07:30–09:00');

    const block2 = document.querySelector('[title*="TI102-A"]');
    expect(block2).toBeInTheDocument();
    expect(block2?.textContent).toContain('Struktur Data');
    expect(block2?.textContent).toContain('09:15–10:45');
  });

  it('kelas tanpa hari/jam → tidak ada blok di kalender, kartu merah', async () => {
    const withUnscheduled = [
      ...MY_CLASSES_RAW,
      {
        id: 3,
        classCode: 'TI103-A',
        dayOfWeek: null,
        startTime: null,
        endTime: null,
        room: null,
        capacity: 25,
        currentEnrolled: 0,
        curriculumId: 103,
        semesterId: 1,
        semesterNumber: 1,
        semesterCode: '2025/2026-1',
        semesterName: 'Ganjil 2025/2026',
        courseCode: 'TI103',
        courseName: 'Algoritma Pemrograman',
        credits: 3,
        schedules: [],
      },
    ];
    mockedApi.getMyClasses.mockResolvedValueOnce({ items: withUnscheduled });

    render(<DosenSchedule />);
    await screen.findByText('Dr. Budi Santoso');

    // Red dot on unscheduled card
    expect(screen.getAllByText('Belum Terjadwal').length).toBeGreaterThanOrEqual(1);

    // No calendar block for TI103 (no day/time = no block)
    expect(document.querySelector('[title*="TI103"]')).not.toBeInTheDocument();
  });

  it('grid header tampilkan hari Senin-Sabtu', async () => {
    mockedApi.getMyClasses.mockResolvedValueOnce({ items: MY_CLASSES_RAW });

    render(<DosenSchedule />);
    await screen.findByText('Dr. Budi Santoso');

    expect(screen.getByText('Senin')).toBeInTheDocument();
    expect(screen.getByText('Selasa')).toBeInTheDocument();
    expect(screen.getByText('Rabu')).toBeInTheDocument();
    expect(screen.getByText('Kamis')).toBeInTheDocument();
    expect(screen.getByText('Jumat')).toBeInTheDocument();
    expect(screen.getByText('Sabtu')).toBeInTheDocument();
  });

  it('klik kartu → selection berubah (ring highlight)', async () => {
    mockedApi.getMyClasses.mockResolvedValueOnce({ items: MY_CLASSES_RAW });

    render(<DosenSchedule />);
    await screen.findByText('Dr. Budi Santoso');

    // Click second card (name appears in card + calendar, so scope to button)
    const cardBtn = screen.getAllByText('Struktur Data')[0].closest('button')!;
    await userEvent.click(cardBtn);

    expect(cardBtn.className).toContain('border-primary-500');
  });

  it('load gagal → tampilkan error', async () => {
    mockedApi.getMyClasses.mockRejectedValueOnce(new Error('Network error'));
    render(<DosenSchedule />);

    expect(await screen.findByText('Gagal memuat jadwal mengajar')).toBeInTheDocument();
  });

  it('tidak ada kelas → pesan kosong', async () => {
    mockedApi.getMyClasses.mockResolvedValueOnce({ items: [] });
    render(<DosenSchedule />);

    expect(await screen.findByText('Belum ada kelas yang diampu.')).toBeInTheDocument();
    expect(screen.queryByText('Jadwal Mingguan')).not.toBeInTheDocument();
    expect(screen.queryByText('Beban Mengajar SKS')).not.toBeInTheDocument();
  });

  it('semua kelas tanpa jadwal → Draft + kalender kosong', async () => {
    const noSchedule = MY_CLASSES_RAW.map((c) => ({ ...c, schedules: [] }));
    mockedApi.getMyClasses.mockResolvedValueOnce({ items: noSchedule });

    render(<DosenSchedule />);
    await screen.findByText('Dr. Budi Santoso');

    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText(/belum dijadwalkan/)).toBeInTheDocument();
    expect(screen.getByText('Jadwal Mingguan')).toBeInTheDocument();

    // Classes still have day/time so blocks render — but 0 meetings badge shows "Belum"
    // Calendar blocks are based on dayOfWeek/startTime, not schedules.length
    // so they still appear for classes with assigned times
    const blocks = document.querySelectorAll('[title*="TI101"]');
    expect(blocks.length).toBeGreaterThanOrEqual(1);
  });
});
