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
  // user.edit_contact → dropdown avatar menampilkan "Edit Profil" (keluhan #26)
  menu: ['krs.fill', 'krs.view_classes', 'transcript.view_own', 'user.edit_contact'],
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
  menu: ['user.manage', 'audit.view', 'user.edit_contact'],
};

const ADMIN_KEUANGAN = {
  id: 2,
  email: 'keuangan@kampus.ac.id',
  fullName: 'Kasir',
  role: 'admin_keuangan',
  roleName: 'Admin Keuangan',
  isWali: false,
  isActive: true,
  mustChangePassword: false,
  studentId: null,
  createdAt: '2026-01-01T00:00:00Z',
  menu: ['payment.update'],
};

// Dosen punya transcript.view_own (matriks §6.1) tapi menu Transkrip sengaja disembunyikan
// (keluhan lama: "menu yang tidak tersedia tidak perlu ditampilkan").
// Submenu dosen (Pilih MK, Jadwal, dll) tampil di sidebar (keluhan #5) — butuh permission tsb.
const DOSEN = {
  id: 4,
  email: 'dosen@kampus.ac.id',
  fullName: 'Pak Guru',
  role: 'dosen',
  roleName: 'Dosen',
  isWali: false,
  isActive: true,
  mustChangePassword: false,
  studentId: null,
  createdAt: '2026-01-01T00:00:00Z',
  menu: [
    'transcript.view_own',
    'schedule.view',
    'lecturer.select_course',
    'lecturer.availability',
    'attendance.input',
    'guidance.manage',
    'substitute.manage',
    'grade.input',
  ],
};

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<AppLayout>KONTEN_UTAMA</AppLayout>} />
        <Route path="/login" element={<div>HALAMAN_LOGIN</div>} />
        <Route path="/profil" element={<div>HALAMAN_PROFIL</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Buka dropdown avatar (keluhan #26) — helper umum. */
async function openAvatarMenu(user: typeof MAHASISWA | typeof DOSEN = MAHASISWA) {
  mockUser = user;
  renderLayout();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Menu pengguna' }));
}

describe('AppLayout (T1.11d polish + keluhan #5 sidebar ikon & #26 dropdown avatar)', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('user null → tidak render apa pun', () => {
    mockUser = null;
    const { container } = renderLayout();
    expect(container).toBeEmptyDOMElement();
  });

  it('menu disaring dari permission user (mahasiswa → KRS, Transkrip & Pembayaran)', () => {
    mockUser = MAHASISWA;
    renderLayout();

    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'KRS' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Transkrip' })).toBeInTheDocument();
    // T5.3: mahasiswa punya krs.fill → menu Pembayaran (tagihan sendiri) muncul
    expect(screen.getByRole('link', { name: 'Pembayaran' })).toBeInTheDocument();
    // tanpa permission → menu tak muncul
    expect(screen.queryByRole('link', { name: 'Nilai' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'User' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Audit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Tagihan' })).not.toBeInTheDocument();
    // konten anak dirender
    expect(screen.getByText('KONTEN_UTAMA')).toBeInTheDocument();
  });

  it('keluhan #5 — menu berupa ikon + tooltip penjelasan singkat (hover)', () => {
    mockUser = MAHASISWA;
    renderLayout();

    // Tooltip berisi label + deskripsi singkat (penjelasan menu saat hover).
    expect(screen.getByText('Isi dan lihat Kartu Rencana Studi')).toBeInTheDocument();
    expect(screen.getByText('Lihat transkrip nilai')).toBeInTheDocument();
    // Ikon sidebar: menu Dashboard memiliki title (tooltip native browser).
    expect(screen.getByTitle('Dashboard')).toBeInTheDocument();
  });

  it('admin_sistem → hanya menu User & Master (Nilai/Audit ComingSoon disembunyikan)', () => {
    mockUser = ADMIN_SISTEM;
    renderLayout();

    expect(screen.getByRole('link', { name: 'User' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Master' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Audit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Nilai' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'KRS' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Transkrip' })).not.toBeInTheDocument();
  });

  it('admin keuangan → menu Tagihan, bukan Pembayaran (T5.3)', () => {
    mockUser = ADMIN_KEUANGAN;
    renderLayout();

    expect(screen.getByRole('link', { name: 'Tagihan' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Pembayaran' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'User' })).not.toBeInTheDocument();
  });

  it('dosen → Transkrip disembunyikan meski punya transcript.view_own (keluhan lama)', () => {
    mockUser = DOSEN;
    renderLayout();

    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    // role dosen → menu Transkrip di-sembunyikan per role (HIDDEN_MENU_BY_ROLE)
    expect(screen.queryByRole('link', { name: 'Transkrip' })).not.toBeInTheDocument();
    // tanpa permission krs.* → KRS tidak muncul
    expect(screen.queryByRole('link', { name: 'KRS' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'User' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Pembayaran' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Tagihan' })).not.toBeInTheDocument();
  });

  it('keluhan #5 — submenu dosen pindah ke sidebar (Pilih MK, Jadwal, Absensi, Bimbingan, Substitute, Nilai)', () => {
    mockUser = DOSEN;
    renderLayout();

    for (const label of ['Pilih MK', 'Jadwal', 'Absensi', 'Bimbingan', 'Substitute', 'Nilai']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }
    // Tooltip penjelasan singkat saat hover ikut tampil (pola keluhan #5)
    expect(screen.getByText('Pilih mata kuliah yang diampu')).toBeInTheDocument();
    expect(screen.getByText('Input dan ubah nilai')).toBeInTheDocument();
  });

  it('submenu dosen TIDAK muncul untuk role lain (mahasiswa/admin)', () => {
    mockUser = MAHASISWA;
    renderLayout();

    expect(screen.queryByRole('link', { name: 'Pilih MK' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Jadwal' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Absensi' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Bimbingan' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Substitute' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Nilai' })).not.toBeInTheDocument();
  });

  it('keluhan #26 — header hanya ikon orang; klik → dropdown (nama, role, Edit Profil, Ganti Password, Keluar)', async () => {
    const user = userEvent.setup();
    mockUser = MAHASISWA;
    renderLayout();

    // Header TIDAK menampilkan nama/role langsung (hanya ikon orang).
    expect(screen.queryByText('Budi')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Menu pengguna' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByText('Budi')).toBeInTheDocument();
    expect(screen.getByText('Mahasiswa')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Edit Profil' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Ganti Password' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Keluar' })).toBeInTheDocument();
  });

  it('keluhan #26 — dropdown avatar: Edit Profil → /profil', async () => {
    const user = userEvent.setup();
    mockUser = MAHASISWA;
    renderLayout();

    await user.click(screen.getByRole('button', { name: 'Menu pengguna' }));
    await user.click(screen.getByRole('menuitem', { name: 'Edit Profil' }));

    expect(await screen.findByText('HALAMAN_PROFIL')).toBeInTheDocument();
  });

  it('keluhan #26 — tanpa permission user.edit_contact (dosen) → Edit Profil tidak tampil', async () => {
    await openAvatarMenu(DOSEN);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Edit Profil' })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Ganti Password' })).toBeInTheDocument();
  });

  it('Keluar → logout dipanggil lalu pindah ke /login', async () => {
    const user = userEvent.setup();
    mockUser = MAHASISWA;
    mockLogout.mockResolvedValue(undefined);
    renderLayout();

    await user.click(screen.getByRole('button', { name: 'Menu pengguna' }));
    await user.click(screen.getByRole('menuitem', { name: 'Keluar' }));

    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('HALAMAN_LOGIN')).toBeInTheDocument();
  });
});
