import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardPage } from './DashboardPage';
import * as api from '../lib/api';

let mockUser: {
  id: number;
  email: string;
  fullName: string;
  role: string;
  roleName: string;
  isWali: boolean;
  isActive: boolean;
  mustChangePassword: boolean;
  studentId: number | null;
  createdAt: string;
  menu: string[];
};

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, booting: false, logout: vi.fn() }),
}));

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, getKrsPeriod: vi.fn(), getMyNotifications: vi.fn() };
});

const mockedApi = vi.mocked(api);

const MAHASISWA = {
  id: 7,
  email: 'budi@kampus.ac.id',
  fullName: 'Budi',
  role: 'mahasiswa',
  roleName: 'Mahasiswa',
  isWali: false,
  isActive: true,
  mustChangePassword: false,
  studentId: 7,
  createdAt: '2026-01-01T00:00:00Z',
  menu: ['krs.fill', 'krs.view_classes', 'transcript.view_own'],
};

const ADMIN = {
  id: 1,
  email: 'admin@kampus.ac.id',
  fullName: 'Admin',
  role: 'admin_sistem',
  roleName: 'Admin Sistem',
  isWali: false,
  isActive: true,
  mustChangePassword: false,
  studentId: null,
  createdAt: '2026-01-01T00:00:00Z',
  menu: ['user.manage'],
};

const ADMIN_AKADEMIK = {
  id: 2,
  email: 'akademik@kampus.ac.id',
  fullName: 'Akademik',
  role: 'admin_akademik',
  roleName: 'Admin Akademik',
  isWali: false,
  isActive: true,
  mustChangePassword: false,
  studentId: null,
  createdAt: '2026-01-01T00:00:00Z',
  menu: ['krs.approve', 'krs.view_classes', 'schedule.manage'],
};

const OPEN_PERIOD = {
  id: 3,
  semesterId: 5,
  semesterCode: '2025/2026-1',
  name: 'Ganjil 2025/2026',
  startDate: '2025-08-01',
  endDate: '2025-08-31',
  isRevision: false,
  status: 'open' as const,
};

const NOTIFS = [
  {
    id: 1,
    title: 'Periode KRS dibuka',
    message: 'Pengisian KRS Ganjil 2025/2026 telah dibuka.',
    type: 'info',
    isRead: false,
    createdAt: '2026-08-01T08:00:00Z',
  },
  {
    id: 2,
    title: 'Jadwal pembayaran',
    message: 'Pembayaran semester dapat dilakukan mulai pekan depan.',
    type: 'info',
    isRead: true,
    createdAt: '2026-07-28T08:00:00Z',
  },
];

function renderDashboard() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  );
}

