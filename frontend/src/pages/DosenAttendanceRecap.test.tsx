import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { DosenAttendanceRecap } from './DosenAttendanceRecap';
import * as api from '../lib/api';

vi.mock('../lib/api', () => ({
  getMyClasses: vi.fn(),
  getAttendanceSessions: vi.fn(),
  getAttendanceRecap: vi.fn(),
}));

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, role: 'dosen', fullName: 'Dr. Andi' } }),
}));

const mockedApi = vi.mocked(api);

const CLASSES = {
  items: [
    {
      id: 1,
      classCode: 'TI101-A',
      courseName: 'Algoritma',
      semesterNumber: 1,
      currentEnrolled: 30,
    },
  ],
};

const RECAP = [
  {
    studentId: 1,
    nim: '2023001',
    studentName: 'Budi',
    hadirCount: 12,
    izinCount: 1,
    sakitCount: 0,
    alphaCount: 1,
    totalSessions: 14,
    attendanceRate: 85,
  },
];

describe('DosenAttendanceRecap', () => {
  it('menampilkan loading saat memuat kelas', () => {
    mockedApi.getMyClasses.mockReturnValue(new Promise(() => {}));
    mockedApi.getAttendanceSessions.mockResolvedValue([]);
    mockedApi.getAttendanceRecap.mockResolvedValue([]);

    render(<DosenAttendanceRecap />);
    expect(screen.getByLabelText(/Memuat.../i)).toBeInTheDocument();
  });

  it('menampilkan header + Pilih Kelas saat kelas tersedia, lalu tabel setelah pilih kelas', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedApi.getMyClasses.mockResolvedValue(CLASSES as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedApi.getAttendanceSessions.mockResolvedValue([{ id: 10, classId: 1 }] as any);
    mockedApi.getAttendanceRecap.mockResolvedValue(RECAP);

    render(<DosenAttendanceRecap />);

    // Header + dropdown Pilih Kelas muncul setelah kelas dimuat
    expect(await screen.findByText('Rekap Kehadiran Mahasiswa')).toBeInTheDocument();
    expect(screen.getAllByText('Pilih Kelas').length).toBeGreaterThan(0);

    // Pilih kelas → tabel rekap muncul
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Pilih Kelas' }));
    await user.click(screen.getByText(/Algoritma/));

    expect(await screen.findByText('Budi')).toBeInTheDocument();
    expect(screen.getByText('2023001')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('85%')).toBeInTheDocument();
  });
});
