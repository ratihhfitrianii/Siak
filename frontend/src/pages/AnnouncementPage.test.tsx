import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnnouncementPage } from './AnnouncementPage';
import * as api from '../lib/api';
import type { Announcement } from '../lib/types';

// Mock module API
vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    getAnnouncements: vi.fn(),
    createAnnouncement: vi.fn(),
    updateAnnouncement: vi.fn(),
    deleteAnnouncement: vi.fn(),
  };
});

const mockedApi = vi.mocked(api);

const ANNOUNCEMENTS: Announcement[] = [
  {
    id: 1,
    title: 'Jadwal UTS Semester Ganjil',
    message: 'UTS dilaksanakan minggu ke-8.',
    targetRoles: ['mahasiswa', 'dosen'],
    priority: 10,
    isActive: true,
    publishedAt: '2026-08-01T00:00:00Z',
    expiresAt: null,
    createdBy: 1,
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
  },
  {
    id: 2,
    title: 'Pembayaran SPP Tenggat',
    message: 'Lunasi SPP sebelum KRS.',
    targetRoles: [],
    priority: 5,
    isActive: false,
    publishedAt: null,
    expiresAt: null,
    createdBy: 1,
    createdAt: '2026-08-02T00:00:00Z',
    updatedAt: '2026-08-02T00:00:00Z',
  },
];

function announcementsResponse(items = ANNOUNCEMENTS) {
  return {
    items,
    pagination: { page: 1, limit: 50, total: items.length, totalPages: 1, hasMore: false },
  };
}

function mockList(items = ANNOUNCEMENTS) {
  mockedApi.getAnnouncements.mockResolvedValue(announcementsResponse(items));
}

