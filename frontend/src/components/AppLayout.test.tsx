import { render, screen, waitFor } from '@testing-library/react';
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

// Admin Akademik punya transcript.view_own (warisan matriks) tapi menu Transkrip
// sengaja disembunyikan untuk role ini (permintaan: hapus menu Transkrip di admin akademik).
const ADMIN_AKADEMIK = {
  id: 3,
  email: 'akademik@kampus.ac.id',
  fullName: 'Akademik',
  role: 'admin_akademik',
  roleName: 'Admin Akademik',
  isWali: false,
  isActive: true,
  mustChangePassword: false,
  studentId: null,
  createdAt: '2026-01-01T00:00:00Z',
  menu: ['schedule.manage', 'transcript.view_own', 'user.edit_contact'],
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
    'thesis.review',
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
    vi.unstubAllGlobals();
  });

  const NOTIF_PAYLOAD = {
    items: [
      {
        id: 1,
        title: 'KRS Anda disetujui',
        message: 'KRS semester Ganjil 2025/2026 disetujui.',
        type: 'krs_approved',
        isRead: false,
        createdAt: '2026-08-01T08:00:00Z',
      },
      {
        id: 2,
        title: 'Tagihan SPP jatuh tempo',
        message: 'Segera bayar tagihan SPP bulan Agustus.',
        type: 'payment_due',
        isRead: true,
        createdAt: '2026-08-02T08:00:00Z',
      },
    ],
    pagination: { page: 1, limit: 5, total: 2, hasMore: false },
  };

  // Stub fetch STATEFUL: GET mengembalikan kondisi terkini; PUT /read & /read-all
  // benar-benar mengubah state → badge & panel ikut sinkron (pola nyata backend).
  function stubNotifFetch() {
    const state = structuredClone(NOTIF_PAYLOAD);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        if (method === 'PUT' && url.includes('/read-all')) {
          state.items.forEach((n) => {
            n.isRead = true;
          });
        } else if (method === 'PUT' && url.includes('/read')) {
          const id = Number(url.split('/').at(-2));
          const item = state.items.find((n) => n.id === id);
          if (item) item.isRead = true;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: structuredClone(state) }),
        } as Response;
      }),
    );
  }

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

  it('keluhan #5 — menu berupa ikon + label inline saat expanded; tooltip hover saat collapsed', () => {
    mockUser = MAHASISWA;
    renderLayout();

    // Expanded: label inline tampil (bukan tooltip).
    expect(screen.getByText('KRS')).toBeInTheDocument();
    expect(screen.getByText('Transkrip')).toBeInTheDocument();
    // Tooltip deskripsi TIDAK dirender saat expanded.
    expect(screen.queryByText('Isi dan lihat Kartu Rencana Studi')).not.toBeInTheDocument();
    // Ikon sidebar: menu Dashboard memiliki title (tooltip native browser).
    expect(screen.getByTitle('Dashboard')).toBeInTheDocument();
  });

  it('admin_sistem → hanya menu User, Master & Informasi Penting (Dashboard tidak di-menu)', () => {
    mockUser = ADMIN_SISTEM;
    renderLayout();

    expect(screen.getByRole('link', { name: 'User' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Master' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Informasi Penting' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Audit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Nilai' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'KRS' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Transkrip' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Pembayaran' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Tagihan' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Jadwal' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Pilih MK' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Absensi' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Bimbingan' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Substitute' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Nilai' })).not.toBeInTheDocument();
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

  it('admin akademik → Transkrip disembunyikan meski punya transcript.view_own', () => {
    mockUser = ADMIN_AKADEMIK;
    renderLayout();

    // role admin_akademik → menu Transkrip di-sembunyikan per role (HIDDEN_MENU_BY_ROLE)
    expect(screen.queryByRole('link', { name: 'Transkrip' })).not.toBeInTheDocument();
    // menu domainnya tetap tampil
    expect(screen.getByRole('link', { name: 'Jadwal' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('admin akademik → menu Jadwal tampil (schedule.manage), tanpa menu dosen/admin_sistem', () => {
    mockUser = ADMIN_AKADEMIK;
    renderLayout();

    expect(screen.getByRole('link', { name: 'Jadwal' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'User' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Master' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Informasi Penting' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Pilih MK' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Absensi' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Bimbingan' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Substitute' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Nilai' })).not.toBeInTheDocument();
  });

  it('keluhan #5 — submenu dosen pindah ke sidebar (Pilih MK, Jadwal, Absensi, Substitute, Nilai)', () => {
    mockUser = DOSEN;
    renderLayout();

    // Non-wali dosen: Bimbingan TIDAK tampil
    for (const label of ['Pilih MK', 'Jadwal', 'Absensi', 'Substitute', 'Nilai']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }
    expect(screen.queryByRole('link', { name: 'Bimbingan' })).not.toBeInTheDocument();
    // Expanded: label inline tampil (bukan tooltip).
    expect(screen.getByText('Pilih MK')).toBeInTheDocument();
    expect(screen.getByText('Nilai')).toBeInTheDocument();
    // Tooltip deskripsi TIDAK dirender saat expanded.
    expect(screen.queryByText('Pilih mata kuliah yang diampu')).not.toBeInTheDocument();
    expect(screen.queryByText('Input dan ubah nilai')).not.toBeInTheDocument();
  });

  it('dosen Wali → menu Bimbingan tampil di sidebar', () => {
    mockUser = { ...DOSEN, isWali: true };
    renderLayout();

    // Bimbingan is now the parent menu
    expect(screen.getByText(/Bimbingan/)).toBeInTheDocument();
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

  it('keluhan #26 — header hanya ikon orang; klik → dropdown (nama, role, Ganti Password, Keluar)', async () => {
    const user = userEvent.setup();
    mockUser = MAHASISWA;
    renderLayout();

    // Header TIDAK menampilkan nama/role langsung (hanya ikon orang).
    expect(screen.queryByText('Budi')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Menu pengguna' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByText('Budi')).toBeInTheDocument();
    expect(screen.getByText('Mahasiswa')).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Edit Profil' })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Ganti Password' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Keluar' })).toBeInTheDocument();
  });

  it('keluhan #26 — dropdown avatar: tanpa menu Edit Profil', async () => {
    const user = userEvent.setup();
    mockUser = MAHASISWA;
    renderLayout();

    await user.click(screen.getByRole('button', { name: 'Menu pengguna' }));
    expect(screen.queryByRole('menuitem', { name: 'Edit Profil' })).not.toBeInTheDocument();
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

  it('keluhan — notifikasi HALAMAN MELAYANG: klik lonceng → panel muncul TANPA pindah halaman', async () => {
    stubNotifFetch();
    const user = userEvent.setup();
    mockUser = MAHASISWA;
    renderLayout();

    // Sebelum dibuka: tidak ada panel dialog
    expect(screen.queryByRole('dialog', { name: 'Notifikasi' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Notifikasi' }));

    // Panel melayang muncul dengan daftar notifikasi
    expect(screen.getByRole('dialog', { name: 'Notifikasi' })).toBeInTheDocument();
    expect(await screen.findByText('KRS Anda disetujui')).toBeInTheDocument();
    expect(screen.getByText('Tagihan SPP jatuh tempo')).toBeInTheDocument();
    // TIDAK pindah halaman: konten halaman saat ini masih tampil
    expect(screen.getByText('KONTEN_UTAMA')).toBeInTheDocument();
  });

  it('panel — Tandai dibaca per item (optimistik) → tombol hilang & badge unread berkurang', async () => {
    stubNotifFetch();
    const user = userEvent.setup();
    mockUser = MAHASISWA;
    renderLayout();

    await user.click(screen.getByRole('button', { name: 'Notifikasi' }));
    // Hanya 1 unread (id 1) → badge 1; tombol "Tandai dibaca" hanya untuk item 1
    expect(await screen.findByText('KRS Anda disetujui')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument(); // badge unread

    await user.click(screen.getByRole('button', { name: 'Tandai dibaca' }));

    // Item 1 jadi dibaca → tombol hilang; item 2 sudah dibaca → tidak ada tombol sama sekali
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Tandai dibaca' })).not.toBeInTheDocument(),
    );
    // Badge unread hilang (0) — setelah event siak:notif-changed memicu refresh badge
    await waitFor(() => expect(screen.queryByText('1')).not.toBeInTheDocument());
  });

  it('panel — Tandai semua dibaca → semua item jadi dibaca', async () => {
    stubNotifFetch();
    const user = userEvent.setup();
    mockUser = MAHASISWA;
    renderLayout();

    await user.click(screen.getByRole('button', { name: 'Notifikasi' }));
    expect(await screen.findByText('KRS Anda disetujui')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Tandai semua dibaca' }));

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Tandai dibaca' })).not.toBeInTheDocument(),
    );
    // Tombol "Tandai semua dibaca" hilang setelah badge unread = 0
    await waitFor(() => expect(screen.queryByText('Tandai semua dibaca')).not.toBeInTheDocument());
  });

  it('panel — klik di luar panel → panel tertutup', async () => {
    stubNotifFetch();
    const user = userEvent.setup();
    mockUser = MAHASISWA;
    renderLayout();

    await user.click(screen.getByRole('button', { name: 'Notifikasi' }));
    expect(await screen.findByText('KRS Anda disetujui')).toBeInTheDocument();

    // Klik konten halaman (di luar panel) → panel menutup
    await user.click(screen.getByText('KONTEN_UTAMA'));

    expect(screen.queryByRole('dialog', { name: 'Notifikasi' })).not.toBeInTheDocument();
  });

  it('panel — tautan "Lihat semua notifikasi" mengarah ke /notifikasi', async () => {
    stubNotifFetch();
    const user = userEvent.setup();
    mockUser = MAHASISWA;
    renderLayout();

    await user.click(screen.getByRole('button', { name: 'Notifikasi' }));
    await screen.findByText('KRS Anda disetujui');

    const link = screen.getByRole('link', { name: 'Lihat semua notifikasi' });
    expect(link).toHaveAttribute('href', '/notifikasi');
  });

  // --- Sidebar expand/collapse ---
  it('sidebar default expanded — label menu tampil inline (bukan tooltip)', () => {
    mockUser = MAHASISWA;
    renderLayout();

    // Expanded: label inline terlihat (KRS, Transkrip, Pembayaran)
    expect(screen.getByRole('link', { name: 'KRS' })).toBeInTheDocument();
    expect(screen.getByText('KRS')).toBeInTheDocument();
    expect(screen.getByText('Transkrip')).toBeInTheDocument();
    // Tooltip (label+deskripsi) TIDAK dirender saat expanded
    expect(screen.queryByText('Isi dan lihat Kartu Rencana Studi')).not.toBeInTheDocument();
    // Tombol collapse (ikon saja, tanpa teks) ada
    expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toBeInTheDocument();
    expect(screen.queryByText('Tutup menu')).not.toBeInTheDocument();
  });

  it('klik ikon collapse → sidebar mengecil; label hilang, tooltip hover muncul', async () => {
    mockUser = MAHASISWA;
    const { container } = renderLayout();

    // Expanded: label inline ada (span.truncate)
    expect(container.querySelector('span.truncate')).toBeTruthy();

    // Klik tombol collapse (ikon saja)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Collapse sidebar' }));

    // Collapsed: label inline HILANG
    expect(container.querySelector('span.truncate')).toBeNull();
    // Tooltip (deskripsi) kini dirender di DOM (muncul saat hover)
    expect(screen.getByText('Isi dan lihat Kartu Rencana Studi')).toBeInTheDocument();
    // Tombol expand (ikon saja) muncul
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument();
  });

  it('klik ikon expand → sidebar melebar kembali; label inline muncul lagi', async () => {
    mockUser = MAHASISWA;
    const { container } = renderLayout();

    // Collapse dulu
    await userEvent.setup().click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(container.querySelector('span.truncate')).toBeNull();

    // Klik expand
    await userEvent.setup().click(screen.getByRole('button', { name: 'Expand sidebar' }));

    // Label inline kembali muncul
    expect(container.querySelector('span.truncate')).toBeTruthy();
    // Tooltip tidak dirender saat expanded
    expect(screen.queryByText('Isi dan lihat Kartu Rencana Studi')).not.toBeInTheDocument();
    // Tombol collapse kembali muncul
    expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toBeInTheDocument();
  });

  it('sidebar collapse tidak mempengaruhi navigasi link (Dashboard tetap bisa diklik)', async () => {
    mockUser = MAHASISWA;
    renderLayout();

    // Collapse
    await userEvent.setup().click(screen.getByRole('button', { name: 'Collapse sidebar' }));

    // Klik link Dashboard (ikon saja) — harus navigasi (MemoryRouter handle)
    await userEvent.setup().click(screen.getByRole('link', { name: 'Dashboard' }));

    // Content tetap render (tidak error)
    expect(screen.getByText('KONTEN_UTAMA')).toBeInTheDocument();
  });
});
