import { render, screen, waitFor } from '@testing-library/react';
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
      {
        id: 12,
        meetingNumber: 2,
        scheduledDate: '2026-08-17',
        topic: null,
        isCompleted: true,
      },
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

  it('render awal — header ringkasan + Panel Kiri cards + Panel Kanan auto-select kelas pertama', async () => {
    mockedApi.getMyClasses.mockResolvedValueOnce({ items: MY_CLASSES_RAW });

    render(<DosenSchedule />);

    // Header identity
    expect(await screen.findByText('Dr. Budi Santoso')).toBeInTheDocument();
    expect(screen.getByText('Ganjil 2025/2026')).toBeInTheDocument();

    // SKS progress
    expect(screen.getByText(/Beban Mengajar SKS/)).toBeInTheDocument();
    expect(screen.getByText(/6\/6 SKS terjadwal/)).toBeInTheDocument();

    // Status badge — all scheduled → Disetujui
    expect(screen.getByText('Disetujui')).toBeInTheDocument();

    // Panel Kiri heading
    expect(screen.getByText('Daftar Mata Kuliah')).toBeInTheDocument();

    // Both class cards visible in Panel Kiri (name appears in card + detail panel)
    expect(screen.getAllByText('Dasar-Dasar Pemrograman').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Struktur Data').length).toBeGreaterThanOrEqual(1);

    // Panel Kanan: first class auto-selected, shows detail (async — useEffect sets selection)
    expect(await screen.findByText('Daftar Pertemuan')).toBeInTheDocument();
    expect(screen.getByText('Pengenalan')).toBeInTheDocument();
  });

  it('klik kartu kelas kedua → Panel Kanan tampilkan data kelas itu', async () => {
    mockedApi.getMyClasses.mockResolvedValueOnce({ items: MY_CLASSES_RAW });

    render(<DosenSchedule />);
    await screen.findByText('Dr. Budi Santoso');

    // Click second class card
    await userEvent.click(screen.getByText('Struktur Data'));

    await waitFor(() => {
      expect(screen.getByText('Array & Linked List')).toBeInTheDocument();
    });
    // Should show Struktur Data detail, not TI101
    expect(screen.getByText('TI102 • 3 SKS • Kelas TI102-A')).toBeInTheDocument();
  });

  it('kelas belum terjadwal — kartu merah, tombol Atur Jadwal di Panel Kanan', async () => {
    const withUnscheduled = [
      ...MY_CLASSES_RAW,
      {
        id: 3,
        classCode: 'TI103-A',
        dayOfWeek: 2,
        startTime: '13:00',
        endTime: '14:30',
        room: 'C303',
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

    // Card shows "Belum Terjadwal" warning
    expect(screen.getAllByText('Belum Terjadwal').length).toBeGreaterThanOrEqual(1);

    // Click the unscheduled class card
    await userEvent.click(screen.getByText('Algoritma Pemrograman'));

    await waitFor(() => {
      // Panel Kanan shows "Belum ada jadwal pertemuan"
      expect(screen.getByText('Belum ada jadwal pertemuan')).toBeInTheDocument();
    });

    // "Atur Jadwal" button visible in Panel Kanan
    expect(screen.getByRole('button', { name: /Atur Jadwal/i })).toBeInTheDocument();
  });

  it('kelas terjadwal — Panel Kanan tampilkan tabel pertemuan dengan status', async () => {
    mockedApi.getMyClasses.mockResolvedValueOnce({ items: MY_CLASSES_RAW });

    render(<DosenSchedule />);
    await screen.findByText('Dr. Budi Santoso');

    // First class auto-selected, should show meeting table (async useEffect)
    expect(await screen.findByText('Daftar Pertemuan')).toBeInTheDocument();
    expect(screen.getByText('Pengenalan')).toBeInTheDocument();
    expect(screen.getByText('Terjadwal')).toBeInTheDocument();
    expect(screen.getByText('Selesai')).toBeInTheDocument();

    // Badge shows "2 Pertemuan Terjadwal"
    expect(screen.getByText('2 Pertemuan Terjadwal')).toBeInTheDocument();
  });

  it('load gagal → tampilkan error', async () => {
    mockedApi.getMyClasses.mockRejectedValueOnce(new Error('Network error'));
    render(<DosenSchedule />);

    expect(await screen.findByText('Gagal memuat jadwal mengajar')).toBeInTheDocument();
  });

  it('tidak ada kelas → pesan kosong, tanpa panel', async () => {
    mockedApi.getMyClasses.mockResolvedValueOnce({ items: [] });
    render(<DosenSchedule />);

    expect(await screen.findByText('Belum ada kelas yang diampu.')).toBeInTheDocument();
    expect(screen.queryByText('Daftar Mata Kuliah')).not.toBeInTheDocument();
    expect(screen.queryByText('Beban Mengajar SKS')).not.toBeInTheDocument();
  });

  it('belum ada jadwal sama sekali → status Draft', async () => {
    const noSchedule = MY_CLASSES_RAW.map((c) => ({ ...c, schedules: [] }));
    mockedApi.getMyClasses.mockResolvedValueOnce({ items: noSchedule });

    render(<DosenSchedule />);
    await screen.findByText('Dr. Budi Santoso');

    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText(/belum dijadwalkan/)).toBeInTheDocument();
  });

  it('warna kartu — scheduled hijau dot, unscheduled merah dot', async () => {
    const mixed = [
      {
        ...MY_CLASSES_RAW[0],
        schedules: [
          {
            id: 99,
            meetingNumber: 1,
            scheduledDate: '2026-09-01',
            topic: 'Test',
            isCompleted: false,
          },
        ],
      },
      { ...MY_CLASSES_RAW[1], schedules: [] },
    ];
    mockedApi.getMyClasses.mockResolvedValueOnce({ items: mixed });

    render(<DosenSchedule />);
    await screen.findByText('Dr. Budi Santoso');

    // Both dot classes should be present — green (bg-green-500) and red (bg-red-500)
    const greenDots = document.querySelectorAll('.bg-green-500');
    const redDots = document.querySelectorAll('.bg-red-500');
    expect(greenDots.length).toBeGreaterThanOrEqual(1);
    expect(redDots.length).toBeGreaterThanOrEqual(1);
  });
});