describe('AnnouncementPage (Informasi Penting)', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('menampilkan daftar informasi penting', async () => {
    mockList();

    render(<AnnouncementPage />);

    expect(await screen.findByText('Jadwal UTS Semester Ganjil')).toBeInTheDocument();
    expect(screen.getByText('Pembayaran SPP Tenggat')).toBeInTheDocument();
    // Target roles badge (badge "Mahasiswa" di tabel; label checkbox form juga "Mahasiswa")
    const table = screen.getByRole('table');
    expect(within(table).getByText('Mahasiswa')).toBeInTheDocument();
    expect(within(table).getByText('Dosen')).toBeInTheDocument();
    // Kosong = Semua
    expect(within(table).getByText('Semua')).toBeInTheDocument();
    // Status badges
    expect(screen.getAllByText('Aktif').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Nonaktif').length).toBeGreaterThanOrEqual(1);
    expect(mockedApi.getAnnouncements).toHaveBeenCalledWith(1, 50);
  });

  it('tambah informasi penting → createAnnouncement dipanggil + list refresh', async () => {
    mockList();
    mockedApi.createAnnouncement.mockResolvedValue(ANNOUNCEMENTS[0]);

    render(<AnnouncementPage />);

    await screen.findByText('Jadwal UTS Semester Ganjil');

    fireEvent.change(screen.getByPlaceholderText('Contoh: Jadwal UTS Semester Ganjil'), {
      target: { value: 'Pengumuman Baru' },
    });
    fireEvent.change(screen.getByPlaceholderText('Isi informasi lengkap di sini...'), {
      target: { value: 'Isi pengumuman.' },
    });
    // Pilih target role mahasiswa
    fireEvent.click(screen.getByLabelText('Mahasiswa'));

    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));

    await waitFor(() => {
      expect(mockedApi.createAnnouncement).toHaveBeenCalledWith({
        title: 'Pengumuman Baru',
        message: 'Isi pengumuman.',
        targetRoles: ['mahasiswa'],
        priority: 0,
        isActive: true,
        publishedAt: null,
        expiresAt: null,
      });
    });

    expect(await screen.findByText(/Informasi penting berhasil dibuat/)).toBeInTheDocument();
    expect(mockedApi.getAnnouncements).toHaveBeenCalledTimes(2); // initial + after create
  });

  it('edit informasi penting → updateAnnouncement dipanggil', async () => {
    mockList();
    mockedApi.updateAnnouncement.mockResolvedValue(ANNOUNCEMENTS[0]);

    render(<AnnouncementPage />);

    await screen.findByText('Jadwal UTS Semester Ganjil');

    fireEvent.click(screen.getAllByText('Edit')[0]);

    expect(screen.getByDisplayValue('Jadwal UTS Semester Ganjil')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update' })).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue('Jadwal UTS Semester Ganjil'), {
      target: { value: 'Jadwal UTS Diubah' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Update' }));

    await waitFor(() => {
      expect(mockedApi.updateAnnouncement).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ title: 'Jadwal UTS Diubah' }),
      );
    });

    expect(await screen.findByText(/Informasi penting berhasil diupdate/)).toBeInTheDocument();
  });

  it('nonaktifkan informasi penting → deleteAnnouncement dipanggil', async () => {
    mockList();
    mockedApi.deleteAnnouncement.mockResolvedValue({ message: 'ok' });

    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));

    render(<AnnouncementPage />);

    await screen.findByText('Jadwal UTS Semester Ganjil');

    fireEvent.click(screen.getAllByText('Nonaktifkan')[0]);

    await waitFor(() => {
      expect(mockedApi.deleteAnnouncement).toHaveBeenCalledWith(1);
    });

    expect(await screen.findByText(/Informasi penting dinonaktifkan/)).toBeInTheDocument();
  });

  it('cancel edit → form direset', async () => {
    mockList();

    render(<AnnouncementPage />);

    await screen.findByText('Jadwal UTS Semester Ganjil');

    fireEvent.click(screen.getAllByText('Edit')[0]);
    expect(screen.getByRole('button', { name: 'Update' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Batal' }));

    expect(screen.getByRole('button', { name: 'Simpan' })).toBeInTheDocument();
  });

  it('gagal memuat → pesan error', async () => {
    mockedApi.getAnnouncements.mockRejectedValue(new Error('network'));

    render(<AnnouncementPage />);

    expect(await screen.findByText('Gagal memuat data informasi penting')).toBeInTheDocument();
  });

  it('submit gagal → pesan error API', async () => {
    mockList();
    mockedApi.createAnnouncement.mockRejectedValue({ message: 'Judul sudah ada' });

    render(<AnnouncementPage />);

    await screen.findByText('Jadwal UTS Semester Ganjil');
    fireEvent.change(screen.getByPlaceholderText('Contoh: Jadwal UTS Semester Ganjil'), {
      target: { value: 'Duplikat' },
    });
    fireEvent.change(screen.getByPlaceholderText('Isi informasi lengkap di sini...'), {
      target: { value: 'Isi.' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));

    expect(await screen.findByText('Judul sudah ada')).toBeInTheDocument();
  });

  it('nonaktifkan dibatalkan (confirm false) → deleteAnnouncement tidak dipanggil', async () => {
    mockList();
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(false));

    render(<AnnouncementPage />);

    await screen.findByText('Jadwal UTS Semester Ganjil');
    fireEvent.click(screen.getAllByText('Nonaktifkan')[0]);

    expect(mockedApi.deleteAnnouncement).not.toHaveBeenCalled();
  });

  it('nonaktifkan gagal → pesan error API', async () => {
    mockList();
    mockedApi.deleteAnnouncement.mockRejectedValue({ message: 'Gagal hapus' });
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));

    render(<AnnouncementPage />);

    await screen.findByText('Jadwal UTS Semester Ganjil');
    fireEvent.click(screen.getAllByText('Nonaktifkan')[0]);

    expect(await screen.findByText('Gagal hapus')).toBeInTheDocument();
  });

  it('edit → uncheck target role → updateAnnouncement tanpa role tsb', async () => {
    mockList();
    mockedApi.updateAnnouncement.mockResolvedValue(ANNOUNCEMENTS[0]);

    render(<AnnouncementPage />);

    await screen.findByText('Jadwal UTS Semester Ganjil');
    fireEvent.click(screen.getAllByText('Edit')[0]);

    // Mahasiswa & Dosen ter-check dari data; uncheck Mahasiswa
    fireEvent.click(screen.getByLabelText('Mahasiswa'));

    fireEvent.click(screen.getByRole('button', { name: 'Update' }));

    await waitFor(() => {
      expect(mockedApi.updateAnnouncement).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ targetRoles: ['dosen'] }),
      );
    });
  });

  it('submit gagal tanpa message → fallback pesan default', async () => {
    mockList();
    mockedApi.createAnnouncement.mockRejectedValue({ code: 'INTERNAL' } as never);

    render(<AnnouncementPage />);

    await screen.findByText('Jadwal UTS Semester Ganjil');
    fireEvent.change(screen.getByPlaceholderText('Contoh: Jadwal UTS Semester Ganjil'), {
      target: { value: 'X' },
    });
    fireEvent.change(screen.getByPlaceholderText('Isi informasi lengkap di sini...'), {
      target: { value: 'Y' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));

    expect(await screen.findByText('Gagal menyimpan informasi penting')).toBeInTheDocument();
  });

  it('nonaktifkan gagal tanpa message → fallback pesan default', async () => {
    mockList();
    mockedApi.deleteAnnouncement.mockRejectedValue({ code: 'INTERNAL' } as never);
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));

    render(<AnnouncementPage />);

    await screen.findByText('Jadwal UTS Semester Ganjil');
    fireEvent.click(screen.getAllByText('Nonaktifkan')[0]);

    expect(await screen.findByText('Gagal menonaktifkan informasi penting')).toBeInTheDocument();
  });

  it('edit announcement + expiresAt terisi → form & submit benar', async () => {
    const withExpiry = {
      ...ANNOUNCEMENTS[0],
      expiresAt: '2026-09-01T00:00:00Z',
    };
    mockList([withExpiry]);
    mockedApi.updateAnnouncement.mockResolvedValue(withExpiry);

    render(<AnnouncementPage />);

    await screen.findByText('Jadwal UTS Semester Ganjil');
    fireEvent.click(screen.getAllByText('Edit')[0]);

    // expiresAt tampil di input datetime-local dalam waktu LOKAL (bukan slice UTC mentah)
    const d = new Date('2026-09-01T00:00:00Z');
    const pad = (n: number): string => String(n).padStart(2, '0');
    const expectedLocal = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    expect(screen.getByDisplayValue(expectedLocal)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Update' }));

    await waitFor(() => {
      expect(mockedApi.updateAnnouncement).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ targetRoles: ['mahasiswa', 'dosen'] }),
      );
    });
  });

  it('role tidak dikenal di tabel → fallback ke kode role', async () => {
    mockList([{ ...ANNOUNCEMENTS[0], targetRoles: ['staf_baru'] }, ANNOUNCEMENTS[1]]);

    render(<AnnouncementPage />);

    expect(await screen.findByText('Jadwal UTS Semester Ganjil')).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getByText('staf_baru')).toBeInTheDocument();
  });

  it('tabel dengan expiresAt terisi → tanggal ditampilkan', async () => {
    mockList([{ ...ANNOUNCEMENTS[0], expiresAt: '2026-09-01T00:00:00Z' }, ANNOUNCEMENTS[1]]);

    render(<AnnouncementPage />);

    expect(await screen.findByText('Jadwal UTS Semester Ganjil')).toBeInTheDocument();
    // Tanggal 1 September 2026 dalam locale id-ID (jam ikut ditampilkan, jadi pakai regex)
    expect(screen.getByText(/1\/9\/2026/)).toBeInTheDocument();
  });
});