describe('DashboardPage (T1.11b + keluhan #27 info terkini)', () => {
  beforeEach(() => {
    mockedApi.getKrsPeriod.mockResolvedValue(OPEN_PERIOD);
    mockedApi.getMyNotifications.mockResolvedValue({
      items: NOTIFS,
      pagination: { page: 1, limit: 3, total: 2, totalPages: 1, hasMore: false },
    });
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('keluhan — grid menu (KRS/Transkrip/Kelola Pengguna) TIDAK tampil; hanya info penting', () => {
    mockUser = MAHASISWA;
    renderDashboard();

    expect(screen.getByText('Selamat datang, Budi')).toBeInTheDocument();
    // Grid menu dihapus — kartu navigasi tidak boleh tampil sebagai teks apa pun
    expect(
      screen.queryByText('Isi & pantau Kartu Rencana Studi periode aktif'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Nilai & IPK per semester')).not.toBeInTheDocument();
    expect(screen.queryByText('Kelola Pengguna')).not.toBeInTheDocument();
    expect(screen.queryByText('Informasi Akun')).not.toBeInTheDocument();
  });

  it('keluhan — admin_sistem juga tanpa kartu menu (navigasi via sidebar)', () => {
    mockUser = ADMIN;
    renderDashboard();

    expect(screen.queryByText('Kelola Pengguna')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Isi & pantau Kartu Rencana Studi periode aktif'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Informasi Akun')).not.toBeInTheDocument();
  });

  it('keluhan #27 — mahasiswa melihat kartu Periode KRS (status, semester, tanggal)', async () => {
    mockUser = MAHASISWA;
    renderDashboard();

    expect(await screen.findByText('Periode Pengisian KRS')).toBeInTheDocument();
    expect(screen.getByText('Buka')).toBeInTheDocument();
    expect(screen.getByText('2025/2026-1')).toBeInTheDocument();
    // Muncul di kartu periode + mungkin di pesan notifikasi → pakai getAllByText
    expect(screen.getAllByText(/Ganjil 2025\/2026/).length).toBeGreaterThan(0);
    expect(screen.getByText(/1 Agustus 2025/)).toBeInTheDocument();
    expect(mockedApi.getKrsPeriod).toHaveBeenCalledTimes(1);
  });

  it('keluhan #27 — Info Penting menampilkan notifikasi terbaru + link Lihat semua', async () => {
    mockUser = MAHASISWA;
    renderDashboard();

    expect(await screen.findByText('Info Penting')).toBeInTheDocument();
    expect(screen.getByText('Periode KRS dibuka')).toBeInTheDocument();
    expect(screen.getByText('Jadwal pembayaran')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Lihat semua' })).toHaveAttribute(
      'href',
      '/notifikasi',
    );
    expect(mockedApi.getMyNotifications).toHaveBeenCalledWith(1, 3);
  });

  it('periode closed → badge Tutup + pesan fallback, tanpa link Isi KRS', async () => {
    mockedApi.getKrsPeriod.mockResolvedValue({
      id: 0,
      semesterId: 0,
      semesterCode: '',
      name: '',
      startDate: null,
      endDate: null,
      isRevision: false,
      status: 'closed',
      message: 'Tidak ada periode KRS yang sedang buka',
    });
    mockUser = MAHASISWA;
    renderDashboard();

    expect(await screen.findByText('Tutup')).toBeInTheDocument();
    expect(screen.getByText(/Tidak ada periode KRS yang sedang buka/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Isi KRS sekarang/ })).not.toBeInTheDocument();
  });

  it('fetch gagal → dashboard tetap render dengan pesan fallback (tidak crash)', async () => {
    mockedApi.getKrsPeriod.mockRejectedValue(new Error('network'));
    mockedApi.getMyNotifications.mockRejectedValue(new Error('network'));
    mockUser = MAHASISWA;
    renderDashboard();

    expect(await screen.findByText(/Info periode tidak dapat dimuat/)).toBeInTheDocument();
    expect(screen.getByText(/Info penting tidak dapat dimuat/)).toBeInTheDocument();
    expect(screen.getByText('Selamat datang, Budi')).toBeInTheDocument();
  });

  it('admin tanpa permission krs.* → tidak ada kartu Periode KRS, Info Penting tetap ada', async () => {
    mockUser = ADMIN;
    renderDashboard();

    expect(await screen.findByText('Info Penting')).toBeInTheDocument();
    expect(screen.queryByText('Periode Pengisian KRS')).not.toBeInTheDocument();
    expect(mockedApi.getKrsPeriod).not.toHaveBeenCalled();
  });

  it('admin akademik (krs.approve) → kartu Periode KRS tampil TANPA link Isi KRS', async () => {
    mockUser = ADMIN_AKADEMIK;
    renderDashboard();

    expect(await screen.findByText('Periode Pengisian KRS')).toBeInTheDocument();
    expect(screen.getByText('Buka')).toBeInTheDocument();
    expect(screen.getByText('2025/2026-1')).toBeInTheDocument();
    // Link "Isi KRS sekarang" HANYA untuk mahasiswa → tidak tampil
    expect(screen.queryByRole('link', { name: /Isi KRS sekarang/ })).not.toBeInTheDocument();
    expect(mockedApi.getKrsPeriod).toHaveBeenCalledTimes(1);
  });
});
