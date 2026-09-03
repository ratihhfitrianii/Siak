import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DosenBimbinganBerjalan } from './DosenBimbinganBerjalan';
import * as api from '../lib/api';
import type { SkripsiProposal, SkripsiGuidanceLog } from '../lib/types';

vi.setConfig({ testTimeout: 20_000 });

// Mock useAuth — dosen login dengan id 4
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: { id: 4, fullName: 'Dosen TI 1' } }),
}));

// Mock API module (bukan driver fetch global).
vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    getSkripsiProposals: vi.fn(),
    createSkripsiGuidanceLog: vi.fn(),
    getSkripsiGuidanceLogs: vi.fn(),
    updateSkripsiProposal: vi.fn(),
  };
});

const mockedApi = vi.mocked(api);

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

const MANY_LOGS: SkripsiGuidanceLog[] = Array.from({ length: 6 }, (_, i) => ({
  id: i + 1,
  proposalId: 1,
  lecturerId: 4,
  lecturerName: 'Dosen TI 1',
  sessionDate: `2026-08-${String(i + 1).padStart(2, '0')}`,
  notes: `Catatan pertemuan ke-${i + 1}`,
  createdAt: `2026-08-${String(i + 1).padStart(2, '0')}T08:00:00Z`,
}));

describe('DosenBimbinganBerjalan', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedApi.getSkripsiProposals.mockResolvedValue(PROPOSALS);
    mockedApi.createSkripsiGuidanceLog.mockResolvedValue({ id: 100 });
    mockedApi.getSkripsiGuidanceLogs.mockResolvedValue([]);
    mockedApi.updateSkripsiProposal.mockResolvedValue({
      ...PROPOSALS[0],
      status: 'siap_sidang',
    } as SkripsiProposal);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('render — hanya proposal yang diampu & berstatus aktif', async () => {
    render(<DosenBimbinganBerjalan />);
    expect(await screen.findByText('Sistem Informasi Akademik Berbasis Web')).toBeInTheDocument();
    // Proposal dosen lain (status diajukan) tidak tampil
    expect(screen.queryByText('Proposal Dosen Lain')).not.toBeInTheDocument();
    // Proposal berstatus lulus juga tidak tampil (bukan dalam_bimbingan/siap_sidang)
    expect(screen.queryByText('Proposal Lulus')).not.toBeInTheDocument();
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

  it('collapse — klik judul dua kali menutup detail', async () => {
    const user = userEvent.setup();
    render(<DosenBimbinganBerjalan />);
    await screen.findByText('Sistem Informasi Akademik Berbasis Web');

    await user.click(screen.getByText('Sistem Informasi Akademik Berbasis Web'));
    expect(await screen.findByText('Lihat Log')).toBeInTheDocument();
    // Saat terbuka, judul tampil 2x (header + blok Judul Proposal) — klik yang pertama
    await user.click(screen.getAllByText('Sistem Informasi Akademik Berbasis Web')[0]);
    expect(screen.queryByText('Lihat Log')).not.toBeInTheDocument();
  });

  it('kosong — pesan empty state', async () => {
    mockedApi.getSkripsiProposals.mockResolvedValue([]);
    render(<DosenBimbinganBerjalan />);
    expect(await screen.findByText('Belum ada bimbingan berjalan')).toBeInTheDocument();
  });

  it('fetch gagal — pesan error', async () => {
    mockedApi.getSkripsiProposals.mockRejectedValue(new Error('network down'));
    render(<DosenBimbinganBerjalan />);
    expect(await screen.findByText('Gagal memuat daftar bimbingan berjalan')).toBeInTheDocument();
  });

  it('Catat Bimbingan — buka modal, isi tanggal & catatan, submit sukses', async () => {
    const user = userEvent.setup();
    render(<DosenBimbinganBerjalan />);
    await screen.findByText('Sistem Informasi Akademik Berbasis Web');

    await user.click(screen.getByText('Sistem Informasi Akademik Berbasis Web'));
    await user.click(await screen.findByRole('button', { name: /Catat Bimbingan/ }));

    const dialog = screen.getByRole('dialog', { name: 'Catat Bimbingan' });
    expect(dialog).toBeInTheDocument();
    // tanggal default terisi hari ini (YYYY-MM-DD)
    const today = new Date().toISOString().slice(0, 10);
    expect(screen.getByLabelText('Tanggal Bimbingan')).toHaveValue(today);

    await user.clear(screen.getByLabelText('Tanggal Bimbingan'));
    await user.type(screen.getByLabelText('Tanggal Bimbingan'), '2026-09-10');
    await user.type(screen.getByLabelText('Catatan'), 'Revisi bab 3 disetujui');

    await user.click(screen.getByRole('button', { name: 'Simpan Catatan' }));

    expect(await screen.findByText('Catatan bimbingan berhasil disimpan')).toBeInTheDocument();
    expect(mockedApi.createSkripsiGuidanceLog).toHaveBeenCalledWith(1, {
      sessionDate: '2026-09-10',
      notes: 'Revisi bab 3 disetujui',
    });
    // modal tetap terbuka; catatan direset
    expect(screen.getByRole('dialog', { name: 'Catat Bimbingan' })).toBeInTheDocument();
    expect(screen.getByLabelText('Catatan')).toHaveValue('');
  });

  it('Catat Bimbingan — validasi: tanpa tanggal & tanpa catatan', async () => {
    const user = userEvent.setup();
    render(<DosenBimbinganBerjalan />);
    await screen.findByText('Sistem Informasi Akademik Berbasis Web');

    await user.click(screen.getByText('Sistem Informasi Akademik Berbasis Web'));
    await user.click(await screen.findByRole('button', { name: /Catat Bimbingan/ }));

    // kosongkan tanggal
    await user.clear(screen.getByLabelText('Tanggal Bimbingan'));
    await user.click(screen.getByRole('button', { name: 'Simpan Catatan' }));
    expect(await screen.findByText('Tanggal bimbingan wajib diisi')).toBeInTheDocument();

    // isi tanggal, tanpa catatan
    await user.type(screen.getByLabelText('Tanggal Bimbingan'), '2026-09-10');
    await user.click(screen.getByRole('button', { name: 'Simpan Catatan' }));
    expect(await screen.findByText('Catatan bimbingan wajib diisi')).toBeInTheDocument();

    expect(mockedApi.createSkripsiGuidanceLog).not.toHaveBeenCalled();
  });

  it('Catat Bimbingan — submit gagal menampilkan error', async () => {
    const user = userEvent.setup();
    mockedApi.createSkripsiGuidanceLog.mockRejectedValue(new Error('server down'));
    render(<DosenBimbinganBerjalan />);
    await screen.findByText('Sistem Informasi Akademik Berbasis Web');

    await user.click(screen.getByText('Sistem Informasi Akademik Berbasis Web'));
    await user.click(await screen.findByRole('button', { name: /Catat Bimbingan/ }));
    await user.type(screen.getByLabelText('Catatan'), 'catatan x');
    await user.click(screen.getByRole('button', { name: 'Simpan Catatan' }));

    expect(await screen.findByText('Gagal menyimpan catatan bimbingan')).toBeInTheDocument();
  });

  it('Tutup modal Catat Bimbingan — menutup tanpa submit', async () => {
    const user = userEvent.setup();
    render(<DosenBimbinganBerjalan />);
    await screen.findByText('Sistem Informasi Akademik Berbasis Web');

    await user.click(screen.getByText('Sistem Informasi Akademik Berbasis Web'));
    await user.click(await screen.findByRole('button', { name: /Catat Bimbingan/ }));
    await user.click(screen.getByRole('button', { name: 'Tutup' }));

    expect(screen.queryByRole('dialog', { name: 'Catat Bimbingan' })).not.toBeInTheDocument();
    expect(mockedApi.createSkripsiGuidanceLog).not.toHaveBeenCalled();
  });

  it('Lihat Log — kosong menampilkan pesan empty', async () => {
    const user = userEvent.setup();
    mockedApi.getSkripsiGuidanceLogs.mockResolvedValue([]);
    render(<DosenBimbinganBerjalan />);
    await screen.findByText('Sistem Informasi Akademik Berbasis Web');

    await user.click(screen.getByText('Sistem Informasi Akademik Berbasis Web'));
    await user.click(await screen.findByRole('button', { name: 'Lihat Log' }));

    expect(await screen.findByText('Belum ada catatan bimbingan.')).toBeInTheDocument();
    expect(mockedApi.getSkripsiGuidanceLogs).toHaveBeenCalledWith(1);
  });

  it('Lihat Log — menampilkan daftar log', async () => {
    const user = userEvent.setup();
    mockedApi.getSkripsiGuidanceLogs.mockResolvedValue([
      {
        id: 7,
        proposalId: 1,
        lecturerId: 4,
        lecturerName: 'Dosen TI 1',
        sessionDate: '2026-08-15',
        notes: 'Bimbingan proposal bab 1',
        createdAt: '2026-08-15T08:00:00Z',
      },
    ]);
    render(<DosenBimbinganBerjalan />);
    await screen.findByText('Sistem Informasi Akademik Berbasis Web');

    await user.click(screen.getByText('Sistem Informasi Akademik Berbasis Web'));
    await user.click(await screen.findByRole('button', { name: 'Lihat Log' }));

    expect(await screen.findByText('Bimbingan proposal bab 1')).toBeInTheDocument();
  });

  it('Lihat Log — fetch gagal menampilkan error', async () => {
    const user = userEvent.setup();
    mockedApi.getSkripsiGuidanceLogs.mockRejectedValue(new Error('network down'));
    render(<DosenBimbinganBerjalan />);
    await screen.findByText('Sistem Informasi Akademik Berbasis Web');

    await user.click(screen.getByText('Sistem Informasi Akademik Berbasis Web'));
    await user.click(await screen.findByRole('button', { name: 'Lihat Log' }));

    expect(await screen.findByText('Gagal memuat log bimbingan')).toBeInTheDocument();
  });

  it('Izinkan Sidang — fetch log > 5, konfirmasi → update status siap_sidang', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.fn(() => true);
    vi.stubGlobal('confirm', confirmSpy);
    mockedApi.getSkripsiGuidanceLogs.mockResolvedValue(MANY_LOGS);

    render(<DosenBimbinganBerjalan />);
    await screen.findByText('Sistem Informasi Akademik Berbasis Web');

    await user.click(screen.getByText('Sistem Informasi Akademik Berbasis Web'));
    await user.click(await screen.findByRole('button', { name: 'Lihat Log' }));
    await screen.findAllByText(/Catatan pertemuan ke-/);

    await user.click(screen.getByRole('button', { name: 'Izinkan Sidang' }));
    expect(confirmSpy).toHaveBeenCalledWith('Izinkan mahasiswa untuk sidang?');
    await waitFor(() =>
      expect(mockedApi.updateSkripsiProposal).toHaveBeenCalledWith(1, {
        status: 'siap_sidang',
      }),
    );
    // modal tertutup & loadProposals dipanggil ulang
    expect(screen.queryByRole('dialog', { name: 'Log Bimbingan' })).not.toBeInTheDocument();
  });

  it('Izinkan Sidang — konfirmasi dibatalkan tidak mengupdate status', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'confirm',
      vi.fn(() => false),
    );
    mockedApi.getSkripsiGuidanceLogs.mockResolvedValue(MANY_LOGS);

    render(<DosenBimbinganBerjalan />);
    await screen.findByText('Sistem Informasi Akademik Berbasis Web');

    await user.click(screen.getByText('Sistem Informasi Akademik Berbasis Web'));
    await user.click(await screen.findByRole('button', { name: 'Lihat Log' }));
    await screen.findAllByText(/Catatan pertemuan ke-/);

    await user.click(screen.getByRole('button', { name: 'Izinkan Sidang' }));
    expect(mockedApi.updateSkripsiProposal).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Log Bimbingan' })).toBeInTheDocument();
  });

  it('Tutup modal Log Bimbingan — menutup', async () => {
    const user = userEvent.setup();
    render(<DosenBimbinganBerjalan />);
    await screen.findByText('Sistem Informasi Akademik Berbasis Web');

    await user.click(screen.getByText('Sistem Informasi Akademik Berbasis Web'));
    await user.click(await screen.findByRole('button', { name: 'Lihat Log' }));
    await screen.findByText('Belum ada catatan bimbingan.');

    await user.click(screen.getByRole('button', { name: 'Tutup' }));
    expect(screen.queryByRole('dialog', { name: 'Log Bimbingan' })).not.toBeInTheDocument();
  });

  it('buka modal dengan file proposal — link PDF tampil', async () => {
    const user = userEvent.setup();
    render(<DosenBimbinganBerjalan />);
    await screen.findByText('Sistem Informasi Akademik Berbasis Web');

    await user.click(screen.getByText('Sistem Informasi Akademik Berbasis Web'));
    expect(await screen.findByText('Lihat Proposal (PDF)')).toBeInTheDocument();
    expect(screen.getByText('Lihat Proposal (PDF)')).toHaveAttribute(
      'href',
      'data:application/pdf;base64,JVBERi0=',
    );
  });
});
