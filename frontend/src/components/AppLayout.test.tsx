import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppLayout } from './AppLayout';

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
} | null;

const mockLogout = vi.fn();

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, booting: false, logout: mockLogout }),
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

const ADMIN_SISTEM = {
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
  menu: ['user.manage', 'audit.view'],
};

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<AppLayout>KONTEN_UTAMA</AppLayout>} />
        <Route path="/login" element={<div>HALAMAN_LOGIN</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AppLayout (T1.11d — polish)', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('user null → tidak render apa pun', () => {
    mockUser = null;
    const { container } = renderLayout();
    expect(container).toBeEmptyDOMElement();
  });

  it('menu disaring dari permission user (mahasiswa → KRS & Transkrip)', () => {
    mockUser = MAHASISWA;
    renderLayout();

    expect(screen.getByText('Budi')).toBeInTheDocument();
    expect(screen.getByText('Mahasiswa')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'KRS' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Transkrip' })).toBeInTheDocument();
    // tanpa permission → menu tak muncul
    expect(screen.queryByRole('link', { name: 'Nilai' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'User' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Audit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Pembayaran' })).not.toBeInTheDocument();
    // konten anak dirender
    expect(screen.getByText('KONTEN_UTAMA')).toBeInTheDocument();
  });

  it('admin_sistem → menu User & Audit muncul', () => {
    mockUser = ADMIN_SISTEM;
    renderLayout();

    expect(screen.getByRole('link', { name: 'User' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Audit' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'KRS' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Transkrip' })).not.toBeInTheDocument();
  });

  it('Keluar → logout dipanggil lalu pindah ke /login', async () => {
    const user = userEvent.setup();
    mockUser = MAHASISWA;
    mockLogout.mockResolvedValue(undefined);
    renderLayout();

    await user.click(screen.getByRole('button', { name: 'Keluar' }));

    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('HALAMAN_LOGIN')).toBeInTheDocument();
  });
});
