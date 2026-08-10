import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KrsPage } from './KrsPage';
import type { AvailableClass, KrsPeriod, MyKrs } from '../lib/types';

function jsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

const PERIOD: KrsPeriod = {
  id: 1,
  semesterId: 2,
  semesterCode: '2024/2025-1',
  name: 'Ganjil 2024/2025',
  startDate: '2024-08-01',
  endDate: '2024-09-30',
  isRevision: false,
  status: 'open',
};

const MY_DRAFT: MyKrs = {
  submissionId: 10,
  status: 'draft',
  isLocked: false,
  submittedAt: null,
  rejectionReason: null,
  totalCredits: 3,
  items: [
    {
      id: 101,
      classCode: 'A',
      course: { code: 'MAT1', name: 'Matematika Dasar', credits: 3 },
      dayOfWeek: 1,
      startTime: '08:00:00',
      endTime: '09:40:00',
      room: 'R.101',
    },
  ],
};

const AVAILABLE: AvailableClass[] = [
  {
    id: 101,
    classCode: 'A',
    capacity: 40,
    currentEnrolled: 20,
    quotaLeft: 20,
    room: 'R.101',
    dayOfWeek: 1,
    startTime: '08:00:00',
    endTime: '09:40:00',
    course: { code: 'MAT1', name: 'Matematika Dasar', credits: 3 },
    isMandatory: true,
    semesterNumber: 1,
  },
  {
    id: 102,
    classCode: 'B',
    capacity: 40,
    currentEnrolled: 30,
    quotaLeft: 10,
    room: 'R.102',
    dayOfWeek: 3,
    startTime: '10:00:00',
    endTime: '11:40:00',
    course: { code: 'FIS1', name: 'Fisika Dasar', credits: 4 },
    isMandatory: false,
    semesterNumber: 1,
  },
];

interface KrsMocks {
  period?: KrsPeriod;
  my?: MyKrs;
  available?: AvailableClass[];
  onDraft?: (body: unknown) => void;
  onSubmit?: (body: unknown) => void;
}

