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
  {
    studentId: 2,
    nim: '2023002',
    studentName: 'Citra',
    hadirCount: 10,
    izinCount: 2,
    sakitCount: 1,
    alphaCount: 1,
    totalSessions: 14,
    attendanceRate: 70,
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

  it('klik ikon urutkan → dropdown → urutan berubah (sort)', async () => {
    const user = userEvent.setup();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedApi.getMyClasses.mockResolvedValue(CLASSES as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedApi.getAttendanceSessions.mockResolvedValue([{ id: 10, classId: 1 }] as any);
    mockedApi.getAttendanceRecap.mockResolvedValue(RECAP);

    render(<DosenAttendanceRecap />);
    await screen.findByText('Rekap Kehadiran Mahasiswa');
    await user.click(screen.getByRole('button', { name: 'Pilih Kelas' }));
    await user.click(screen.getByText(/Algoritma/));
    await screen.findByText('Budi');

    // Buka menu, pilih NIM → asc: 2023001 (Budi) sebelum 2023002 (Citra)
    await user.click(screen.getByRole('button', { name: /Urutkan/ }));
    await user.click(screen.getByRole('option', { name: /^NIM/ }));
    let rows = screen.getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('Budi');
    expect(rows[1]).toHaveTextContent('Citra');

    // Toggle → desc: sebaliknya
    await user.click(screen.getByRole('button', { name: /Urutkan/ }));
    await user.click(screen.getByRole('option', { name: /^NIM/ }));
    rows = screen.getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('Citra');
    expect(rows[1]).toHaveTextContent('Budi');
  });

  it('ketik query → hanya baris cocok (search)', async () => {
    const user = userEvent.setup();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedApi.getMyClasses.mockResolvedValue(CLASSES as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedApi.getAttendanceSessions.mockResolvedValue([{ id: 10, classId: 1 }] as any);
    mockedApi.getAttendanceRecap.mockResolvedValue(RECAP);

    render(<DosenAttendanceRecap />);
    await screen.findByText('Rekap Kehadiran Mahasiswa');
    await user.click(screen.getByRole('button', { name: 'Pilih Kelas' }));
    await user.click(screen.getByText(/Algoritma/));
    await screen.findByText('Budi');

    await user.type(screen.getByPlaceholderText(/Cari/), 'Citra');
    expect(screen.getByText('Citra')).toBeInTheDocument();
    expect(screen.queryByText('Budi')).not.toBeInTheDocument();
  });

  it('klik semua opsi urutkan di dropdown → sort berfungsi tanpa error', async () => {
    const user = userEvent.setup();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedApi.getMyClasses.mockResolvedValue(CLASSES as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedApi.getAttendanceSessions.mockResolvedValue([{ id: 10, classId: 1 }] as any);
    mockedApi.getAttendanceRecap.mockResolvedValue(RECAP);

    render(<DosenAttendanceRecap />);
    await screen.findByText('Rekap Kehadiran Mahasiswa');
    await user.click(screen.getByRole('button', { name: 'Pilih Kelas' }));
    await user.click(screen.getByText(/Algoritma/));
    await screen.findByText('Budi');

    const headers = [
      'NIM',
      'Nama Mahasiswa',
      'Hadir',
      'Izin',
      'Sakit',
      'Alpha',
      'Total Pertemuan',
      '% Kehadiran',
    ];
    for (const h of headers) {
      await user.click(screen.getByRole('button', { name: /Urutkan/ }));
      await user.click(screen.getByRole('option', { name: new RegExp(`^${h}`) }));
      expect(screen.getAllByRole('row').length).toBeGreaterThan(1);
    }
  });
});
