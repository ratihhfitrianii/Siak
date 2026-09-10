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
    getClassAvailability: vi.fn(),
    setClassSchedule: vi.fn(),
    clearClassSchedule: vi.fn(),
  };
});

import {
  getMyClasses,
  getMySubmission,
  submitSchedule,
  getClassAvailability,
  setClassSchedule,
  clearClassSchedule,
} from '../lib/api';

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

/* ============ Fitur Atur Jadwal (Modal) ============ */

function availOk() {
  return {
    classId: 1,
    courseName: 'Algoritma',
    classCode: 'A',
    credits: 3,
    room: 'R.201',
    ok: true,
    conflicts: [],
    recommendations: [
      { day: 1, startTime: '10:00', endTime: '11:50' },
      { day: 3, startTime: '08:00', endTime: '09:50' },
    ],
  };
}

describe('DosenSchedule — fitur Atur Jadwal (modal)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('kartu belum terjadwal → tombol "Atur Jadwal" mencolok; klik → modal muncul info MK + ruangan', async () => {
    const user = userEvent.setup();
    mockMeDraft();
    vi.mocked(getClassAvailability).mockResolvedValue(availOk());

    render(<DosenSchedule />);

    await waitFor(() => expect(screen.getByText('Algoritma')).toBeInTheDocument());
    const btn = screen.getByRole('button', { name: 'Atur Jadwal' });
    expect(btn).toBeInTheDocument();

    await user.click(btn);

    // Modal
    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: 'Atur Jadwal' })).toBeInTheDocument(),
    );
    // Draft class room: null → badge "Belum ada ruangan" (read-only)
    expect(screen.getByText(/Belum ada ruangan/)).toBeInTheDocument();
    expect(screen.getByText('3 SKS')).toBeInTheDocument();
    // Rekomendasi muncul
    expect(screen.getByText(/Rekomendasi Waktu Kosong/)).toBeInTheDocument();
  });

  it('konflik dosen → pesan error spesifik + tombol Simpan disabled', async () => {
    const user = userEvent.setup();
    mockMeDraft();
    vi.mocked(getClassAvailability).mockResolvedValue({
      classId: 1,
      courseName: 'Algoritma',
      classCode: 'A',
      credits: 3,
      room: 'R.201',
      ok: false,
      conflicts: [
        {
          kind: 'dosen',
          classId: 2,
          courseName: 'Basis Data',
          classCode: 'B',
          startTime: '08:00',
          endTime: '09:40',
          room: 'R.101',
        },
      ],
      recommendations: [],
    });

    render(<DosenSchedule />);

    await waitFor(() => expect(screen.getByText('Algoritma')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Atur Jadwal' }));
    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: 'Atur Jadwal' })).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(
        screen.getByText(/Bapak\/Ibu sudah memiliki jadwal mengajar Basis Data/),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'Simpan Jadwal' })).toBeDisabled();
  });

  it('konflik ruangan → pesan error spesifik ruangan', async () => {
    const user = userEvent.setup();
    mockMeDraft();
    vi.mocked(getClassAvailability).mockResolvedValue({
      classId: 1,
      courseName: 'Algoritma',
      classCode: 'A',
      credits: 3,
      room: 'R.201',
      ok: false,
      conflicts: [
        {
          kind: 'ruangan',
          classId: 3,
          courseName: 'Statistika',
          classCode: 'A',
          startTime: '08:00',
          endTime: '09:40',
          room: 'R.201',
        },
      ],
      recommendations: [],
    });

    render(<DosenSchedule />);

    await waitFor(() => expect(screen.getByText('Algoritma')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Atur Jadwal' }));
    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: 'Atur Jadwal' })).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.getByText(/Ruang R\.201 sudah digunakan oleh kelas lain/)).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'Simpan Jadwal' })).toBeDisabled();
  });

  it('waktu tersedia → Simpan hijau; klik → setClassSchedule + re-fetch + modal tertutup', async () => {
    const user = userEvent.setup();
    mockMeDraft();
    vi.mocked(getClassAvailability).mockResolvedValue(availOk());
    vi.mocked(setClassSchedule).mockResolvedValue({
      id: 1,
      classCode: 'A',
      dayOfWeek: 1,
      startTime: '08:00',
      endTime: '09:50',
    });

    render(<DosenSchedule />);

    await waitFor(() => expect(screen.getByText('Algoritma')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Atur Jadwal' }));
    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: 'Atur Jadwal' })).toBeInTheDocument(),
    );
    await waitFor(() => expect(screen.getByText(/waktu ini tersedia/i)).toBeInTheDocument());

    const save = screen.getByRole('button', { name: 'Simpan Jadwal' });
    expect(save).not.toBeDisabled();
    await user.click(save);

    await waitFor(() =>
      expect(setClassSchedule).toHaveBeenCalledWith(1, { dayOfWeek: 1, startTime: '08:00' }),
    );
    // modal tertutup setelah save
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Atur Jadwal' })).not.toBeInTheDocument(),
    );
  });

  it('kartu sudah terjadwal → tombol Edit & Hapus; Hapus → confirm + clearClassSchedule + re-fetch', async () => {
    const user = userEvent.setup();
    mockMeScheduled();
    vi.mocked(getClassAvailability).mockResolvedValue(availOk());
    vi.mocked(clearClassSchedule).mockResolvedValue({ message: 'ok' });
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<DosenSchedule />);

    await waitFor(() => expect(screen.getAllByText('Algoritma').length).toBeGreaterThanOrEqual(1));
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Hapus' }));

    await waitFor(() => expect(clearClassSchedule).toHaveBeenCalledWith(1));
    vi.restoreAllMocks();
  });
});
