import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KaprodiScheduleReview } from './KaprodiScheduleReview';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    listScheduleSubmissions: vi.fn(),
    reviewScheduleSubmission: vi.fn(),
  };
});

import { listScheduleSubmissions, reviewScheduleSubmission } from '../lib/api';

const ITEMS = [
  {
    id: 1,
    lecturerId: 4,
    semesterId: 5,
    status: 'awaiting' as const,
    submittedAt: '2026-09-01T08:00:00Z',
    reviewedAt: null,
    reviewNote: null,
    semesterCode: '2026-1',
    semesterName: 'Ganjil 2026/2027',
    reviewerName: null,
    lecturerName: 'Dosen A',
    lecturerEmail: 'a@kampus.ac.id',
    totalClasses: 3,
  },
  {
    id: 2,
    lecturerId: 5,
    semesterId: 5,
    status: 'approved' as const,
    submittedAt: '2026-08-30T08:00:00Z',
    reviewedAt: '2026-08-31T08:00:00Z',
    reviewNote: null,
    semesterCode: '2026-1',
    semesterName: 'Ganjil 2026/2027',
    reviewerName: 'Kaprodi TI',
    lecturerName: 'Dosen B',
    lecturerEmail: 'b@kampus.ac.id',
    totalClasses: 2,
  },
];

describe('KaprodiScheduleReview — Persetujuan Jadwal Kaprodi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listScheduleSubmissions).mockResolvedValue([...ITEMS]);
  });

  it('menampilkan daftar pengajuan dosen + status', async () => {
    render(<KaprodiScheduleReview />);

    await waitFor(() => expect(screen.getByText('Dosen A')).toBeInTheDocument());
    expect(screen.getByText('Dosen B')).toBeInTheDocument();
    expect(screen.getAllByText('Menunggu').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Disetujui').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Ganjil 2026/2027').length).toBeGreaterThanOrEqual(2);
  });

  it('klik Setujui → reviewScheduleSubmission(1, approved) + reload', async () => {
    const user = userEvent.setup();
    vi.mocked(reviewScheduleSubmission).mockResolvedValue({
      id: 1,
      status: 'approved',
      message: 'Pengajuan jadwal disetujui',
    });
    render(<KaprodiScheduleReview />);
    await waitFor(() => expect(screen.getByText('Dosen A')).toBeInTheDocument());

    const approveButtons = screen.getAllByRole('button', { name: 'Setujui' });
    await user.click(approveButtons[0]);

    await waitFor(() =>
      expect(reviewScheduleSubmission).toHaveBeenCalledWith(1, 'approved', undefined),
    );
  });

  it('klik Tolak → wajib isi catatan → kirim rejected + note', async () => {
    const user = userEvent.setup();
    vi.mocked(reviewScheduleSubmission).mockResolvedValue({
      id: 1,
      status: 'rejected',
      message: 'Pengajuan jadwal ditolak',
    });
    render(<KaprodiScheduleReview />);
    await waitFor(() => expect(screen.getByText('Dosen A')).toBeInTheDocument());

    const rejectButtons = screen.getAllByRole('button', { name: 'Tolak' });
    await user.click(rejectButtons[0]);

    const dialog = await screen.findByRole('dialog');
    const textarea = within(dialog).getByRole('textbox');
    await user.type(textarea, 'Bentrok ruangan');
    await user.click(within(dialog).getByRole('button', { name: 'Tolak Pengajuan' }));

    await waitFor(() =>
      expect(reviewScheduleSubmission).toHaveBeenCalledWith(1, 'rejected', 'Bentrok ruangan'),
    );
  });

  it('filter status → listScheduleSubmissions dipanggil dengan status', async () => {
    const user = userEvent.setup();
    render(<KaprodiScheduleReview />);
    await waitFor(() => expect(screen.getByText('Dosen A')).toBeInTheDocument());

    // filter select - gunakan getByLabelText atau getByRole('combobox') dengan name
    const filterSelect = screen.getByRole('combobox', { name: /status/i });
    await user.selectOptions(filterSelect, 'approved');

    await waitFor(() => expect(listScheduleSubmissions).toHaveBeenCalledWith('approved'));
  });

  it('klik header kolom → urutan berubah (sort)', async () => {
    const user = userEvent.setup();
    render(<KaprodiScheduleReview />);
    await waitFor(() => expect(screen.getByText('Dosen A')).toBeInTheDocument());

    // Sort by Kelas (totalClasses) asc: Dosen B (2) lalu Dosen A (3)
    await user.click(screen.getByRole('button', { name: /Kelas/ }));
    const rows = screen.getAllByRole('row').slice(1); // skip header
    expect(rows[0]).toHaveTextContent('Dosen B');
    expect(rows[1]).toHaveTextContent('Dosen A');

    // Toggle → desc: Dosen A lalu Dosen B
    await user.click(screen.getByRole('button', { name: /Kelas/ }));
    const rowsDesc = screen.getAllByRole('row').slice(1);
    expect(rowsDesc[0]).toHaveTextContent('Dosen A');
    expect(rowsDesc[1]).toHaveTextContent('Dosen B');
  });

  it('ketik query → hanya baris cocok (search)', async () => {
    const user = userEvent.setup();
    render(<KaprodiScheduleReview />);
    await waitFor(() => expect(screen.getByText('Dosen A')).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText('Cari semua kolom...'), 'Dosen B');
    expect(screen.queryByText('Dosen A')).not.toBeInTheDocument();
    expect(screen.getByText('Dosen B')).toBeInTheDocument();
  });
});