/** Mock fetch yang merutekan endpoint KRS; POST draft/submit dicatat untuk asersi. */
function mockKrsRoutes({
  period = PERIOD,
  my = MY_DRAFT,
  available = AVAILABLE,
  onDraft,
  onSubmit,
}: KrsMocks = {}) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (method === 'POST' && String(url).includes('/krs/draft')) {
      onDraft?.(JSON.parse(String(init?.body)));
      return Promise.resolve(
        jsonResponse({
          success: true,
          data: { submissionId: 10, status: 'draft', message: 'Draft tersimpan' },
        }),
      );
    }
    if (method === 'POST' && String(url).includes('/krs/submit')) {
      onSubmit?.(JSON.parse(String(init?.body)));
      return Promise.resolve(
        jsonResponse({
          success: true,
          data: { submissionId: 10, status: 'submitted', locked: true },
        }),
      );
    }
    if (String(url).includes('/krs/period')) {
      return Promise.resolve(jsonResponse({ success: true, data: period }));
    }
    if (String(url).includes('/krs/my')) {
      return Promise.resolve(jsonResponse({ success: true, data: my }));
    }
    if (String(url).includes('/krs/available-classes')) {
      return Promise.resolve(
        jsonResponse({
          success: true,
          data: { period: { id: period.id, name: period.name }, items: available },
        }),
      );
    }
    return Promise.resolve(jsonResponse({ success: true, data: null }));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('KrsPage (T1.11b)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('menampilkan periode, kelas terpilih, dan kelas tersedia', async () => {
    mockKrsRoutes();
    render(<KrsPage />);

    expect(await screen.findByText('Kartu Rencana Studi')).toBeInTheDocument();
    expect(screen.getByText('Periode Buka')).toBeInTheDocument();
    expect(screen.getByText('Ganjil 2024/2025')).toBeInTheDocument();
    // kelas terpilih dari draft + total SKS (scope: section Kelas terpilih — '3' ambigu di tabel)
    const pickedSection = screen.getByLabelText('Kelas terpilih');
    expect(within(pickedSection).getByText(/Matematika Dasar/)).toBeInTheDocument();
    expect(within(pickedSection).getByText('3')).toBeInTheDocument();
    // kelas tersedia
    expect(screen.getByText('Fisika Dasar')).toBeInTheDocument();
  });

  it('tambah kelas → masuk kelas terpilih dan total SKS bertambah', async () => {
    const user = userEvent.setup();
    mockKrsRoutes();
    render(<KrsPage />);

    await screen.findByText('Fisika Dasar');
    // MAT1 sudah 'Dipilih' (dari draft) → hanya 1 tombol Tambah tersisa (FIS1)
    const addButtons = screen.getAllByRole('button', { name: 'Tambah' });
    await user.click(addButtons[0]);

    expect(await screen.findAllByRole('button', { name: 'Dipilih' })).toHaveLength(2);
    // total SKS: MAT1 (3) + FIS1 (4) = 7
    const pickedSection = screen.getByLabelText('Kelas terpilih');
    expect(within(pickedSection).getByText('7')).toBeInTheDocument();
  });

  it('hapus kelas → hilang dari terpilih dan SKS turun', async () => {
    const user = userEvent.setup();
    mockKrsRoutes();
    render(<KrsPage />);

    const pickedSection = await screen.findByLabelText('Kelas terpilih');
    const removeBtn = await within(pickedSection).findByRole('button', { name: 'Hapus' });
    await user.click(removeBtn);

    expect(within(pickedSection).queryByText(/Matematika Dasar/)).not.toBeInTheDocument();
    expect(
      screen.getByText('Belum ada kelas. Pilih dari daftar kelas tersedia di bawah.'),
    ).toBeInTheDocument();
  });

  it('simpan draft → POST /krs/draft dengan classIds terpilih', async () => {
    const user = userEvent.setup();
    const onDraft = vi.fn();
    mockKrsRoutes({ onDraft });
    render(<KrsPage />);

    await user.click(await screen.findByRole('button', { name: 'Simpan Draft' }));

    await vi.waitFor(() => expect(onDraft).toHaveBeenCalledTimes(1));
    expect(onDraft).toHaveBeenCalledWith({ classIds: [101] });
  });

  it('submit → konfirmasi dialog → POST /krs/submit', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    mockKrsRoutes({ onSubmit });
    render(<KrsPage />);

    await user.click(await screen.findByRole('button', { name: 'Submit KRS' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Submit KRS?');

    await user.click(screen.getByRole('button', { name: 'Ya, Submit' }));

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({ classIds: [101] });
  });

  it('status submitted (terkunci) → tombol edit nonaktif', async () => {
    mockKrsRoutes({
      my: {
        ...MY_DRAFT,
        status: 'submitted',
        isLocked: true,
        submittedAt: '2024-08-10T08:00:00Z',
        items: MY_DRAFT.items,
      },
    });
    render(<KrsPage />);

    expect(await screen.findByText('KRS terkunci — tidak dapat diubah lagi.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Simpan Draft' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Submit KRS' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Hapus' })).toBeDisabled();
  });

  it('status approved → tombol Download PDF KRS muncul (keluhan lama)', async () => {
    mockKrsRoutes({
      my: {
        ...MY_DRAFT,
        status: 'approved',
        isLocked: true,
        submittedAt: '2024-08-10T08:00:00Z',
        items: MY_DRAFT.items,
      },
    });
    render(<KrsPage />);

    expect(await screen.findByRole('button', { name: 'Download PDF' })).toBeInTheDocument();
  });

  it('status submitted → tombol Download PDF TIDAK muncul (PDF hanya utk approved, keluhan lama)', async () => {
    mockKrsRoutes({
      my: {
        ...MY_DRAFT,
        status: 'submitted',
        isLocked: true,
        submittedAt: '2024-08-10T08:00:00Z',
        items: MY_DRAFT.items,
      },
    });
    render(<KrsPage />);

    expect(await screen.findByText('Simpan Draft')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Download PDF' })).not.toBeInTheDocument();
  });

  it('status draft → tombol Download PDF tidak muncul', async () => {
    mockKrsRoutes({ my: MY_DRAFT });
    render(<KrsPage />);

    expect(await screen.findByText('Simpan Draft')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Download PDF' })).not.toBeInTheDocument();
  });

  it('periode tutup → banner informasi dan tidak ada kelas tersedia', async () => {
    mockKrsRoutes({ period: { ...PERIOD, status: 'closed' }, available: [] });
    render(<KrsPage />);

    expect(await screen.findByText('Periode KRS sedang tutup.')).toBeInTheDocument();
    expect(
      screen.getByText('Pengisian KRS hanya dapat dilakukan saat periode KRS sedang buka.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Tidak ada kelas tersedia untuk prodi Anda pada periode ini.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Simpan Draft' })).toBeDisabled();
  });

  it('error muat data → pesan error + tombol coba lagi', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    render(<KrsPage />);

    expect(await screen.findByText('Gagal memuat data KRS')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Coba lagi' })).toBeInTheDocument();
  });
});
