import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DosenBimbinganBerjalan } from './DosenBimbinganBerjalan';
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
    status: 'dalam_bimbingan',
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
      {
        id: 5,
        fullName: 'Dosen TI 2',
        nidn: '198002003',
        nik: '',
        prodiName: 'TI',
        isPrimary: false,
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

describe('DosenBimbinganBerjalan', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    fetchMock.mockImplementation(() =>
      Promise.resolve(jsonResponse({ success: true, data: PROPOSALS })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('render — hanya proposal yang diampu & berstatus aktif', async () => {
    render(<DosenBimbinganBerjalan />);
    // Proposal 1 (supervisor id 4, dalam_bimbingan) tampil
    expect(await screen.findByText('Sistem Informasi Akademik Berbasis Web')).toBeInTheDocument();
    // Proposal 2 (dosen lain + status diajukan) tidak tampil
    expect(screen.queryByText('Proposal Dosen Lain')).not.toBeInTheDocument();
    expect(screen.getByText('Bimbingan Berjalan')).toBeInTheDocument();
  });

  it('expand card — detail mahasiswa + pembimbing + tombol aksi', async () => {
    const user = userEvent.setup();
    render(<DosenBimbinganBerjalan />);
    await screen.findByText('Sistem Informasi Akademik Berbasis Web');

    await user.click(screen.getByText('Sistem Informasi Akademik Berbasis Web'));
    expect((await screen.findAllByText('Muhammad Husni')).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('husni@example.id')).toBeInTheDocument();
    // Pembimbing utama bertanda bintang
    expect(screen.getByText(/Dosen TI 1 \(198001002\) ⭐/)).toBeInTheDocument();
    expect(screen.getByText('Catat Bimbingan')).toBeInTheDocument();
    expect(screen.getByText('Lihat Log')).toBeInTheDocument();
  });

  it('kosong — pesan empty state', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ success: true, data: [] })));
    render(<DosenBimbinganBerjalan />);
    expect(await screen.findByText('Belum ada bimbingan berjalan')).toBeInTheDocument();
  });

  it('fetch gagal — pesan error', async () => {
    fetchMock.mockImplementation(() => Promise.reject(new Error('network down')));
    render(<DosenBimbinganBerjalan />);
    expect(await screen.findByText('Gagal memuat daftar bimbingan berjalan')).toBeInTheDocument();
  });
});
