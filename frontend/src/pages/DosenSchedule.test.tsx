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

  it('render awal — header ringkasan + daftar kelas', async () => {
    mockedApi.getMyClasses.mockResolvedValueOnce({ items: MY_CLASSES_RAW });

    render(<DosenSchedule />);

    // Header identity
    expect(await screen.findByText('Dr. Budi Santoso')).toBeInTheDocument();
    expect(screen.getByText('Ganjil 2025/2026')).toBeInTheDocument();

    // SKS progress — both classes have schedules, so 6/6 = all scheduled
    expect(screen.getByText(/Beban Mengajar SKS/)).toBeInTheDocument();
    expect(screen.getByText(/6\/6 SKS terjadwal/)).toBeInTheDocument();

    // Status badge — all SKS scheduled → Disetujui
    expect(screen.getByText('Disetujui')).toBeInTheDocument();

    // Class list
    expect(screen.getByText('Dasar-Dasar Pemrograman')).toBeInTheDocument();
    expect(screen.getByText('Struktur Data')).toBeInTheDocument();
    expect(screen.getByText('2 pertemuan')).toBeInTheDocument();
    expect(screen.getByText('1 pertemuan')).toBeInTheDocument();
  });

  it('klik kelas → expand jadwal pertemuan', async () => {
    mockedApi.getMyClasses.mockResolvedValueOnce({ items: MY_CLASSES_RAW });

    render(<DosenSchedule />);
    await screen.findByText('Dr. Budi Santoso');

    await userEvent.click(screen.getByText('Dasar-Dasar Pemrograman'));
    await waitFor(() => {
      expect(screen.getByText('Pengenalan')).toBeInTheDocument();
    });
    expect(screen.getByText('Terjadwal')).toBeInTheDocument();
    expect(screen.getByText('Selesai')).toBeInTheDocument();
  });

  it('klik lagi → collapse jadwal', async () => {
    mockedApi.getMyClasses.mockResolvedValueOnce({ items: MY_CLASSES_RAW });

    render(<DosenSchedule />);
    await screen.findByText('Dr. Budi Santoso');

    await userEvent.click(screen.getByText('Dasar-Dasar Pemrograman'));
    await waitFor(() => {
      expect(screen.getByText('Pengenalan')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText('Dasar-Dasar Pemrograman'));
    await waitFor(() => {
      expect(screen.queryByText('Pengenalan')).not.toBeInTheDocument();
    });
  });

  it('load gagal → tampilkan error', async () => {
    mockedApi.getMyClasses.mockRejectedValueOnce(new Error('Network error'));
    render(<DosenSchedule />);

    expect(await screen.findByText('Gagal memuat jadwal mengajar')).toBeInTheDocument();
  });

  it('tidak ada kelas → pesan kosong, tanpa header ringkasan', async () => {
    mockedApi.getMyClasses.mockResolvedValueOnce({ items: [] });
    render(<DosenSchedule />);

    expect(await screen.findByText('Belum ada kelas yang diampu.')).toBeInTheDocument();
    expect(screen.queryByText('Beban Mengajar SKS')).not.toBeInTheDocument();
  });

  it('semua kelas terjadwal → status Disetujui', async () => {
    const allScheduled = MY_CLASSES_RAW.map((c) => ({
      ...c,
      schedules: [
        {
          id: 99,
          meetingNumber: 1,
          scheduledDate: '2026-09-01',
          topic: 'Test',
          isCompleted: false,
        },
      ],
    }));
    mockedApi.getMyClasses.mockResolvedValueOnce({ items: allScheduled });

    render(<DosenSchedule />);
    await screen.findByText('Dr. Budi Santoso');

    expect(screen.getByText('Disetujui')).toBeInTheDocument();
    expect(screen.getByText('Semua SKS sudah terjadwal')).toBeInTheDocument();
  });

  it('belum ada jadwal sama sekali → status Draft', async () => {
    const noSchedule = MY_CLASSES_RAW.map((c) => ({ ...c, schedules: [] }));
    mockedApi.getMyClasses.mockResolvedValueOnce({ items: noSchedule });

    render(<DosenSchedule />);
    await screen.findByText('Dr. Budi Santoso');

    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText(/belum dijadwalkan/)).toBeInTheDocument();
  });
});
