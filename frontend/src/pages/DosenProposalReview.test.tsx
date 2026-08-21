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

  it('render — hanya proposal yang diampu dosen login', async () => {
    render(<DosenProposalReview />);
    expect(await screen.findByText('Sistem Informasi Akademik Berbasis Web')).toBeInTheDocument();
    // Proposal dosen lain tidak tampil
    expect(screen.queryByText('Proposal Dosen Lain')).not.toBeInTheDocument();
    // Header card "Pengajuan Proposal" dihapus — judul proposal sudah menjadi penanda render
    // Status actionable → tombol Setujui/Tolak tampil
    expect(screen.getByRole('button', { name: 'Setujui' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tolak' })).toBeInTheDocument();
  });

  it('expand card — lampiran PDF + riwayat status (tanpa grid detail)', async () => {
    const user = userEvent.setup();
    render(<DosenProposalReview />);
    await screen.findByText('Sistem Informasi Akademik Berbasis Web');

    await user.click(screen.getByText('Sistem Informasi Akademik Berbasis Web'));
    // Lampiran
    expect(await screen.findByText('Lampiran Proposal')).toBeInTheDocument();
    expect(screen.getByText('Lihat Proposal (PDF)')).toBeInTheDocument();
    expect(screen.getByText('Unduh')).toBeInTheDocument();
    // Riwayat status dimuat
    expect(await screen.findByText('Riwayat Status')).toBeInTheDocument();
    expect(screen.getByText('Proposal diajukan oleh mahasiswa')).toBeInTheDocument();
    // Grid detail & dosen pembimbing sudah dihapus dari detail
    expect(screen.queryByText('Program Studi')).not.toBeInTheDocument();
    expect(screen.queryByText('Dosen Pembimbing')).not.toBeInTheDocument();
  });

  it('klik Setujui → PUT ke endpoint update + status berubah lokal', async () => {
    const user = userEvent.setup();
    render(<DosenProposalReview />);
    await screen.findByText('Sistem Informasi Akademik Berbasis Web');

    await user.click(screen.getByRole('button', { name: 'Setujui' }));

    // PUT dipanggil dengan status berikutnya (diajukan → dilihat_dosen)
    await vi.waitFor(() => {
      const putCall = fetchMock.mock.calls.find(
        ([u]) => String(u).includes('/skripsi/proposals/1') && !String(u).includes('statuses'),
      );
      expect(putCall).toBeTruthy();
    });
    expect((await screen.findAllByText('Dilihat Dosen')).length).toBeGreaterThanOrEqual(1); // badge baru
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
