import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DashboardPage } from './DashboardPage';

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

function renderDashboard() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  );
}

describe('DashboardPage (T1.11b)', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('mahasiswa → kartu KRS & Transkrip (menu-based)', () => {
    mockUser = MAHASISWA;
    renderDashboard();

    expect(screen.getByText('Selamat datang, Budi')).toBeInTheDocument();
    expect(screen.getByText('KRS')).toBeInTheDocument();
    expect(screen.getByText('Transkrip')).toBeInTheDocument();
    expect(screen.queryByText('Kelola Pengguna')).not.toBeInTheDocument();
  });

  it('admin_sistem → kartu Kelola Pengguna, tanpa KRS/Transkrip', () => {
    mockUser = ADMIN;
    renderDashboard();

    expect(screen.getByText('Kelola Pengguna')).toBeInTheDocument();
    expect(screen.queryByText('Transkrip')).not.toBeInTheDocument();
  });
});
