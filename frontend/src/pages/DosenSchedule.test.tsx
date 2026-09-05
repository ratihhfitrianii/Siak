import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DosenSchedule } from './DosenSchedule';
import type { MyClass } from '../lib/types';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    getMyClasses: vi.fn(),
    getMySubmission: vi.fn(),
    submitSchedule: vi.fn(),
  };
});

import { getMyClasses, getMySubmission, submitSchedule } from '../lib/api';

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 4,
      email: 'dosen@kampus.ac.id',
      fullName: 'Pak Guru',
      role: 'dosen',
      roleName: 'Dosen',
      isWali: false,
      isKaprodi: false,
      isWakilKaprodi: false,
      isActive: true,
      mustChangePassword: false,
      studentId: null,
      adminFacultyCode: null,
      createdAt: '2026-01-01T00:00:00Z',
      menu: ['lecturer.select_course', 'grade.input', 'lecturer.availability'],
    },
    booting: false,
    login: vi.fn(),
    logout: vi.fn(),
    changePassword: vi.fn(),
    refreshMe: vi.fn(),
  }),
}));

// Kelas TANPA jadwal -> status Draft
const MOCK_CLASSES_DRAFT: MyClass[] = [
  {
    id: 1,
    classCode: 'A',
    dayOfWeek: null,
    startTime: null,
    endTime: null,
    room: null,
    capacity: 40,
    currentEnrolled: 32,
    curriculumId: 10,
    semesterId: 5,
    semesterNumber: 5,
    semesterCode: '2026-1',
    semesterName: 'Ganjil 2026/2027',
    courseCode: 'TI101',
    courseName: 'Algoritma',
    credits: 3,
    schedules: [],
  },
];

// Kelas DENGAN jadwal -> status Disetujui (fallback) atau Menunggu (jika submission awaiting)
const MOCK_CLASSES_SCHEDULED: MyClass[] = [
  {
    id: 1,
    classCode: 'A',
    dayOfWeek: 1,
    startTime: '08:00',
    endTime: '09:40',
    room: 'R.201',
    capacity: 40,
    currentEnrolled: 32,
    curriculumId: 10,
    semesterId: 5,
    semesterNumber: 5,
    semesterCode: '2026-1',
    semesterName: 'Ganjil 2026/2027',
    courseCode: 'TI101',
    courseName: 'Algoritma',
    credits: 3,
    schedules: [
      {
        id: 1,
        meetingNumber: 1,
        scheduledDate: '2026-09-01',
        topic: null,
        isCompleted: false,
      },
    ],
  },
];

function mockMeDraft() {
  vi.mocked(getMyClasses).mockResolvedValue({ items: MOCK_CLASSES_DRAFT });
  vi.mocked(getMySubmission).mockResolvedValue(null);
}

function mockMeScheduled() {
  vi.mocked(getMyClasses).mockResolvedValue({ items: MOCK_CLASSES_SCHEDULED });
  vi.mocked(getMySubmission).mockResolvedValue(null);
}

describe('DosenSchedule — fitur Ajukan Persetujuan Kaprodi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('menampilkan status Draft + TIDAK ada tombol Ajukan (karena belum lengkap)', async () => {
    mockMeDraft();
    render(<DosenSchedule />);

    await waitFor(() => expect(screen.getByText('Algoritma')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText(/Draft/)).toBeInTheDocument());
    // belum lengkap -> tidak boleh ada tombol ajukan
    expect(screen.queryByRole('button', { name: 'Ajukan Persetujuan' })).not.toBeInTheDocument();
  });

  it('menampilkan status Proses (lengkap, siap diajukan) + tombol Ajukan saat lengkap & belum diajukan', async () => {
    mockMeScheduled();
    render(<DosenSchedule />);

    await waitFor(() => expect(screen.getAllByText('Algoritma').length).toBeGreaterThanOrEqual(1));
    await waitFor(() =>
      expect(screen.getByText(/Menunggu Persetujuan Kaprodi/)).toBeInTheDocument(),
    );
    // sudah lengkap tapi belum diajukan -> tombol Ajukan muncul
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Ajukan Persetujuan' })).toBeInTheDocument(),
    );
  });

  it('klik Ajukan Persetujuan → panggil submitSchedule + status jadi Menunggu', async () => {
    const user = userEvent.setup();
    mockMeScheduled();

    vi.mocked(submitSchedule).mockResolvedValue({
      id: 99,
      status: 'awaiting',
      submittedAt: new Date().toISOString(),
    });
    const me = vi.mocked(getMySubmission);
    me.mockResolvedValueOnce(null); // sebelum submit
    me.mockResolvedValueOnce({
      id: 99,
      lecturerId: 4,
      semesterId: 5,
      status: 'awaiting',
      submittedAt: new Date().toISOString(),
      reviewedAt: null,
      reviewNote: null,
      semesterCode: '2026-1',
      semesterName: 'Ganjil 2026/2027',
      reviewerName: null,
    }); // setelah submit (load kedua)

    render(<DosenSchedule />);

    await waitFor(() => expect(screen.getAllByText('Algoritma').length).toBeGreaterThanOrEqual(1));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Ajukan Persetujuan' })).toBeInTheDocument(),
    );

    await user.click(screen.getByRole('button', { name: 'Ajukan Persetujuan' }));

    await waitFor(() => expect(submitSchedule).toHaveBeenCalledWith(5));
    await waitFor(() =>
      expect(screen.getByText(/Menunggu Persetujuan Kaprodi/)).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Ajukan Persetujuan' })).not.toBeInTheDocument(),
    );
  });

  it('status Ditolak Kaprodi + catatan penolakan tampil + tombol ajukan ulang muncul', async () => {
    mockMeScheduled();
    vi.mocked(getMySubmission).mockResolvedValue({
      id: 99,
      lecturerId: 4,
      semesterId: 5,
      status: 'rejected',
      submittedAt: new Date().toISOString(),
      reviewedAt: new Date().toISOString(),
      reviewNote: 'Bentrok ruangan dengan kelas lain',
      semesterCode: '2026-1',
      semesterName: 'Ganjil 2026/2027',
      reviewerName: 'Kaprodi TI',
    });

    render(<DosenSchedule />);

    await waitFor(() => expect(screen.getAllByText('Algoritma').length).toBeGreaterThanOrEqual(1));
    await waitFor(() => expect(screen.getByText(/Ditolak Kaprodi/)).toBeInTheDocument());
    await waitFor(() =>
      expect(screen.getByText(/Bentrok ruangan dengan kelas lain/)).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Ajukan Persetujuan' })).toBeInTheDocument(),
    );
  });
});
