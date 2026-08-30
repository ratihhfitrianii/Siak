import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DosenProposalReview } from './DosenProposalReview';
import type { SkripsiProposal } from '../lib/types';

vi.setConfig({ testTimeout: 20_000 });

// Mock useAuth — dosen login dengan id 4
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: { id: 4, fullName: 'Dosen TI 1' } }),
}));

function jsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

const PROPOSALS: SkripsiProposal[] = [
  {
    id: 1,
    studentId: 101,
    supervisorId: 4,
    supervisorName: '',
    supervisorEmail: '',
    nim: '20241671',
    studentStatus: 'aktif',
    studentName: 'Muhammad Husni',
    studentEmail: 'husni@example.id',
    prodiName: 'Teknik Informatika',
    title: 'Sistem Informasi Akademik Berbasis Web',
    proposalFile: 'data:application/pdf;base64,JVBERi0=',
    status: 'diajukan',
    statusNotes: null,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: '2026-08-20T13:47:45.373Z',
    updatedAt: '2026-08-20T13:47:45.373Z',
    supervisors: [
      {
        id: 4,
        fullName: 'Dosen TI 1',
        nidn: '198001002',
        nik: '',
        prodiName: 'TI',
        isPrimary: true,
      },
    ],
  },
  {
    id: 2,
    studentId: 102,
    supervisorId: 9,
    supervisorName: '',
    supervisorEmail: '',
    nim: '20241672',
    studentStatus: 'aktif',
    studentName: 'Ani Lain',
    studentEmail: 'ani@example.id',
    prodiName: 'Teknik Informatika',
    title: 'Proposal Dosen Lain',
    proposalFile: null,
    status: 'diajukan',
    statusNotes: null,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: '2026-08-19T10:00:00.000Z',
    updatedAt: '2026-08-19T10:00:00.000Z',
    supervisors: [{ id: 9, fullName: 'Dosen Lain', nidn: '199001001', nik: '', prodiName: 'TI' }],
  },
];

const HISTORY = [
  {
    id: 1,
    proposalId: 1,
    status: 'diajukan',
    notes: 'Proposal diajukan oleh mahasiswa',
    changedBy: 101,
    changedByName: 'Muhammad Husni',
    changedAt: '2026-08-20T13:47:45.373Z',
  },
];

describe('DosenProposalReview', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    fetchMock.mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes('/statuses')) {
        return Promise.resolve(jsonResponse({ success: true, data: HISTORY }));
      }
      return Promise.resolve(jsonResponse({ success: true, data: PROPOSALS }));
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('render — hanya proposal yang diampu dosen login + penanda Detail di baris', async () => {
    render(<DosenProposalReview />);
    expect(await screen.findByText('Sistem Informasi Akademik Berbasis Web')).toBeInTheDocument();
    // Proposal dosen lain tidak tampil
    expect(screen.queryByText('Proposal Dosen Lain')).not.toBeInTheDocument();
    // Setujui/Tolak TIDAK tampil sebelum card dibuka
    expect(screen.queryByRole('button', { name: 'Setujui' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tolak' })).not.toBeInTheDocument();
    // Penanda Detail tersedia di baris
    expect(screen.getByText('Detail')).toBeInTheDocument();
  });

  it('pencarian — filter judul/NIM/nama/prodi secara klien-side', async () => {
    const user = userEvent.setup();
    render(<DosenProposalReview />);
    await screen.findByText('Sistem Informasi Akademik Berbasis Web');

    const searchBox = screen.getByPlaceholderText(/Cari judul/i);
    await user.type(searchBox, 'husni');
    // Nama cocok → tetap tampil
    expect(screen.getByText('Sistem Informasi Akademik Berbasis Web')).toBeInTheDocument();

    await user.clear(searchBox);
    await user.type(searchBox, 'tidak-adalah-kata-ini');
    expect(screen.getByText(/Tidak ada proposal yang cocok dengan pencarian/)).toBeInTheDocument();
  });

  it('buka detail (expand) → aksi Setujui/Tolak DI ATAS grid lampiran + riwayat', async () => {
    const user = userEvent.setup();
    render(<DosenProposalReview />);
    await screen.findByText('Sistem Informasi Akademik Berbasis Web');

    // Buka detail dengan klik header card
    await user.click(screen.getByText('Sistem Informasi Akademik Berbasis Web'));

    // Aksi Setujui/Tolak muncul SEBELUM lampiran dalam struktur DOM
    const setujuiBtn = screen.getByRole('button', { name: 'Setujui' });
    const tolakBtn = screen.getByRole('button', { name: 'Tolak' });
    const lampiran = screen.getByText('Lampiran Proposal');
    expect(setujuiBtn.compareDocumentPosition(lampiran) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    void tolakBtn;

    // Lampiran + riwayat tetap tampil di detail
    expect(screen.getByText('Lihat Proposal (PDF)')).toBeInTheDocument();
    expect(await screen.findByText('Riwayat Status')).toBeInTheDocument();
    expect(screen.getByText('Proposal diajukan oleh mahasiswa')).toBeInTheDocument();
  });

  it('klik Setujui di detail terbuka → PUT endpoint update + semua tombol hilang (tunggu admin)', async () => {
    const user = userEvent.setup();
    render(<DosenProposalReview />);
    await screen.findByText('Sistem Informasi Akademik Berbasis Web');

    // Tidak ada popup — detail adalah expand inline
    await user.click(screen.getByText('Sistem Informasi Akademik Berbasis Web'));
    await user.click(screen.getByRole('button', { name: 'Setujui' }));

    // PUT dipanggil dengan status berikutnya (diajukan → dilihat_dosen)
    await vi.waitFor(() => {
      const putCall = fetchMock.mock.calls.find(
        ([u]) => String(u).includes('/skripsi/proposals/1') && !String(u).includes('statuses'),
      );
      expect(putCall).toBeTruthy();
    });
    expect((await screen.findAllByText('Dilihat Dosen')).length).toBeGreaterThanOrEqual(1);
    // Semua tombol aksi HILANG setelah keputusan — dosen tidak bisa klik lagi,
    // lanjut ke bimbingan menunggu persetujuan admin akademik
    expect(screen.queryByRole('button', { name: 'Setujui' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tolak' })).not.toBeInTheDocument();
    expect(screen.getByText(/Menunggu persetujuan admin akademik/)).toBeInTheDocument();
  });

  it('kosong — pesan empty state', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ success: true, data: [] })));
    render(<DosenProposalReview />);
    expect(await screen.findByText('Belum ada proposal')).toBeInTheDocument();
  });

  it('fetch gagal — pesan error', async () => {
    fetchMock.mockImplementation(() => Promise.reject(new Error('network down')));
    render(<DosenProposalReview />);
    expect(await screen.findByText('Gagal memuat daftar proposal')).toBeInTheDocument();
  });
});
